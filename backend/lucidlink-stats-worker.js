const { spawn } = require('child_process');
const EventEmitter = require('events');

class LucidLinkStatsWorker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.lucidCommand = options.lucidCommand || '/usr/local/bin/lucid';
    this.pollInterval = options.pollInterval || 1000; // Default 1 second
    this.isRunning = false;
    this.childProcess = null;
    this.lastValue = 0;
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`Starting LucidLink stats monitoring with command: ${this.lucidCommand} perf --seconds 1 --objectstore getBytes`);
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
      this.childProcess = spawn(this.lucidCommand, [
        'perf', '--seconds', '1', '--objectstore', 'getBytes'
      ]);

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
      if (!line || line.includes('--') || line.includes('currentDateAndTimeUTC') || line.includes('getBytes')) {
        return;
      }
      
      // Parse the table format: "2025-07-13T02:14:12Z   0B/s"
      // Split by whitespace and get the last column
      const columns = line.trim().split(/\s+/);
      if (columns.length >= 2) {
        const valueStr = columns[columns.length - 1]; // Last column contains the value
        
        // Parse different formats: "0B/s", "1.5MB/s", "500KB/s", "2.3GB/s", "44.90MiB/s"
        const match = valueStr.match(/^([\d.]+)\s*([KMGT]?)(i?)B\/s$/i);
        
        if (match) {
          const value = parseFloat(match[1]);
          const unit = match[2].toUpperCase();
          const isBinary = match[3].toLowerCase() === 'i'; // MiB vs MB
          
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
            // Input is already in MiB/s, use directly
            const stats = {
              getMibps: Math.round(value * 100) / 100, // Round to 2 decimal places
              timestamp: Date.now()
            };
            
            // Debug logging
            console.log(`LucidLink stats: ${valueStr} -> ${stats.getMibps} MiB/s`);
            this.emit('stats', stats);
            this.lastValue = bytesPerSecond;
            return;
          }
          
          // Convert to MiB/s (1 MiB = 1024 * 1024 bytes)
          const mibPerSecond = bytesPerSecond / (1024 * 1024);
          
          // Always emit stats, even if 0 (to show "0.00 MiB/s")
          const stats = {
            getMibps: Math.round(mibPerSecond * 100) / 100, // Round to 2 decimal places
            timestamp: Date.now()
          };
          
          // Debug logging for first few values or when value changes significantly
          if (this.lastValue === 0 || Math.abs(bytesPerSecond - this.lastValue) > 1024) {
            console.log(`LucidLink stats: ${valueStr} -> ${stats.getMibps} MiB/s`);
          }
          
          this.emit('stats', stats);
          this.lastValue = bytesPerSecond;
        }
      }
    } catch (error) {
      console.error('Error parsing LucidLink perf output:', error, 'Line:', line);
    }
  }
}

module.exports = LucidLinkStatsWorker;