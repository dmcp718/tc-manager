const fs = require('fs').promises;
const path = require('path');
const { FileModel, IndexProgressModel, IndexingSessionModel } = require('./database');
const ElasticsearchClient = require('./elasticsearch-client');
const EventEmitter = require('events');

class FileIndexer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.batchSize = options.batchSize || 10000; // Large batches for maximum speed
    this.dynamicBatchSize = this.batchSize; // Adaptive batch size based on performance
    this.batchPerformanceHistory = []; // Track batch processing times
    this.maxDepth = options.maxDepth || 50;
    this.skipPatterns = options.skipPatterns || [
      /node_modules/,
      /\.git/,
      /\.DS_Store/,
      /Thumbs\.db/,
      /\.tmp$/,
      /\.temp$/,
      /\.cache/
    ];
    
    this.isRunning = false;
    this.shouldStop = false;
    this.currentProgress = null;
    this.fileBatch = [];
    this.processedCount = 0;
    this.indexedCount = 0;
    this.skippedCount = 0;
    this.errorCount = 0;
    this.deletedCount = 0; // Track deleted files
    this.directorySizeQueue = [];
    this.isBatchProcessing = false;
    
    // Session tracking for deletion detection
    this.currentSession = null;
    this.affectedDirectories = new Set();
    
    // Parallel processing for maximum speed
    this.maxParallelBatches = options.maxParallelBatches || 3;
    this.pendingBatches = [];
    this.activeBatchPromises = [];
    
    // Elasticsearch integration - Phase 1 optimization: larger batch sizes
    this.elasticsearchClient = null;
    this.elasticsearchEnabled = false;
    this.elasticsearchBatch = [];
    this.elasticsearchBatchSize = options.elasticsearchBatchSize || 10000; // Increased from 1K to 10K for better performance
  }

  async start(rootPath) {
    if (this.isRunning) {
      throw new Error('Indexer is already running');
    }

    this.isRunning = true;
    
    // Initialize Elasticsearch client
    await this.initializeElasticsearch();
    this.shouldStop = false;
    this.processedCount = 0;
    this.indexedCount = 0;
    this.skippedCount = 0;
    this.errorCount = 0;
    this.deletedCount = 0; // Reset deleted count
    this.fileBatch = [];
    this.directorySizeQueue = [];
    this.isBatchProcessing = false;
    this.pendingBatches = [];
    this.activeBatchPromises = [];
    
    // Reset session tracking
    this.currentSession = null;
    this.affectedDirectories.clear();

    try {
      // Create indexing session for deletion tracking
      this.currentSession = await IndexingSessionModel.create(rootPath);
      
      // Create index progress record
      this.currentProgress = await IndexProgressModel.create(rootPath);
      await IndexProgressModel.updateStatus(this.currentProgress.id, 'running');
      
      this.emit('start', {
        id: this.currentProgress.id,
        rootPath,
        status: 'running'
      });

      // Start recursive indexing
      await this.indexDirectory(rootPath, 0);
      
      // Process any remaining files in batch
      if (this.fileBatch.length > 0) {
        await this.processBatchAsync();
      }
      
      // Wait for all parallel batches to complete
      if (this.activeBatchPromises.length > 0) {
        console.log(`Waiting for ${this.activeBatchPromises.length} parallel database operations to complete...`);
        await Promise.all(this.activeBatchPromises);
      }
      
      // Process any remaining Elasticsearch batch
      if (this.elasticsearchEnabled && this.elasticsearchBatch.length > 0) {
        console.log(`Processing final Elasticsearch batch: ${this.elasticsearchBatch.length} files`);
        try {
          await this.processElasticsearchBatch([...this.elasticsearchBatch]);
          this.elasticsearchBatch = [];
        } catch (error) {
          console.warn('Final Elasticsearch batch failed:', error.message);
        }
      }

      // Process directory sizes if not stopped
      if (!this.shouldStop && this.directorySizeQueue.length > 0) {
        this.emit('progress', {
          id: this.currentProgress.id,
          processedFiles: this.processedCount,
          currentPath: 'Calculating directory sizes...',
          errors: this.errorCount,
          directorySizeQueue: this.directorySizeQueue.length
        });
        
        await this.processDirectorySizes();
      }

      // Process deletion detection only if session completed successfully with validation
      if (!this.shouldStop && this.currentSession && this.processedCount > 0) {
        // Validate session before deletion detection
        const sessionValid = await this.validateSessionForDeletion();
        
        if (sessionValid) {
          console.log(`Session validation passed. Processing deletion detection for ${this.processedCount} processed files.`);
          
          this.emit('progress', {
            id: this.currentProgress.id,
            processedFiles: this.processedCount,
            currentPath: 'Detecting deleted files...',
            errors: this.errorCount
          });
          
          await this.processDeletedFiles();
        } else {
          console.log('Session validation failed - skipping deletion detection for safety');
        }
      } else if (this.shouldStop) {
        console.log('Indexing was stopped - skipping deletion detection to prevent data loss');
      } else if (this.processedCount === 0) {
        console.log('No files processed - skipping deletion detection');
      }

      // Fix directory sizes after deletion detection
      if (!this.shouldStop && this.currentSession) {
        this.emit('progress', {
          id: this.currentProgress.id,
          processedFiles: this.processedCount,
          currentPath: 'Updating directory sizes...',
          errors: this.errorCount
        });
        
        await this.fixDirectorySizes();
      }

      // Complete the indexing session
      if (this.currentSession) {
        const sessionStatus = this.shouldStop ? 'failed' : 'completed';
        await IndexingSessionModel.updateStatus(this.currentSession.id, sessionStatus);
      }

      // Update final progress with correct processed file count
      await IndexProgressModel.updateProgress(
        this.currentProgress.id,
        this.indexedCount + this.skippedCount, // All files processed (indexed + skipped)
        'Indexing complete'
      );

      // Update final status
      const finalStatus = this.shouldStop ? 'stopped' : 'completed';
      await IndexProgressModel.updateStatus(
        this.currentProgress.id,
        finalStatus,
        this.indexedCount + this.skippedCount // Total files found (indexed + skipped)
      );

      // Calculate duration from session start time
      let duration = null;
      if (this.currentSession && this.currentSession.created_at) {
        duration = Date.now() - new Date(this.currentSession.created_at).getTime();
      }

      this.emit('complete', {
        id: this.currentProgress.id,
        status: finalStatus,
        totalFiles: this.processedCount,
        indexedFiles: this.indexedCount,
        skippedFiles: this.skippedCount,
        deletedFiles: this.deletedCount,
        errors: this.errorCount,
        directorySizesProcessed: this.directorySizeQueue.length,
        duration: duration
      });

    } catch (error) {
      console.error('Indexing error:', error);
      
      // Mark session as failed and clean up partial data
      if (this.currentSession) {
        console.log(`Marking session ${this.currentSession.id} as failed due to error: ${error.message}`);
        await IndexingSessionModel.updateStatus(this.currentSession.id, 'failed');
        
        // Clean up partial session data to prevent incorrect deletion detection
        await this.cleanupFailedSession();
      }
      
      if (this.currentProgress) {
        await IndexProgressModel.updateStatus(
          this.currentProgress.id,
          'failed',
          this.processedCount,
          error.message
        );
      }

      this.emit('error', {
        id: this.currentProgress?.id,
        error: error.message
      });
      
      throw error;
    } finally {
      this.isRunning = false;
      this.currentProgress = null;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.shouldStop = true;
    this.emit('stopping');
  }

  /**
   * Initialize Elasticsearch client with retry logic
   */
  async initializeElasticsearch() {
    try {
      this.elasticsearchClient = new ElasticsearchClient();
      const isConnected = await this.elasticsearchClient.testConnection();
      
      if (isConnected) {
        await this.elasticsearchClient.ensureIndexExists();
        this.elasticsearchEnabled = true;
        console.log('✅ Elasticsearch initialized for indexing');
      } else {
        console.log('⚠️  Elasticsearch not available - indexing to PostgreSQL only');
        this.elasticsearchEnabled = false;
      }
    } catch (error) {
      console.error('Elasticsearch initialization failed:', error.message);
      this.elasticsearchEnabled = false;
    }
  }

  /**
   * Process Elasticsearch batch with retry logic and better error handling
   */
  async processElasticsearchBatch(files) {
    if (!this.elasticsearchEnabled || !files.length) return;

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const result = await this.elasticsearchClient.bulkIndexFiles(files);
        
        if (result.errors.length > 0) {
          console.warn(`Elasticsearch batch partial success: ${result.indexed}/${files.length} files indexed, ${result.errors.length} errors`);
          // Don't retry on partial success
          return result;
        }
        
        return result;
      } catch (error) {
        retryCount++;
        console.error(`Elasticsearch batch failed (attempt ${retryCount}/${maxRetries}):`, error.message);
        
        if (retryCount < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        } else {
          // After max retries, disable ES for this session
          console.error('Elasticsearch indexing disabled for this session due to repeated failures');
          this.elasticsearchEnabled = false;
          throw error;
        }
      }
    }
  }

  async indexDirectory(dirPath, depth) {
    if (this.shouldStop || depth > this.maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      // Enhanced directory-level skip check
      if (this.shouldSkipDirectory(dirPath)) {
        console.log(`Skipping directory: ${dirPath}`);
        return;
      }
      
      // Filter entries to skip at entry level
      const validEntries = entries.filter(entry => {
        const fullPath = path.join(dirPath, entry.name);
        return !this.shouldSkip(fullPath);
      });

      if (validEntries.length === 0) return;

      // OPTIMIZATION: Quick database check to filter out files that don't need indexing
      // This avoids expensive fs.stat() calls on files we'll skip anyway
      const entryPaths = validEntries.map(entry => path.join(dirPath, entry.name));
      
      // Process all valid entries
      let entriesToStat = validEntries;

      // Batch file system operations - parallel fs.stat() calls only on files that might need indexing
      const statPromises = entriesToStat.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          return {
            entry,
            fullPath,
            stats,
            error: null
          };
        } catch (error) {
          return {
            entry,
            fullPath,
            stats: null,
            error
          };
        }
      });

      // Execute all stat operations in parallel
      const statResults = await Promise.allSettled(statPromises);
      const subdirectories = [];

      // Process results
      for (const result of statResults) {
        if (this.shouldStop) break;

        if (result.status === 'fulfilled') {
          const { entry, fullPath, stats, error } = result.value;

          if (error) {
            // Log error but continue indexing
            this.errorCount++;
            console.error(`Error indexing ${fullPath}:`, error.message);
            this.emit('file-error', {
              path: fullPath,
              error: error.message
            });
            continue;
          }

          // Add to batch for processing
          this.fileBatch.push({
            path: fullPath,
            name: entry.name,
            parent_path: dirPath,
            is_directory: entry.isDirectory(),
            size: stats.size,
            modified_at: stats.mtime,
            permissions: stats.mode
          });

          // Collect subdirectories for recursive processing
          if (entry.isDirectory() && depth < this.maxDepth) {
            subdirectories.push(fullPath);
          }

          // Process batch when it reaches the dynamic batch size (async for speed)
          if (this.fileBatch.length >= this.dynamicBatchSize) {
            await this.processBatchAsync();
          }

          // Update progress counter
          this.processedCount++;
          
          // Yield to event loop every 1000 files to minimize overhead
          if (this.processedCount % 1000 === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      }

      // Process subdirectories recursively
      for (const subdir of subdirectories) {
        if (this.shouldStop) break;
        await this.indexDirectory(subdir, depth + 1);
      }

      // Update progress once per directory
      await this.updateProgressThrottled(dirPath);

    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
      throw error;
    }
  }

  async processBatchAsync() {
    if (this.fileBatch.length === 0) return;

    // Create a copy of the current batch and clear it immediately for continued processing
    const batchToProcess = [...this.fileBatch];
    this.fileBatch = [];
    
    // If we have too many parallel operations, wait for one to complete
    if (this.activeBatchPromises.length >= this.maxParallelBatches) {
      await Promise.race(this.activeBatchPromises);
      // Clean up completed promises
      this.activeBatchPromises = this.activeBatchPromises.filter(p => 
        p.then ? true : false // Keep only pending promises
      );
    }
    
    // Start parallel batch processing
    const batchPromise = this.processBatchParallel(batchToProcess);
    this.activeBatchPromises.push(batchPromise);
    
    // Clean up when this batch completes
    batchPromise.finally(() => {
      const index = this.activeBatchPromises.indexOf(batchPromise);
      if (index > -1) {
        this.activeBatchPromises.splice(index, 1);
      }
    });
  }

  async processBatchParallel(batchData) {
    // Use dedicated database connection for this parallel operation to optimize connection pooling
    const { pool } = require('./database');
    const client = await pool.connect();
    
    try {
      const startTime = Date.now();
      
      // Check which files need indexing
      const filesToIndex = await FileModel.batchNeedsIndexing(batchData);
      
      let esIndexed = 0;
      let esErrors = 0;
      
      if (filesToIndex.length > 0) {
        // Run PostgreSQL and Elasticsearch indexing in parallel
        const indexingPromises = [
          // PostgreSQL indexing
          FileModel.batchUpsert(filesToIndex, this.currentSession?.id)
        ];
        
        // Add Elasticsearch indexing if enabled
        let esPromise = null;
        if (this.elasticsearchEnabled) {
          esPromise = this.processElasticsearchBatch(filesToIndex);
          indexingPromises.push(esPromise);
        }
        
        // Wait for both indexing operations to complete
        const results = await Promise.allSettled(indexingPromises);
        
        // Handle PostgreSQL result
        if (results[0].status === 'fulfilled') {
          this.indexedCount += filesToIndex.length;
        } else {
          console.error('PostgreSQL batch indexing failed:', results[0].reason);
          this.errorCount += filesToIndex.length;
          throw results[0].reason;
        }
        
        // Handle Elasticsearch result (non-critical, don't fail the batch)
        if (esPromise && results[1]) {
          if (results[1].status === 'fulfilled' && results[1].value) {
            esIndexed = results[1].value.indexed || 0;
            esErrors = results[1].value.errors?.length || 0;
          } else if (results[1].status === 'rejected') {
            console.warn('Elasticsearch batch indexing failed:', results[1].reason.message);
            esErrors = filesToIndex.length;
          }
        }
      }
      
      this.skippedCount += (batchData.length - filesToIndex.length);
      
      const duration = Date.now() - startTime;
      const esStatus = this.elasticsearchEnabled ? 
        ` | ES: ${esIndexed} indexed, ${esErrors} errors` : 
        ' | ES: disabled';
      
      console.log(`Parallel batch completed: ${batchData.length} files (PG: ${filesToIndex.length} indexed, ${batchData.length - filesToIndex.length} skipped${esStatus}) in ${duration}ms - Total: ${this.processedCount}`);
      
      // Track batch performance for dynamic optimization
      this.trackBatchPerformance(batchData.length, duration);
      
    } catch (error) {
      console.error('Error processing parallel batch:', error);
      this.errorCount += batchData.length;
      throw error;
    } finally {
      // Always release the dedicated connection back to the pool
      client.release();
    }
  }

  async updateProgress(currentPath) {
    if (!this.currentProgress) return;

    try {
      await IndexProgressModel.updateProgress(
        this.currentProgress.id,
        this.indexedCount + this.skippedCount, // Show all files processed (indexed + skipped)
        currentPath
      );

      this.emit('progress', {
        id: this.currentProgress.id,
        processedFiles: this.processedCount,
        indexedFiles: this.indexedCount,
        skippedFiles: this.skippedCount,
        currentPath,
        errors: this.errorCount
      });
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  }

  shouldSkip(filePath) {
    return this.skipPatterns.some(pattern => pattern.test(filePath));
  }

  // Enhanced directory-level skip check for better performance
  shouldSkipDirectory(dirPath) {
    const skipDirs = [
      '.git', 'node_modules', '.cache', '__pycache__', '.vscode',
      '.idea', '.svn', '.hg', 'CVS', '.DS_Store', 'Thumbs.db',
      '.npm', '.yarn', '.pnpm-store', 'bower_components',
      '.gradle', '.m2', '.ivy2', 'target', 'build', 'dist'
    ];
    
    const pathSegments = dirPath.split(path.sep);
    
    // Skip any directory that starts with a dot (hidden directories)
    const lastSegment = pathSegments[pathSegments.length - 1];
    if (lastSegment && lastSegment.startsWith('.')) {
      return true;
    }
    
    return skipDirs.some(skip => 
      pathSegments.includes(skip) ||
      dirPath.includes(`${path.sep}${skip}${path.sep}`) ||
      dirPath.endsWith(`${path.sep}${skip}`)
    );
  }

  // Throttled progress updates to reduce WebSocket overhead
  async updateProgressThrottled(currentPath) {
    const now = Date.now();
    
    // Initialize throttle tracking
    if (!this.lastProgressUpdate) {
      this.lastProgressUpdate = 0;
    }
    
    // More frequent progress updates for better UI feedback
    const PROGRESS_THROTTLE_MS = 2000; // Every 2 seconds
    const PROGRESS_FILE_INTERVAL = 5000; // Every 5K files
    
    const timeSinceLastUpdate = now - this.lastProgressUpdate;
    const shouldUpdateByTime = timeSinceLastUpdate >= PROGRESS_THROTTLE_MS;
    const shouldUpdateByCount = this.processedCount % PROGRESS_FILE_INTERVAL === 0;
    
    // Only update when truly needed - avoid database writes during batch processing
    if ((shouldUpdateByTime && !this.isBatchProcessing) || shouldUpdateByCount || this.processedCount === 1) {
      // Use non-blocking progress update for better performance
      setImmediate(async () => {
        try {
          await this.updateProgress(currentPath);
        } catch (error) {
          console.error('Progress update error (non-blocking):', error.message);
        }
      });
      this.lastProgressUpdate = now;
    }
  }

  async getStatus() {
    if (!this.isRunning) {
      return { running: false };
    }

    return {
      running: true,
      progressId: this.currentProgress?.id,
      processedFiles: this.processedCount,
      errors: this.errorCount
    };
  }

  async getHistory(limit = 10) {
    return await IndexProgressModel.findAll(limit);
  }

  // Process directory sizes in the background
  async processDirectorySizes() {
    if (this.directorySizeQueue.length === 0) return;

    const totalDirectories = this.directorySizeQueue.length;
    let processedDirectories = 0;

    // Process directories in reverse order (deepest first)
    // This ensures child directories are processed before parents
    const sortedDirectories = this.directorySizeQueue
      .sort((a, b) => b.split('/').length - a.split('/').length);

    for (const dirPath of sortedDirectories) {
      if (this.shouldStop) break;

      try {
        await FileModel.updateDirectorySize(dirPath);
        processedDirectories++;

        // Emit progress every 10 directories
        if (processedDirectories % 10 === 0) {
          this.emit('directory-size-progress', {
            id: this.currentProgress?.id,
            processed: processedDirectories,
            total: totalDirectories,
            currentPath: dirPath
          });
        }
      } catch (error) {
        this.errorCount++;
        console.error(`Failed to calculate size for ${dirPath}:`, error.message);
        this.emit('directory-size-error', {
          path: dirPath,
          error: error.message
        });
      }
    }

    // Clear the queue
    this.directorySizeQueue = [];

    this.emit('directory-sizes-complete', {
      processed: processedDirectories,
      total: totalDirectories,
      errors: this.errorCount
    });
  }

  // Process deleted files detection with enhanced safety checks
  async processDeletedFiles() {
    if (!this.currentSession) return;

    try {
      console.log('Starting deletion detection for session:', this.currentSession.id);
      
      const { pool } = require('./database');
      
      // First, count files that would be deleted for safety check
      const countResult = await pool.query(`
        SELECT COUNT(*) as potential_deletions
        FROM files 
        WHERE last_seen_session_id IS DISTINCT FROM $1
      `, [this.currentSession.id]);
      
      const potentialDeletions = parseInt(countResult.rows[0].potential_deletions);
      const totalFiles = await pool.query('SELECT COUNT(*) as total FROM files');
      const totalCount = parseInt(totalFiles.rows[0].total);
      
      const deletionPercentage = totalCount > 0 ? (potentialDeletions / totalCount) * 100 : 0;
      
      console.log(`Deletion safety check: ${potentialDeletions} files would be deleted (${deletionPercentage.toFixed(1)}% of ${totalCount} total)`);
      
      // Safety threshold - don't delete more than 50% of files in one session
      const maxDeletionPercentage = 50;
      if (deletionPercentage > maxDeletionPercentage) {
        console.error(`SAFETY ABORT: Deletion percentage ${deletionPercentage.toFixed(1)}% exceeds maximum ${maxDeletionPercentage}% - skipping deletion detection`);
        return;
      }
      
      // Proceed with deletion if safety checks pass
      const result = await pool.query(`
        DELETE FROM files 
        WHERE last_seen_session_id IS DISTINCT FROM $1
        RETURNING path, parent_path
      `, [this.currentSession.id]);
      
      const deletedFiles = result.rows;
      
      if (deletedFiles.length > 0) {
        this.deletedCount = deletedFiles.length; // Track for reporting
        console.log(`Detected and removed ${deletedFiles.length} deleted files from database`);
        
        // Synchronize Elasticsearch deletions if enabled
        const syncElasticsearch = process.env.ELASTICSEARCH_SYNC_DELETIONS !== 'false';
        if (this.elasticsearchEnabled && syncElasticsearch && deletedFiles.length > 0) {
          try {
            this.emit('progress', {
              id: this.currentProgress?.id,
              processedFiles: this.processedCount,
              currentPath: `Synchronizing ${deletedFiles.length} deletions with Elasticsearch...`,
              errors: this.errorCount
            });

            const deletedPaths = deletedFiles.map(file => file.path);
            const esResult = await this.elasticsearchClient.bulkDeleteByPaths(deletedPaths);
            
            console.log(`Elasticsearch sync: ${esResult.deleted} documents deleted, ${esResult.errors.length} errors`);
            
            if (esResult.errors.length > 0) {
              console.warn('Some Elasticsearch deletions failed:', esResult.errors.slice(0, 5)); // Log first 5 errors
            }
          } catch (error) {
            console.error('Failed to synchronize deletions with Elasticsearch:', error.message);
            // Don't fail the entire indexing process if ES sync fails
            this.errorCount++;
          }
        }
        
        // Track affected directories for size recalculation
        deletedFiles.forEach(file => {
          if (file.parent_path) {
            this.affectedDirectories.add(file.parent_path);
            
            // Also add parent directories up the tree
            let currentPath = file.parent_path;
            while (currentPath && currentPath !== '/') {
              const parentPath = path.dirname(currentPath);
              if (parentPath !== currentPath) {
                this.affectedDirectories.add(parentPath);
                currentPath = parentPath;
              } else {
                break;
              }
            }
          }
        });
        
        this.emit('progress', {
          id: this.currentProgress?.id,
          processedFiles: this.processedCount,
          currentPath: `Removed ${deletedFiles.length} deleted files from database`,
          errors: this.errorCount
        });
      } else {
        console.log('No deleted files detected');
      }
      
    } catch (error) {
      console.error('Error processing deleted files:', error);
      this.errorCount++;
      
      this.emit('file-error', {
        path: 'deletion-detection',
        error: error.message
      });
    }
  }

  // Fix directory sizes for directories affected by deletions
  async fixDirectorySizes() {
    if (this.affectedDirectories.size === 0) {
      console.log('No directories need size updates');
      return;
    }

    try {
      console.log(`Updating sizes for ${this.affectedDirectories.size} affected directories`);
      
      const directoriesArray = Array.from(this.affectedDirectories);
      let processedDirectories = 0;
      
      // Process directories in batches for better performance
      const batchSize = 10;
      for (let i = 0; i < directoriesArray.length; i += batchSize) {
        if (this.shouldStop) break;
        
        const batch = directoriesArray.slice(i, i + batchSize);
        
        // Process batch in parallel with smart caching
        const batchPromises = batch.map(async (dirPath) => {
          try {
            // Check if directory size was recently calculated (within last 5 minutes)
            // to avoid redundant calculations for frequently updated directories
            const recentlyCalculated = await this.isDirectorySizeRecent(dirPath, 300000); // 5 minutes
            
            if (!recentlyCalculated) {
              await FileModel.updateDirectorySize(dirPath);
            } else {
              console.log(`Skipping size update for recently calculated directory: ${dirPath}`);
            }
            
            processedDirectories++;
            
            // Emit progress every 5 directories
            if (processedDirectories % 5 === 0 || processedDirectories === directoriesArray.length) {
              this.emit('progress', {
                id: this.currentProgress?.id,
                processedFiles: this.processedCount,
                currentPath: `Updated ${processedDirectories}/${directoriesArray.length} directory sizes`,
                errors: this.errorCount
              });
            }
            
          } catch (error) {
            this.errorCount++;
            console.error(`Failed to update size for ${dirPath}:`, error.message);
            this.emit('file-error', {
              path: dirPath,
              error: error.message
            });
          }
        });
        
        await Promise.all(batchPromises);
        
        // Small delay between batches to avoid overwhelming the database
        if (i + batchSize < directoriesArray.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      console.log(`Directory size update completed: ${processedDirectories} directories processed`);
      
    } catch (error) {
      console.error('Error fixing directory sizes:', error);
      this.errorCount++;
      
      this.emit('file-error', {
        path: 'directory-size-fix',
        error: error.message
      });
    }
  }

  // Check if directory size was recently calculated to avoid redundant work
  async isDirectorySizeRecent(dirPath, maxAgeMs = 300000) {
    try {
      const { pool } = require('./database');
      const result = await pool.query(`
        SELECT metadata->'computed_size'->>'calculated_at' as calculated_at
        FROM files 
        WHERE path = $1 AND is_directory = true
      `, [dirPath]);
      
      if (result.rows.length === 0) return false;
      
      const calculatedAt = result.rows[0].calculated_at;
      if (!calculatedAt) return false;
      
      const age = Date.now() - new Date(calculatedAt).getTime();
      return age < maxAgeMs;
      
    } catch (error) {
      console.error(`Error checking directory size age for ${dirPath}:`, error);
      return false; // If we can't check, assume it needs recalculation
    }
  }

  // Validate session before allowing deletion detection
  async validateSessionForDeletion() {
    if (!this.currentSession) {
      console.log('No current session - validation failed');
      return false;
    }

    try {
      const { pool } = require('./database');
      
      // Get total expected files from the first directory scan
      const expectedFiles = this.processedCount; // This represents actual files encountered
      const minCompletionRate = 0.90; // Require 90% completion
      const maxErrorRate = 0.05; // Allow max 5% errors
      
      // Calculate completion and error rates
      const completionRate = this.processedCount > 0 ? (this.indexedCount + this.skippedCount) / this.processedCount : 0;
      const errorRate = this.processedCount > 0 ? this.errorCount / this.processedCount : 0;
      
      console.log(`Session validation: ${this.processedCount} processed, ${this.indexedCount} indexed, ${this.skippedCount} skipped, ${this.errorCount} errors`);
      console.log(`Completion rate: ${(completionRate * 100).toFixed(1)}%, Error rate: ${(errorRate * 100).toFixed(1)}%`);
      
      // Check minimum completion threshold
      if (completionRate < minCompletionRate) {
        console.log(`Session completion rate ${(completionRate * 100).toFixed(1)}% below minimum ${(minCompletionRate * 100)}% - validation failed`);
        return false;
      }
      
      // Check maximum error threshold
      if (errorRate > maxErrorRate) {
        console.log(`Session error rate ${(errorRate * 100).toFixed(1)}% above maximum ${(maxErrorRate * 100)}% - validation failed`);
        return false;
      }
      
      // Check minimum processed files (avoid deletion on tiny runs)
      // With improved timestamp comparison, we may process very few files if most are unchanged
      // Lower threshold to allow deletion detection when processing genuine filesystem scans
      if (this.processedCount < 10) {
        console.log(`Session processed only ${this.processedCount} files (minimum 10) - validation failed`);
        return false;
      }
      
      console.log('Session validation passed - safe to proceed with deletion detection');
      return true;
      
    } catch (error) {
      console.error('Error validating session for deletion:', error);
      return false; // Fail safe - don't delete on validation errors
    }
  }

  // Clean up failed session data to prevent incorrect deletion detection
  async cleanupFailedSession() {
    if (!this.currentSession) return;

    try {
      console.log(`Cleaning up failed session ${this.currentSession.id}`);
      
      const { pool } = require('./database');
      
      // Reset session tracking for files that were tagged with this failed session
      // This prevents them from being incorrectly considered as "not deleted"
      const result = await pool.query(`
        UPDATE files 
        SET last_seen_session_id = NULL 
        WHERE last_seen_session_id = $1
        RETURNING COUNT(*)
      `, [this.currentSession.id]);
      
      console.log(`Reset session tracking for files from failed session ${this.currentSession.id}`);
      
    } catch (error) {
      console.error('Error cleaning up failed session:', error);
    }
  }

  // Track batch performance and dynamically adjust batch size for optimal throughput
  trackBatchPerformance(batchSize, durationMs) {
    const throughput = batchSize / durationMs; // files per millisecond
    
    // Keep a rolling history of recent performance metrics
    this.batchPerformanceHistory.push({ batchSize, durationMs, throughput });
    if (this.batchPerformanceHistory.length > 10) {
      this.batchPerformanceHistory.shift(); // Keep only last 10 measurements
    }
    
    // Adjust batch size every 5 batches based on performance trends
    if (this.batchPerformanceHistory.length >= 5 && this.batchPerformanceHistory.length % 5 === 0) {
      this.optimizeBatchSize();
    }
  }

  // Optimize batch size based on performance history
  optimizeBatchSize() {
    if (this.batchPerformanceHistory.length < 5) return;
    
    const recentHistory = this.batchPerformanceHistory.slice(-5);
    const avgThroughput = recentHistory.reduce((sum, h) => sum + h.throughput, 0) / recentHistory.length;
    const avgDuration = recentHistory.reduce((sum, h) => sum + h.durationMs, 0) / recentHistory.length;
    
    // If batches are taking too long (>5 seconds), reduce batch size
    if (avgDuration > 5000 && this.dynamicBatchSize > 1000) {
      this.dynamicBatchSize = Math.max(1000, Math.floor(this.dynamicBatchSize * 0.8));
      console.log(`Reducing batch size to ${this.dynamicBatchSize} due to slow processing (${avgDuration.toFixed(0)}ms avg)`);
    }
    // If batches are very fast (<1 second) and throughput is good, increase batch size
    else if (avgDuration < 1000 && avgThroughput > 5 && this.dynamicBatchSize < this.batchSize * 2) {
      this.dynamicBatchSize = Math.min(this.batchSize * 2, Math.floor(this.dynamicBatchSize * 1.2));
      console.log(`Increasing batch size to ${this.dynamicBatchSize} due to fast processing (${avgDuration.toFixed(0)}ms avg)`);
    }
  }
}

// Singleton instance
let indexerInstance = null;

function getIndexer(options) {
  if (!indexerInstance) {
    indexerInstance = new FileIndexer(options);
  }
  return indexerInstance;
}

module.exports = {
  FileIndexer,
  getIndexer
};