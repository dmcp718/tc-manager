const RUIClient = require('./rui-client');
const { FileModel } = require('./database');
const RUIFilesystemScanner = require('./rui-filesystem-scanner');
const EventEmitter = require('events');

/**
 * RUI Service - Manages Remote Upload Indicator scanning and monitoring
 * 
 * Features:
 * - Scanner Job: Periodically scans all files for upload status
 * - Monitor Jobs: Individual file upload tracking until completion
 * - WebSocket notifications for real-time UI updates
 */
class RUIService extends EventEmitter {
  constructor(websocketBroadcast = null) {
    super();
    
    this.ruiClient = new RUIClient();
    this.websocketBroadcast = websocketBroadcast;
    this.filesystemScanner = new RUIFilesystemScanner(websocketBroadcast);
    
    // Configuration
    this.enabled = process.env.ENABLE_RUI === 'true';
    this.scanInterval = parseInt(process.env.RUI_SCAN_INTERVAL) || 30000; // 30 seconds
    this.monitorInterval = parseInt(process.env.RUI_MONITOR_INTERVAL) || 5000; // 5 seconds
    this.batchSize = parseInt(process.env.RUI_BATCH_SIZE) || 100;
    this.maxConcurrentMonitors = parseInt(process.env.RUI_MAX_CONCURRENT_MONITORS) || 10;
    
    // State tracking
    this.scannerActive = false;
    this.scannerTimer = null;
    this.activeMonitors = new Map(); // path -> monitor info
    this.monitorQueue = []; // Queue for files waiting to be monitored
    this.stats = {
      lastScanTime: null,
      filesScanned: 0,
      uploadsDetected: 0,
      uploadsCompleted: 0,
      errors: 0,
      activeMonitors: 0
    };
    
    console.log(`RUI Service initialized - Enabled: ${this.enabled}`);
    
    if (this.enabled) {
      this.testConnection();
    }
  }

  /**
   * Test RUI API connection
   */
  async testConnection() {
    try {
      const result = await this.ruiClient.testConnection();
      if (result.success) {
        console.log('RUI API connection successful');
        this.emit('connection-test', { success: true, ...result });
      } else {
        console.error('RUI API connection failed:', result.error);
        this.emit('connection-test', { success: false, error: result.error });
      }
      return result;
    } catch (error) {
      console.error('RUI API connection test error:', error);
      this.emit('connection-test', { success: false, error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Start the RUI service
   */
  async start() {
    if (!this.enabled) {
      console.log('RUI Service disabled via configuration');
      return false;
    }

    if (this.scannerActive) {
      console.log('RUI Service already running');
      return true;
    }

    try {
      // Test connection first
      const connectionTest = await this.testConnection();
      if (!connectionTest.success) {
        console.warn(`RUI API connection test failed: ${connectionTest.error}`);
        console.warn('Starting RUI Service in degraded mode - will retry connection during scans');
        // Don't throw - allow service to start anyway
      }

      console.log('Starting RUI Service...');
      this.scannerActive = true;
      
      // Only start database scanner if connection is good
      if (connectionTest.success) {
        this.scheduleNextScan();
        // Start monitor queue processor
        this.processMonitorQueue();
      }
      
      // Start filesystem scanner for real-time detection
      const useFilesystemScanner = process.env.ENABLE_RUI_FILESYSTEM_SCANNER !== 'false';
      if (useFilesystemScanner) {
        console.log('Starting RUI Filesystem Scanner for real-time detection');
        try {
          await this.filesystemScanner.start();
          console.log('Filesystem scanner started successfully');
        } catch (fsError) {
          console.error('Failed to start filesystem scanner:', fsError.message);
          // Continue anyway - database scanner can still work
        }
      }
      
      this.emit('service-started');
      console.log(`RUI Service started - Scanner interval: ${this.scanInterval}ms, Monitor interval: ${this.monitorInterval}ms`);
      
      return true;
    } catch (error) {
      console.error('Failed to start RUI Service:', error);
      this.scannerActive = false;
      throw error;
    }
  }

  /**
   * Stop the RUI service
   */
  stop() {
    console.log('Stopping RUI Service...');
    
    this.scannerActive = false;
    
    if (this.scannerTimer) {
      clearTimeout(this.scannerTimer);
      this.scannerTimer = null;
    }
    
    // Stop all active monitors
    for (const [path, monitor] of this.activeMonitors) {
      if (monitor.timer) {
        clearTimeout(monitor.timer);
      }
    }
    this.activeMonitors.clear();
    this.monitorQueue.length = 0;
    
    // Stop filesystem scanner
    this.filesystemScanner.stop();
    
    this.emit('service-stopped');
    console.log('RUI Service stopped');
  }

  /**
   * Schedule the next scanner run
   */
  scheduleNextScan() {
    if (!this.scannerActive) return;
    
    this.scannerTimer = setTimeout(() => {
      this.runScanner().catch(error => {
        console.error('Scanner error:', error);
        this.stats.errors++;
        this.emit('scanner-error', error);
      }).finally(() => {
        this.scheduleNextScan();
      });
    }, this.scanInterval);
  }

  /**
   * Run the main scanner job
   */
  async runScanner() {
    console.log('Starting RUI scanner...');
    this.stats.lastScanTime = new Date();
    
    try {
      // Clear stale RUI status first
      await FileModel.clearStaleRUIStatus(this.scanInterval * 2);
      
      // Get total file count for progress tracking
      const totalFiles = await FileModel.getRegularFileCount();
      console.log(`RUI Scanner: ${totalFiles} files to check`);
      
      let processedFiles = 0;
      let uploadsFound = 0;
      
      // Process files in batches
      for (let offset = 0; offset < totalFiles; offset += this.batchSize) {
        if (!this.scannerActive) break; // Allow early termination
        
        const files = await FileModel.findAllRegularFiles(this.batchSize, offset);
        const filePaths = files.map(f => f.path);
        
        if (filePaths.length === 0) break;
        
        // Check RUI status for this batch
        const ruiResults = await this.ruiClient.checkBatchStatus(filePaths, 10);
        
        // Process results
        for (const ruiData of ruiResults) {
          if (ruiData.error) {
            console.error(`RUI check error for ${ruiData.path}:`, ruiData.error);
            this.stats.errors++;
            continue;
          }
          
          processedFiles++;
          
          if (ruiData.isUploading) {
            uploadsFound++;
            
            // Update database
            await FileModel.updateRUIStatus(ruiData.path, ruiData);
            
            // Add to monitor queue
            this.addToMonitorQueue(ruiData.path);
            
            // Notify frontend
            this.broadcastRUIUpdate(ruiData.path, 'uploading');
            
            console.log(`Upload detected: ${ruiData.path}`);
          } else {
            // File not uploading - clear any existing RUI status
            const existingRUI = await FileModel.getRUIStatus(ruiData.path);
            if (existingRUI && existingRUI.status === 'uploading') {
              await FileModel.updateRUIStatus(ruiData.path, ruiData);
              this.broadcastRUIUpdate(ruiData.path, 'complete');
            }
          }
        }
        
        // Emit progress
        this.emit('scanner-progress', {
          processed: processedFiles,
          total: totalFiles,
          uploadsFound: uploadsFound,
          percentage: Math.round((processedFiles / totalFiles) * 100)
        });
      }
      
      this.stats.filesScanned = processedFiles;
      this.stats.uploadsDetected += uploadsFound;
      
      console.log(`RUI Scanner completed: ${processedFiles} files checked, ${uploadsFound} uploads found`);
      this.emit('scanner-complete', {
        filesScanned: processedFiles,
        uploadsFound: uploadsFound,
        duration: Date.now() - this.stats.lastScanTime.getTime()
      });
      
    } catch (error) {
      console.error('RUI Scanner error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  /**
   * Add file to monitor queue
   */
  addToMonitorQueue(filePath) {
    // Don't add if already being monitored
    if (this.activeMonitors.has(filePath)) {
      return;
    }
    
    // Don't add if already in queue
    if (this.monitorQueue.includes(filePath)) {
      return;
    }
    
    this.monitorQueue.push(filePath);
    console.log(`Added ${filePath} to monitor queue (queue size: ${this.monitorQueue.length})`);
  }

  /**
   * Process the monitor queue
   */
  async processMonitorQueue() {
    if (!this.scannerActive) return;
    
    // Start monitors for files in queue (up to max concurrent)
    while (this.monitorQueue.length > 0 && this.activeMonitors.size < this.maxConcurrentMonitors) {
      const filePath = this.monitorQueue.shift();
      this.startFileMonitor(filePath);
    }
    
    // Schedule next queue processing
    setTimeout(() => this.processMonitorQueue(), 1000);
  }

  /**
   * Start monitoring a specific file
   */
  startFileMonitor(filePath) {
    if (this.activeMonitors.has(filePath)) {
      return; // Already monitoring
    }
    
    console.log(`Starting monitor for: ${filePath}`);
    
    const monitor = {
      path: filePath,
      startTime: new Date(),
      checkCount: 0,
      timer: null
    };
    
    this.activeMonitors.set(filePath, monitor);
    this.stats.activeMonitors = this.activeMonitors.size;
    
    // Start the monitoring loop
    this.scheduleMonitorCheck(filePath);
    
    this.emit('monitor-started', { path: filePath });
  }

  /**
   * Schedule the next check for a monitored file
   */
  scheduleMonitorCheck(filePath) {
    const monitor = this.activeMonitors.get(filePath);
    if (!monitor) return;
    
    monitor.timer = setTimeout(async () => {
      try {
        await this.checkMonitoredFile(filePath);
      } catch (error) {
        console.error(`Monitor check error for ${filePath}:`, error);
        this.stopFileMonitor(filePath);
      }
    }, this.monitorInterval);
  }

  /**
   * Check a monitored file's RUI status
   */
  async checkMonitoredFile(filePath) {
    const monitor = this.activeMonitors.get(filePath);
    if (!monitor) return;
    
    monitor.checkCount++;
    
    try {
      const ruiData = await this.ruiClient.checkFileStatus(filePath);
      
      if (ruiData.error) {
        console.error(`Monitor error for ${filePath}:`, ruiData.error);
        this.stopFileMonitor(filePath);
        return;
      }
      
      // Update database
      await FileModel.updateRUIStatus(filePath, ruiData);
      
      if (!ruiData.isUploading) {
        // Upload complete!
        console.log(`Upload completed: ${filePath} (checked ${monitor.checkCount} times)`);
        
        this.broadcastRUIUpdate(filePath, 'complete');
        this.stopFileMonitor(filePath);
        this.stats.uploadsCompleted++;
        
        this.emit('upload-completed', {
          path: filePath,
          duration: Date.now() - monitor.startTime.getTime(),
          checkCount: monitor.checkCount
        });
        
      } else {
        // Still uploading, schedule next check
        this.scheduleMonitorCheck(filePath);
        
        this.emit('monitor-check', {
          path: filePath,
          checkCount: monitor.checkCount,
          isUploading: true
        });
      }
      
    } catch (error) {
      console.error(`Error checking monitored file ${filePath}:`, error);
      this.stopFileMonitor(filePath);
    }
  }

  /**
   * Stop monitoring a specific file
   */
  stopFileMonitor(filePath) {
    const monitor = this.activeMonitors.get(filePath);
    if (!monitor) return;
    
    if (monitor.timer) {
      clearTimeout(monitor.timer);
    }
    
    this.activeMonitors.delete(filePath);
    this.stats.activeMonitors = this.activeMonitors.size;
    
    console.log(`Stopped monitoring: ${filePath}`);
    this.emit('monitor-stopped', { path: filePath });
  }

  /**
   * Broadcast RUI update via WebSocket
   */
  broadcastRUIUpdate(filePath, status) {
    if (this.websocketBroadcast) {
      const message = {
        type: 'rui-update',
        path: filePath,
        status: status, // 'uploading' or 'complete'
        timestamp: new Date()
      };
      
      this.websocketBroadcast(message);
    }
  }

  /**
   * Get service status and statistics
   */
  getStatus() {
    const fsStatus = this.filesystemScanner.getStatus();
    
    return {
      enabled: this.enabled,
      scannerActive: this.scannerActive,
      filesystemScanner: fsStatus,
      stats: {
        ...this.stats,
        activeMonitors: this.activeMonitors.size,
        queueLength: this.monitorQueue.length
      },
      configuration: {
        scanInterval: this.scanInterval,
        monitorInterval: this.monitorInterval,
        batchSize: this.batchSize,
        maxConcurrentMonitors: this.maxConcurrentMonitors
      },
      ruiClient: this.ruiClient.getStatus()
    };
  }

  /**
   * Get currently uploading files
   */
  async getUploadingFiles() {
    try {
      // Combine results from database scanner and filesystem scanner
      const dbFiles = await FileModel.findFilesWithRUIStatus('uploading');
      
      // Only get filesystem scanner results if it's active
      let fsFiles = [];
      if (this.filesystemScanner && this.filesystemScanner.scannerActive) {
        try {
          fsFiles = await this.filesystemScanner.getUploadingFiles();
        } catch (fsError) {
          console.error('Error getting files from filesystem scanner:', fsError.message);
        }
      }
      
      // Merge and deduplicate
      const fileMap = new Map();
      
      // Add database files
      for (const file of dbFiles) {
        fileMap.set(file.path, file);
      }
      
      // Add/update with filesystem scanner results
      for (const file of fsFiles) {
        fileMap.set(file.path, file);
      }
      
      return Array.from(fileMap.values());
    } catch (error) {
      console.error('Error getting uploading files:', error);
      return [];
    }
  }

  /**
   * Force check a specific file
   */
  async forceCheckFile(filePath) {
    try {
      const ruiData = await this.ruiClient.checkFileStatus(filePath);
      
      if (!ruiData.error) {
        await FileModel.updateRUIStatus(filePath, ruiData);
        this.broadcastRUIUpdate(filePath, ruiData.isUploading ? 'uploading' : 'complete');
        
        if (ruiData.isUploading) {
          this.addToMonitorQueue(filePath);
        }
      }
      
      return ruiData;
    } catch (error) {
      console.error(`Force check error for ${filePath}:`, error);
      throw error;
    }
  }
}

module.exports = RUIService;