const { spawn } = require('child_process');
const EventEmitter = require('events');

class LucidLinkStatsWorker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.lucidCommand = options.lucidCommand || '/usr/local/bin/lucid';
    this.pollInterval = options.pollInterval || 1000; // Default 1 second
    this.includeGetTime = options.includeGetTime !== false; // Default to true
    this.restEndpoint = options.restEndpoint || null; // Optional REST endpoint for remote daemon
    this.isRunning = false;
    this.childProcess = null;
    this.lastValue = 0;
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const metrics = this.includeGetTime ? 'getBytes,getTime' : 'getBytes';
    const commandStr = this.restEndpoint 
      ? `${this.lucidCommand} --rest-endpoint ${this.restEndpoint} perf --objectstore ${metrics} --seconds 1`
      : `${this.lucidCommand} perf --objectstore ${metrics} --seconds 1`;
    console.log(`Starting LucidLink stats monitoring with command: ${commandStr}`);
    this.startStreamingStats();
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.childProcess) {
      this.childProcess.kill();
      this.childProcess = null;
    }

    console.log('Stopped LucidLink stats monitoring');
  }

  startStreamingStats() {
    // Check if lucid command exists first
    const checkCommand = spawn('which', [this.lucidCommand]);
    
    checkCommand.on('close', (code) => {
      if (code !== 0) {
        console.error(`LucidLink command not found at ${this.lucidCommand}`);
        this.emit('error', new Error(`LucidLink command not found: ${this.lucidCommand}`));
        return;
      }
      
      // Spawn continuous lucid perf command
      const metrics = this.includeGetTime ? 'getBytes,getTime' : 'getBytes';
      const args = ['perf', '--objectstore', metrics, '--seconds', '1'];
      
      // Add REST endpoint if specified (for connecting to remote daemon)
      if (this.restEndpoint) {
        args.unshift('--rest-endpoint', this.restEndpoint);
      }
      
      this.childProcess = spawn(this.lucidCommand, args);

      let buffer = '';

      this.childProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        
        // Process all complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            this.processLine(line);
          }
        }
        
        // Keep the last incomplete line in buffer
        buffer = lines[lines.length - 1];
      });

      this.childProcess.stderr.on('data', (data) => {
        console.error('LucidLink perf stderr:', data.toString());
      });

      this.childProcess.on('error', (error) => {
        console.error('Failed to spawn lucid perf:', error);
        this.emit('error', error);
        
        // Attempt to restart after error
        if (this.isRunning) {
          setTimeout(() => {
            if (this.isRunning) {
              console.log('Attempting to restart LucidLink stats monitoring...');
              this.startStreamingStats();
            }
          }, 5000);
        }
      });

      this.childProcess.on('close', (code) => {
        console.log(`LucidLink perf process exited with code ${code}`);
        this.childProcess = null;
        
        // Restart if still running and exit was unexpected
        if (this.isRunning && code !== 0) {
          setTimeout(() => {
            if (this.isRunning) {
              console.log('Restarting LucidLink stats monitoring after unexpected exit...');
              this.startStreamingStats();
            }
          }, 5000);
        }
      });
    });
  }

  processLine(line) {
    try {
      // Skip header lines and empty lines
      if (!line || line.includes('--') || line.includes('currentDateAndTimeUTC') || line.includes('getBytes') || line.includes('getTime')) {
        return;
      }
      
      // Parse the objectstore-specific format:
      // currentDateAndTimeUTC  getBytes    getTime     
      // Index:                 0          1           2
      const columns = line.trim().split(/\s+/);
      if (columns.length >= 2) {
        const timestamp = columns[0];
        const getBytesStr = columns[1]; // getBytes column (objectstore throughput)
        const getTimeStr = this.includeGetTime && columns.length >= 3 ? columns[2] : null;  // getTime column (objectstore latency)
        
        let getMibps = 0;
        let getTimeMs = 0;
        
        // Parse getBytes (throughput)
        const bytesMatch = getBytesStr.match(/^([\d.]+)\s*([KMGT]?)(i?)B\/s$/i);
        if (bytesMatch) {
          const value = parseFloat(bytesMatch[1]);
          const unit = bytesMatch[2].toUpperCase();
          const isBinary = bytesMatch[3].toLowerCase() === 'i'; // MiB vs MB
          
          // Convert to bytes/second based on unit
          let bytesPerSecond = value;
          const multiplier = isBinary ? 1024 : 1000; // Binary (1024) vs Decimal (1000)
          
          switch (unit) {
            case 'K': bytesPerSecond *= multiplier; break;
            case 'M': bytesPerSecond *= multiplier * multiplier; break;
            case 'G': bytesPerSecond *= multiplier * multiplier * multiplier; break;
            case 'T': bytesPerSecond *= multiplier * multiplier * multiplier * multiplier; break;
            // 'B' or empty means bytes, no conversion needed
          }
          
          // Special case: if the input is already in MiB/s, we can use it directly
          if (unit === 'M' && isBinary) {
            getMibps = Math.round(value * 100) / 100; // Round to 2 decimal places
          } else {
            // Convert to MiB/s (1 MiB = 1024 * 1024 bytes)
            const mibPerSecond = bytesPerSecond / (1024 * 1024);
            getMibps = Math.round(mibPerSecond * 100) / 100; // Round to 2 decimal places
          }
        }
        
        // Parse getTime (latency) - only if getTime is included
        if (getTimeStr) {
          const timeMatch = getTimeStr.match(/^([\d.]+)\s*(ms|μs|s)?$/i);
          if (timeMatch) {
            const value = parseFloat(timeMatch[1]);
            const unit = timeMatch[2] ? timeMatch[2].toLowerCase() : 'ms'; // Default to ms if no unit
            
            // Convert to milliseconds
            switch (unit) {
              case 'μs':
              case 'us': 
                getTimeMs = value / 1000; // microseconds to milliseconds
                break;
              case 's':
                getTimeMs = value * 1000; // seconds to milliseconds
                break;
              case 'ms':
              default:
                getTimeMs = value; // already in milliseconds
                break;
            }
            
            getTimeMs = Math.round(getTimeMs * 100) / 100; // Round to 2 decimal places
          }
        }
        
        // Always emit stats - include getTimeMs only if getTime collection is enabled
        const stats = {
          getMibps: getMibps,
          timestamp: Date.now()
        };
        
        if (this.includeGetTime) {
          stats.getTimeMs = getTimeMs;
        }
        
        // Debug logging for significant changes or first values
        if (this.lastValue === 0 || Math.abs((getMibps * 1024 * 1024) - this.lastValue) > 1024 || getTimeMs > 0) {
          const latencyLog = this.includeGetTime ? `, latency=${getTimeStr || 'N/A'} -> ${stats.getTimeMs || 0} ms` : '';
          console.log(`LucidLink stats: throughput=${getBytesStr} -> ${stats.getMibps} MiB/s${latencyLog}`);
        }
        
        this.emit('stats', stats);
        this.lastValue = getMibps * 1024 * 1024; // Store as bytes for comparison
      }
    } catch (error) {
      console.error('Error parsing LucidLink perf output:', error, 'Line:', line);
    }
  }
}

module.exports = LucidLinkStatsWorker;