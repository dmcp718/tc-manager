const { spawn } = require('child_process');
const EventEmitter = require('events');

class NetworkStatsWorker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.interface = options.interface || 'en0'; // Default to en0 on macOS
    this.pollInterval = options.pollInterval || 2000; // 2 seconds
    this.isRunning = false;
    this.pollTimer = null;
    
    // Track previous stats for delta calculation
    this.prevStats = null;
    this.startTime = null;
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.prevStats = null;

    console.log(`Starting network stats monitoring on interface ${this.interface}`);
    this.poll();
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    console.log('Stopped network stats monitoring');
  }

  async poll() {
    if (!this.isRunning) {
      return;
    }

    try {
      const stats = await this.getNetworkStats();
      
      if (this.prevStats) {
        // Calculate deltas
        const rxDelta = stats.rxBytes - this.prevStats.rxBytes;
        const txDelta = stats.txBytes - this.prevStats.txBytes;
        const timeDelta = stats.timestamp - this.prevStats.timestamp;
        
        // Calculate speeds in MB/s
        const rxMbps = (rxDelta / (1024 * 1024)) / (timeDelta / 1000);
        const txMbps = (txDelta / (1024 * 1024)) / (timeDelta / 1000);
        
        // Only emit if there's meaningful traffic (> 0.1 MB/s)
        if (rxMbps > 0.1 || txMbps > 0.1) {
          this.emit('stats', {
            interface: this.interface,
            timestamp: stats.timestamp,
            rxMbps: Math.max(0, Math.round(rxMbps * 10) / 10),
            txMbps: Math.max(0, Math.round(txMbps * 10) / 10)
          });
        }
      }
      
      this.prevStats = stats;
      
    } catch (error) {
      console.error('Error getting network stats:', error);
      // Don't emit error, just continue polling
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
    }
  }

  async getNetworkStats() {
    return new Promise((resolve, reject) => {
      // Use netstat on macOS to get interface statistics
      const netstat = spawn('netstat', ['-I', this.interface, '-b']);
      let output = '';
      
      netstat.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      netstat.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`netstat failed with code ${code}`));
          return;
        }
        
        try {
          const stats = this.parseNetstatOutput(output);
          resolve(stats);
        } catch (error) {
          reject(error);
        }
      });
      
      netstat.on('error', (error) => {
        reject(new Error(`Failed to spawn netstat: ${error.message}`));
      });
    });
  }

  parseNetstatOutput(output) {
    const lines = output.trim().split('\n');
    
    // Find the interface line with the Link address (has byte counters)
    let interfaceLine = null;
    for (let line of lines) {
      if (line.includes(this.interface) && line.includes('<Link#')) {
        interfaceLine = line;
        break;
      }
    }
    
    // Fallback to first line with interface name if no Link line found
    if (!interfaceLine) {
      for (let line of lines) {
        if (line.includes(this.interface)) {
          interfaceLine = line;
          break;
        }
      }
    }
    
    if (!interfaceLine) {
      throw new Error(`Interface ${this.interface} not found in netstat output`);
    }
    
    // Parse the line - format: interface packets errs bytes packets errs bytes colls
    const parts = interfaceLine.trim().split(/\s+/);
    
    if (parts.length < 10) {
      throw new Error(`Unexpected netstat output format: ${interfaceLine}`);
    }
    
    // netstat output: Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Colls
    const rxBytes = parseInt(parts[6]) || 0;  // Ibytes (position 6)
    const txBytes = parseInt(parts[9]) || 0;  // Obytes (position 9)
    
    return {
      timestamp: Date.now(),
      rxBytes: rxBytes,
      txBytes: txBytes
    };
  }
}

module.exports = NetworkStatsWorker;