const EventEmitter = require('events');

class CacheJobMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.pollInterval = options.pollInterval || 5000; // Check every 5 seconds
    this.isRunning = false;
    this.currentActiveFilespace = null;
    this.filespaceToInstance = new Map();
    this.pollTimer = null;
    
    // Initialize filespace to instance mapping
    this.initializeFilespaceMapping();
  }

  initializeFilespaceMapping() {
    // Map mount points to instance IDs based on environment variables
    const filespaces = [
      {
        mountPoint: process.env.LUCIDLINK_MOUNT_POINT_1 || '/media/lucidlink-1',
        instanceId: process.env.LUCIDLINK_INSTANCE_1 || '2001'
      },
      {
        mountPoint: process.env.LUCIDLINK_MOUNT_POINT_2 || '/media/lucidlink-2', 
        instanceId: process.env.LUCIDLINK_INSTANCE_2 || '2002'
      }
    ];

    filespaces.forEach(fs => {
      this.filespaceToInstance.set(fs.mountPoint, fs.instanceId);
    });

    console.log('CacheJobMonitor initialized with filespace mapping:', 
      Array.from(this.filespaceToInstance.entries()));
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('Starting CacheJobMonitor');
    
    // Initial check
    await this.checkActiveJobs();
    
    // Set up periodic monitoring
    this.pollTimer = setInterval(() => {
      this.checkActiveJobs().catch(error => {
        console.error('Error checking active cache jobs:', error);
      });
    }, this.pollInterval);
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('Stopped CacheJobMonitor');
  }

  async checkActiveJobs() {
    try {
      const { pool } = require('./database');
      
      // Query for running cache jobs and their file paths
      const result = await pool.query(`
        SELECT DISTINCT substring(cji.file_path from '^(/media/[^/]+)') as mount_point,
               COUNT(*) as active_files
        FROM cache_jobs cj 
        JOIN cache_job_items cji ON cj.id = cji.job_id 
        WHERE cj.status = 'running' 
          AND cji.status IN ('pending', 'running')
        GROUP BY mount_point
        ORDER BY active_files DESC
      `);

      console.log(`CacheJobMonitor: Found ${result.rows.length} active filespaces`, result.rows);

      if (result.rows.length === 0) {
        // No active jobs, keep current instance or use default
        if (this.currentActiveFilespace) {
          console.log('No active cache jobs, maintaining current stats monitoring');
        } else {
          console.log('No active cache jobs found');
        }
        return;
      }

      // Check if current instance still has active jobs
      let currentInstanceHasJobs = false;
      let currentInstanceActiveFiles = 0;
      if (this.currentActiveFilespace) {
        const currentMountPoint = Array.from(this.filespaceToInstance.entries())
          .find(([_, instanceId]) => instanceId === this.currentActiveFilespace)?.[0];
        
        if (currentMountPoint) {
          const currentStats = result.rows.find(row => row.mount_point === currentMountPoint);
          if (currentStats) {
            currentInstanceHasJobs = true;
            currentInstanceActiveFiles = currentStats.active_files;
          }
        }
      }

      // Only switch if current instance has no jobs or we have no current instance
      if (!this.currentActiveFilespace || !currentInstanceHasJobs) {
        // Find the filespace with the most active files for switching
        const mostActiveFilespace = result.rows[0];
        const mountPoint = mostActiveFilespace.mount_point;
        const instanceId = this.filespaceToInstance.get(mountPoint);

        if (!instanceId) {
          console.warn(`Unknown mount point in cache jobs: ${mountPoint}`);
          return;
        }

        // Switch to new instance
        if (this.currentActiveFilespace !== instanceId) {
          console.log(`Switching LucidLink stats monitoring: ${this.currentActiveFilespace || 'none'} -> ${instanceId} (${mostActiveFilespace.active_files} active files on ${mountPoint})`);
          this.currentActiveFilespace = instanceId;
          
          // Emit instance change event
          this.emit('instance-change', {
            instanceId: instanceId,
            mountPoint: mountPoint,
            activeFiles: mostActiveFilespace.active_files,
            reason: 'job-started-on-different-instance'
          });
        }
      } else {
        // Current instance still has jobs, stick with it
        console.log(`Maintaining LucidLink stats on instance ${this.currentActiveFilespace} (${currentInstanceActiveFiles} active files)`);
      }

    } catch (error) {
      console.error('Error in checkActiveJobs:', error);
    }
  }

  /**
   * Get the currently active filespace instance
   */
  getCurrentInstance() {
    return this.currentActiveFilespace;
  }

  /**
   * Get all configured filespace mappings
   */
  getFilespaceMapping() {
    return Array.from(this.filespaceToInstance.entries());
  }
}

module.exports = CacheJobMonitor;