const fs = require('fs').promises;
const path = require('path');
const RUIClient = require('./rui-client');
const FileModel = require('./database').FileModel;

/**
 * Intelligent Filesystem-based RUI Scanner
 * 
 * Scans filesystem directly for upload activity without depending on database indexing.
 * Uses smart patterns and activity tracking for near real-time detection.
 */
class RUIFilesystemScanner {
  constructor(broadcast = null) {
    this.ruiClient = new RUIClient();
    this.broadcast = broadcast;
    this.mountPoint = process.env.LUCIDLINK_MOUNT_POINT || '/media/lucidlink-1';
    
    // Configuration
    this.config = {
      scanInterval: parseInt(process.env.RUI_FS_SCAN_INTERVAL) || 30000, // 30 seconds
      hotDirInterval: parseInt(process.env.RUI_HOT_DIR_INTERVAL) || 10000, // 10 seconds
      batchSize: parseInt(process.env.RUI_BATCH_SIZE) || 50,
      maxConcurrent: parseInt(process.env.RUI_MAX_CONCURRENT) || 5,
      maxDirectoryDepth: 4,
      recentFileThreshold: 300000, // 5 minutes
    };
    
    // Upload patterns - directories where uploads commonly occur
    this.uploadPatterns = [
      '/00_Media/TA_*/Hi-Res/**',
      '/00_Media/TA_*/Low-Res/**', 
      '/00_Media/Upload/**',
      '/00_Media/*/Upload/**',
      '/00_Media/*/**',  // Catch all media subdirectories including 12K_Braw
      '/Incoming/**',
      '/temp/**',
      '/tmp/**'
    ];
    
    // Activity tracking
    this.activityTracker = new Map(); // dirPath -> { lastActivity, uploadCount, lastScan }
    this.uploadingFiles = new Set(); // Current uploading file paths
    this.scannerActive = false;
    this.hotDirTimer = null;
    this.fullScanTimer = null;
    
    // Statistics
    this.stats = {
      totalFilesScanned: 0,
      uploadsDetected: 0,
      uploadsCompleted: 0,
      hotDirectoriesFound: 0,
      lastScanDuration: 0,
      errors: 0
    };
    
    console.log('RUI Filesystem Scanner initialized');
    console.log(`Mount point: ${this.mountPoint}`);
    console.log(`Upload patterns: ${this.uploadPatterns.length} patterns`);
  }

  /**
   * Start the filesystem scanner
   */
  async start() {
    if (this.scannerActive) {
      console.log('RUI Filesystem Scanner already running');
      return false;
    }

    try {
      // Test RUI API connection
      const testResult = await this.ruiClient.testConnection();
      if (!testResult.success) {
        console.warn(`RUI API connection test failed: ${testResult.error}`);
        console.warn('Starting RUI Filesystem Scanner in degraded mode - will retry connection during scans');
        // Don't throw - allow scanner to start anyway
      }

      this.scannerActive = true;
      console.log('RUI Filesystem Scanner started');

      // Start hot directory scanner (frequent)
      this.startHotDirectoryScanner();
      
      // Start full pattern scanner (less frequent)
      this.startFullPatternScanner();
      
      return true;
    } catch (error) {
      console.error('Failed to start RUI Filesystem Scanner:', error.message);
      throw error;
    }
  }

  /**
   * Stop the scanner
   */
  stop() {
    this.scannerActive = false;
    
    if (this.hotDirTimer) {
      clearInterval(this.hotDirTimer);
      this.hotDirTimer = null;
    }
    
    if (this.fullScanTimer) {
      clearInterval(this.fullScanTimer);
      this.fullScanTimer = null;
    }
    
    console.log('RUI Filesystem Scanner stopped');
  }

  /**
   * Start hot directory scanner - checks directories with recent activity
   */
  startHotDirectoryScanner() {
    this.hotDirTimer = setInterval(async () => {
      if (!this.scannerActive) return;
      
      try {
        await this.scanHotDirectories();
      } catch (error) {
        console.error('Hot directory scan error:', error.message);
        this.stats.errors++;
      }
    }, this.config.hotDirInterval);
  }

  /**
   * Start full pattern scanner - comprehensive scan based on upload patterns
   */
  startFullPatternScanner() {
    this.fullScanTimer = setInterval(async () => {
      if (!this.scannerActive) return;
      
      try {
        await this.scanUploadPatterns();
      } catch (error) {
        console.error('Full pattern scan error:', error.message);
        this.stats.errors++;
      }
    }, this.config.scanInterval);
  }

  /**
   * Scan hot directories with recent upload activity
   */
  async scanHotDirectories() {
    const startTime = Date.now();
    const hotDirs = this.getHotDirectories();
    
    if (hotDirs.length === 0) {
      return;
    }
    
    console.log(`Scanning ${hotDirs.length} hot directories for uploads`);
    
    for (const dirPath of hotDirs) {
      try {
        const files = await this.getRecentFilesInDirectory(dirPath);
        if (files.length > 0) {
          await this.checkFilesForUploads(files, `hot-dir:${path.basename(dirPath)}`);
        }
      } catch (error) {
        console.error(`Error scanning hot directory ${dirPath}:`, error.message);
        this.stats.errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`Hot directory scan completed in ${duration}ms`);
  }

  /**
   * Scan directories matching upload patterns
   */
  async scanUploadPatterns() {
    const startTime = Date.now();
    console.log('Starting full pattern scan for uploads');
    
    for (const pattern of this.uploadPatterns) {
      try {
        const directories = await this.expandPattern(pattern);
        console.log(`Pattern ${pattern} matched ${directories.length} directories`);
        
        for (const dirPath of directories) {
          const files = await this.getRecentFilesInDirectory(dirPath);
          if (files.length > 0) {
            await this.checkFilesForUploads(files, `pattern:${pattern}`);
            this.recordDirectoryActivity(dirPath);
          }
        }
      } catch (error) {
        console.error(`Error scanning pattern ${pattern}:`, error.message);
        this.stats.errors++;
      }
    }
    
    this.stats.lastScanDuration = Date.now() - startTime;
    console.log(`Pattern scan completed in ${this.stats.lastScanDuration}ms`);
  }

  /**
   * Get directories with recent upload activity
   */
  getHotDirectories() {
    const now = Date.now();
    const hotThreshold = 600000; // 10 minutes
    
    return Array.from(this.activityTracker.entries())
      .filter(([_, activity]) => (now - activity.lastActivity) < hotThreshold)
      .sort((a, b) => b[1].uploadCount - a[1].uploadCount) // Sort by upload count
      .slice(0, 10) // Top 10 most active
      .map(([dirPath]) => dirPath);
  }

  /**
   * Get recently modified files in a directory
   */
  async getRecentFilesInDirectory(dirPath) {
    try {
      const fullDirPath = path.join(this.mountPoint, dirPath.replace(this.mountPoint, ''));
      const entries = await fs.readdir(fullDirPath, { withFileTypes: true });
      const now = Date.now();
      const files = [];
      
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(fullDirPath, entry.name);
          try {
            const stats = await fs.stat(filePath);
            const ageMs = now - stats.mtime.getTime();
            
            // Only check recently modified files
            if (ageMs < this.config.recentFileThreshold) {
              files.push({
                path: filePath,
                name: entry.name,
                size: stats.size,
                mtime: stats.mtime
              });
            }
          } catch (statError) {
            // File might have been deleted/moved, skip
            continue;
          }
        }
      }
      
      // Sort by modification time (newest first)
      return files.sort((a, b) => b.mtime - a.mtime).slice(0, this.config.batchSize);
      
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Error reading directory ${dirPath}:`, error.message);
      }
      return [];
    }
  }

  /**
   * Check a batch of files for upload status
   */
  async checkFilesForUploads(files, source = 'unknown') {
    if (files.length === 0) return;
    
    const filePaths = files.map(f => f.path);
    console.log(`Checking ${filePaths.length} files for uploads (source: ${source})`);
    
    try {
      const ruiResults = await this.ruiClient.checkBatchStatus(filePaths, this.config.maxConcurrent);
      let uploadsFound = 0;
      let uploadsCompleted = 0;
      
      for (const result of ruiResults) {
        this.stats.totalFilesScanned++;
        
        if (result.error) {
          this.stats.errors++;
          continue;
        }
        
        const wasUploading = this.uploadingFiles.has(result.path);
        const isUploading = result.isUploading;
        
        if (isUploading && !wasUploading) {
          // New upload detected
          this.uploadingFiles.add(result.path);
          this.stats.uploadsDetected++;
          uploadsFound++;
          
          console.log(`🔄 Upload started: ${result.path}`);
          await this.updateFileRUIStatus(result, 'uploading');
          this.broadcastRUIUpdate(result);
          
        } else if (!isUploading && wasUploading) {
          // Upload completed
          this.uploadingFiles.delete(result.path);
          this.stats.uploadsCompleted++;
          uploadsCompleted++;
          
          console.log(`✅ Upload completed: ${result.path}`);
          await this.updateFileRUIStatus(result, 'complete');
          this.broadcastRUIUpdate(result);
          
        } else if (isUploading) {
          // Still uploading, update timestamp
          await this.updateFileRUIStatus(result, 'uploading');
        }
      }
      
      if (uploadsFound > 0 || uploadsCompleted > 0) {
        console.log(`Found ${uploadsFound} new uploads, ${uploadsCompleted} completed uploads`);
      }
      
    } catch (error) {
      console.error('Error checking file batch for uploads:', error.message);
      this.stats.errors++;
    }
  }

  /**
   * Expand a glob pattern to actual directory paths
   */
  async expandPattern(pattern) {
    // Simple pattern expansion - could be enhanced with a proper glob library
    const basePath = this.mountPoint;
    const directories = [];
    
    try {
      if (pattern.includes('*')) {
        // For now, handle simple patterns manually
        // This could be replaced with a proper glob library like 'fast-glob'
        if (pattern.includes('/00_Media/TA_*')) {
          const mediaPath = path.join(basePath, '00_Media');
          const entries = await fs.readdir(mediaPath, { withFileTypes: true });
          
          for (const entry of entries) {
            if (entry.isDirectory() && entry.name.startsWith('TA_')) {
              const subPattern = pattern.replace('/00_Media/TA_*', `/00_Media/${entry.name}`);
              const expanded = await this.expandSimplePattern(subPattern);
              directories.push(...expanded);
            }
          }
        } else {
          const expanded = await this.expandSimplePattern(pattern);
          directories.push(...expanded);
        }
      } else {
        // Direct path
        const fullPath = path.join(basePath, pattern.replace(basePath, ''));
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            directories.push(pattern);
          }
        } catch (error) {
          // Directory doesn't exist, skip
        }
      }
    } catch (error) {
      console.error(`Error expanding pattern ${pattern}:`, error.message);
    }
    
    return directories;
  }

  /**
   * Expand simple patterns like /path/** 
   */
  async expandSimplePattern(pattern) {
    const directories = [];
    const parts = pattern.split('/');
    
    // For ** patterns, scan recursively
    if (pattern.includes('**')) {
      const basePart = parts.slice(0, parts.indexOf('**')).join('/');
      const basePath = path.join(this.mountPoint, basePart.replace(this.mountPoint, ''));
      
      try {
        const subdirs = await this.getSubdirectories(basePath, this.config.maxDirectoryDepth);
        directories.push(...subdirs.map(dir => dir.replace(this.mountPoint, '')));
      } catch (error) {
        // Base path doesn't exist
      }
    }
    
    return directories;
  }

  /**
   * Get subdirectories recursively
   */
  async getSubdirectories(dirPath, maxDepth = 3, currentDepth = 0) {
    const directories = [];
    
    if (currentDepth >= maxDepth) {
      return directories;
    }
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDirPath = path.join(dirPath, entry.name);
          directories.push(subDirPath);
          
          // Recurse into subdirectory
          const subDirs = await this.getSubdirectories(subDirPath, maxDepth, currentDepth + 1);
          directories.push(...subDirs);
        }
      }
    } catch (error) {
      // Directory read error, skip
    }
    
    return directories;
  }

  /**
   * Record activity in a directory
   */
  recordDirectoryActivity(dirPath) {
    const activity = this.activityTracker.get(dirPath) || {
      lastActivity: 0,
      uploadCount: 0,
      lastScan: 0
    };
    
    activity.lastActivity = Date.now();
    activity.lastScan = Date.now();
    
    this.activityTracker.set(dirPath, activity);
  }

  /**
   * Update file RUI status in database
   */
  async updateFileRUIStatus(ruiResult, status) {
    try {
      await FileModel.updateRUIStatus(ruiResult.path, {
        status: status,
        lastChecked: ruiResult.timestamp,
        lucidId: ruiResult.lucidId,
        remoteUpload: ruiResult.remoteUpload
      });
    } catch (error) {
      // File might not be indexed yet - create minimal entry
      try {
        await FileModel.createMinimalRUIEntry(ruiResult.path, {
          status: status,
          lastChecked: ruiResult.timestamp,
          lucidId: ruiResult.lucidId,
          remoteUpload: ruiResult.remoteUpload
        });
      } catch (createError) {
        console.error(`Failed to update RUI status for ${ruiResult.path}:`, createError.message);
      }
    }
  }

  /**
   * Broadcast RUI update via WebSocket
   */
  broadcastRUIUpdate(ruiResult) {
    if (this.broadcast) {
      this.broadcast({
        type: 'rui-update',
        data: {
          path: ruiResult.path,
          status: ruiResult.isUploading ? 'uploading' : 'complete',
          timestamp: ruiResult.timestamp
        }
      });
    }
  }

  /**
   * Get current scanner status
   */
  getStatus() {
    return {
      active: this.scannerActive,
      uploadingFiles: this.uploadingFiles.size,
      hotDirectories: this.activityTracker.size,
      stats: {
        ...this.stats,
        hotDirectoriesFound: this.getHotDirectories().length
      },
      config: this.config
    };
  }

  /**
   * Get currently uploading files
   */
  async getUploadingFiles() {
    try {
      // First try to get from database
      const dbFiles = await FileModel.findFilesWithRUIStatus('uploading');
      
      // Also include files we know are uploading from filesystem scan
      const fsFiles = Array.from(this.uploadingFiles);
      
      // Combine and deduplicate
      const allFiles = [...dbFiles];
      for (const fsPath of fsFiles) {
        if (!allFiles.find(f => f.path === fsPath)) {
          // Add minimal file info for files not yet in database
          allFiles.push({
            path: fsPath,
            name: path.basename(fsPath),
            size: 0,
            cached: false,
            metadata: { rui: { status: 'uploading' } }
          });
        }
      }
      
      return allFiles;
    } catch (error) {
      console.error('Error getting uploading files:', error);
      return [];
    }
  }
}

module.exports = RUIFilesystemScanner;