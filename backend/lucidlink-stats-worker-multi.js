const { spawn } = require('child_process');
const EventEmitter = require('events');

class LucidLinkStatsWorkerMulti extends EventEmitter {
  constructor(options = {}) {
    super();
    this.lucidCommand = options.lucidCommand || '/usr/local/bin/lucid';
    this.pollInterval = options.pollInterval || 1000; // Default 1 second
    this.includeGetTime = options.includeGetTime !== false; // Default to true
    this.isRunning = false;
    this.childProcesses = new Map(); // Map of instance ID to child process
    this.lastValues = new Map(); // Map of instance ID to last value
    this.activeInstance = null;
    this.instances = this.detectInstances();
    this.currentFilespaceId = 1; // Track which filespace is currently being monitored
  }

  /**
   * Detect configured LucidLink instances from environment variables
   */
  detectInstances() {
    const instances = [];
    
    // Check for numbered instance configurations
    for (let i = 1; i <= 5; i++) {
      const instanceId = process.env[`LUCIDLINK_INSTANCE_${i}`];
      const filespace = process.env[`LUCIDLINK_FILESPACE_${i}`];
      const mountPoint = process.env[`LUCIDLINK_MOUNT_POINT_${i}`];
      
      if (instanceId && filespace && mountPoint) {
        instances.push({
          id: parseInt(instanceId),
          filespaceId: i,
          filespace: filespace,
          mountPoint: mountPoint,
          apiPort: process.env[`LUCIDLINK_API_PORT_${i}`] || (9780 + i - 1)
        });
      }
    }
    
    // Fallback to legacy configuration
    if (instances.length === 0 && process.env.LUCIDLINK_FILESPACE) {
      instances.push({
        id: 2001,
        filespaceId: 1,
        filespace: process.env.LUCIDLINK_FILESPACE,
        mountPoint: process.env.LUCIDLINK_MOUNT_POINT || '/media/lucidlink-1',
        apiPort: process.env.LUCIDLINK_API_PORT || 9780
      });
    }
    
    console.log(`Detected ${instances.length} LucidLink instance(s):`, instances);
    return instances;
  }

  /**
   * Set the active instance based on filespace context
   * @param {number} filespaceId - The filespace ID to monitor
   */
  setActiveFilespace(filespaceId) {
    const instance = this.instances.find(inst => inst.filespaceId === filespaceId);
    if (instance) {
      if (this.activeInstance !== instance.id) {
        console.log(`Switching LucidLink stats monitoring to filespace ${filespaceId} (instance ${instance.id})`);
        this.activeInstance = instance.id;
        this.currentFilespaceId = filespaceId;
        
        // Stop current monitoring and start new one
        if (this.isRunning) {
          this.stopInstance(this.activeInstance);
          this.startInstance(instance);
        }
      }
    }
  }

  /**
   * Automatically detect which filespace to monitor based on active jobs
   * This method should be called by the backend when job status changes
   */
  autoDetectActiveFilespace(activeJobPaths) {
    if (!activeJobPaths || activeJobPaths.length === 0) {
      // Default to first filespace if no active jobs
      if (this.currentFilespaceId !== 1) {
        this.setActiveFilespace(1);
      }
      return;
    }
    
    // Determine which filespace the active job belongs to
    for (const instance of this.instances) {
      const hasMatch = activeJobPaths.some(path => path.startsWith(instance.mountPoint));
      if (hasMatch && this.currentFilespaceId !== instance.filespaceId) {
        this.setActiveFilespace(instance.filespaceId);
        return;
      }
    }
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // Start monitoring the primary instance by default
    if (this.instances.length > 0) {
      this.activeInstance = this.instances[0].id;
      this.currentFilespaceId = this.instances[0].filespaceId;
      this.startInstance(this.instances[0]);
    } else {
      console.error('No LucidLink instances configured');
      this.emit('error', new Error('No LucidLink instances configured'));
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    // Stop all child processes
    for (const [instanceId, childProcess] of this.childProcesses) {
      if (childProcess) {
        childProcess.kill();
      }
    }
    
    this.childProcesses.clear();
    this.lastValues.clear();
    console.log('Stopped LucidLink multi-instance stats monitoring');
  }

  startInstance(instance) {
    // Check if lucid command exists first
    const checkCommand = spawn('which', [this.lucidCommand]);
    
    checkCommand.on('close', (code) => {
      if (code !== 0) {
        console.error(`LucidLink command not found at ${this.lucidCommand}`);
        this.emit('error', new Error(`LucidLink command not found: ${this.lucidCommand}`));
        return;
      }
      
      // Spawn continuous lucid perf command for this instance
      const metrics = this.includeGetTime ? 'getBytes,getTime' : 'getBytes';
      const args = ['--instance', instance.id.toString(), 'perf', '--objectstore', metrics, '--seconds', '1'];
      
      console.log(`Starting stats monitoring for instance ${instance.id} (filespace: ${instance.filespace})`);
      const childProcess = spawn(this.lucidCommand, args);
      
      this.childProcesses.set(instance.id, childProcess);
      
      let buffer = '';
      
      childProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer
        
        for (const line of lines) {
          const stats = this.parsePerfOutput(line);
          if (stats) {
            stats.instanceId = instance.id;
            stats.filespaceId = instance.filespaceId;
            stats.filespace = instance.filespace;
            stats.mountPoint = instance.mountPoint;
            
            this.lastValues.set(instance.id, stats.getMibps);
            this.emit('stats', stats);
          }
        }
      });
      
      childProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        if (error && !error.includes('--') && !error.includes('currentDateAndTimeUTC')) {
          console.error(`LucidLink perf error (instance ${instance.id}):`, error);
        }
      });
      
      childProcess.on('error', (error) => {
        console.error(`Failed to spawn lucid perf for instance ${instance.id}:`, error);
        this.emit('error', error);
        this.childProcesses.delete(instance.id);
      });
      
      childProcess.on('close', (code) => {
        if (code !== 0 && this.isRunning) {
          console.log(`lucid perf process for instance ${instance.id} exited with code ${code}, restarting...`);
          setTimeout(() => {
            if (this.isRunning && this.activeInstance === instance.id) {
              this.startInstance(instance);
            }
          }, 5000);
        }
        this.childProcesses.delete(instance.id);
      });
    });
  }

  stopInstance(instanceId) {
    const childProcess = this.childProcesses.get(instanceId);
    if (childProcess) {
      childProcess.kill();
      this.childProcesses.delete(instanceId);
    }
  }

  parsePerfOutput(line) {
    try {
      // Skip header lines and empty lines
      if (!line || line.includes('--') || line.includes('currentDateAndTimeUTC') || line.includes('getBytes') || line.includes('getTime')) {
        return null;
      }
      
      // Parse the performance output
      // Format: 2024-07-25T12:34:56Z  123.45 MiB/s   12.34 ms
      // currentDateAndTimeUTC  getBytes    getTime     
      const columns = line.trim().split(/\s+/);
      
      if (columns.length >= 2) {
        const getBytesStr = columns[1]; // getBytes column (objectstore throughput)
        let getTimeStr = null;
        
        if (this.includeGetTime && columns.length >= 3) {
          getTimeStr = columns[2]; // getTime column (latency)
        }
        
        // Parse getBytes (throughput)
        const bytesMatch = getBytesStr.match(/^([\d.]+)\s*([KMGT]?)(i?)B\/s$/i);
        if (!bytesMatch) {
          return null;
        }
        
        const value = parseFloat(bytesMatch[1]);
        const unit = bytesMatch[2] || '';
        const isBinary = bytesMatch[3] === 'i';
        
        // Convert to MiB/s
        let mibps = value;
        if (unit.toUpperCase() === 'K') {
          mibps = value / 1024;
        } else if (unit.toUpperCase() === 'G') {
          mibps = value * 1024;
        } else if (unit.toUpperCase() === 'T') {
          mibps = value * 1024 * 1024;
        } else if (!unit || unit.toUpperCase() === 'B') {
          mibps = value / (1024 * 1024);
        }
        
        // Parse getTime (latency) if available
        let latencyMs = null;
        if (getTimeStr) {
          const timeMatch = getTimeStr.match(/^([\d.]+)\s*ms$/i);
          if (timeMatch) {
            latencyMs = parseFloat(timeMatch[1]);
          }
        }
        
        const stats = {
          timestamp: new Date().toISOString(),
          getMibps: mibps,
          rawValue: getBytesStr
        };
        
        if (latencyMs !== null) {
          stats.getTimeMs = latencyMs;
        }
        
        // Log periodically for debugging
        if (Math.random() < 0.01) { // Log 1% of the time
          const latencyLog = latencyMs !== null ? `, latency=${latencyMs}ms` : '';
          console.log(`LucidLink stats: throughput=${getBytesStr} -> ${stats.getMibps} MiB/s${latencyLog}`);
        }
        
        return stats;
      }
    } catch (error) {
      console.error('Error parsing LucidLink perf output:', error, 'Line:', line);
    }
    
    return null;
  }
}

module.exports = LucidLinkStatsWorkerMulti;