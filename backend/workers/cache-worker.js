const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const { 
  CacheJobModel, 
  CacheJobItemModel, 
  FileModel 
} = require('../database');

class CacheWorker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workerId = options.workerId || `worker-${Date.now()}`;
    this.isRunning = false;
    this.currentJob = null;
    this.shouldStop = false;
    this.maxConcurrentFiles = options.maxConcurrentFiles || 3;
    this.activeOperations = new Set();
    this.pollInterval = options.pollInterval || 5000; // 5 seconds
    this.pollTimer = null;
  }

  async start() {
    if (this.isRunning) {
      console.log(`CacheWorker ${this.workerId} is already running`);
      return;
    }

    console.log(`Starting CacheWorker ${this.workerId}`);
    this.isRunning = true;
    this.shouldStop = false;
    
    // Start polling for jobs
    this.pollForJobs();
    
    this.emit('worker-started', { workerId: this.workerId });
  }

  async stop() {
    console.log(`Stopping CacheWorker ${this.workerId}`);
    this.shouldStop = true;
    
    // Clear polling timer
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for active operations to complete
    await this.waitForActiveOperations();
    
    this.isRunning = false;
    this.emit('worker-stopped', { workerId: this.workerId });
  }

  async waitForActiveOperations(timeout = 30000) {
    const startTime = Date.now();
    
    while (this.activeOperations.size > 0 && (Date.now() - startTime) < timeout) {
      console.log(`Waiting for ${this.activeOperations.size} active operations to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.activeOperations.size > 0) {
      console.warn(`Timeout waiting for operations to complete. ${this.activeOperations.size} operations still active.`);
    }
  }

  pollForJobs() {
    if (this.shouldStop) return;

    this.processNextJob()
      .catch(error => {
        console.error('Error processing job:', error);
        this.emit('worker-error', { workerId: this.workerId, error: error.message });
      })
      .finally(() => {
        // Schedule next poll if still running
        if (!this.shouldStop) {
          this.pollTimer = setTimeout(() => this.pollForJobs(), this.pollInterval);
        }
      });
  }

  async processNextJob() {
    // Don't start new job if at capacity or stopping
    if (this.shouldStop || this.currentJob || this.activeOperations.size >= this.maxConcurrentFiles) {
      return;
    }

    // Look for pending jobs (exclude paused and cancelled)
    const pendingJobs = await CacheJobModel.findPending();
    const availableJobs = pendingJobs.filter(job => job.status === 'pending');
    
    if (availableJobs.length === 0) {
      return;
    }

    const job = availableJobs[0];
    console.log(`Processing cache job ${job.id} with ${job.total_files} files`);

    try {
      // Claim the job
      this.currentJob = job;
      
      await CacheJobModel.updateStatus(job.id, 'running', this.workerId);
      
      this.emit('job-started', {
        workerId: this.workerId,
        jobId: job.id,
        totalFiles: job.total_files
      });

      // Process job items
      await this.processJobItems(job.id);

      // Update job progress and check completion
      await CacheJobModel.updateProgress(job.id);
      const updatedJob = await CacheJobModel.findById(job.id);
      
      if (updatedJob.completed_files + updatedJob.failed_files >= updatedJob.total_files) {
        console.log(`Job ${job.id} finished: ${updatedJob.completed_files} completed, ${updatedJob.failed_files} failed`);
        const finalStatus = updatedJob.failed_files > 0 ? 'completed' : 'completed';
        await CacheJobModel.updateStatus(job.id, finalStatus);
        
        // If all files completed successfully, mark directories as cached
        if (updatedJob.failed_files === 0 && updatedJob.directory_paths && updatedJob.directory_paths.length > 0) {
          console.log(`Job ${job.id} completed successfully with no failures. Marking ${updatedJob.directory_paths.length} directories as cached:`, updatedJob.directory_paths);
          await this.markDirectoriesAsCached(updatedJob.directory_paths, job.id);
        } else {
          console.log(`Job ${job.id} not marking directories as cached: failed_files=${updatedJob.failed_files}, directory_paths=${updatedJob.directory_paths ? updatedJob.directory_paths.length : 'null'}`);
        }
        
        console.log(`Emitting job-completed event for job ${job.id}`);
        this.emit('job-completed', {
          workerId: this.workerId,
          jobId: job.id,
          completedFiles: updatedJob.completed_files,
          failedFiles: updatedJob.failed_files
        });
      }

    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      await CacheJobModel.updateStatus(job.id, 'failed', this.workerId);
      
      this.emit('job-failed', {
        workerId: this.workerId,
        jobId: job.id,
        error: error.message
      });
    } finally {
      this.currentJob = null;
    }
  }

  async processJobItems(jobId) {
    const maxConcurrent = this.maxConcurrentFiles;
    const activePromises = new Map(); // Track active file operations
    let completedCount = 0;
    let lastProgressUpdate = Date.now();
    let lastJobCheck = Date.now();
    let jobStatus = 'running'; // Cache job status to reduce queries
    const pendingCacheUpdates = []; // Batch cache status updates
    let lastBatchUpdate = Date.now();
    
    console.log(`Worker ${this.workerId} starting continuous processing for job ${jobId} with ${maxConcurrent} concurrent slots`);
    
    while (!this.shouldStop) {
      // Check job status periodically (every 5 seconds) instead of every iteration
      if (Date.now() - lastJobCheck > 5000) {
        const currentJob = await CacheJobModel.findById(jobId);
        if (!currentJob || ['paused', 'cancelled'].includes(currentJob.status)) {
          console.log(`Job ${jobId} is ${currentJob?.status || 'not found'}, stopping processing`);
          jobStatus = currentJob?.status || 'cancelled';
          break;
        }
        lastJobCheck = Date.now();
      }
      
      // Fill up available slots
      const slotsToFill = maxConcurrent - activePromises.size;
      
      if (slotsToFill > 0) {
        // Claim items to fill available slots
        const claimedItems = await CacheJobItemModel.claimPendingItems(jobId, this.workerId, slotsToFill);
        
        if (claimedItems.length === 0 && activePromises.size === 0) {
          console.log(`Worker ${this.workerId}: No more items and no active operations, job complete`);
          break;
        }
        
        // Start processing new items
        for (const item of claimedItems) {
          const operationId = `${jobId}-${item.file_path}`;
          const promise = this.processJobItem(jobId, item)
            .then(() => {
              activePromises.delete(operationId);
              completedCount++;
              // Queue cache status update for batch processing
              pendingCacheUpdates.push({
                path: item.file_path,
                cached: true,
                cacheJobId: jobId
              });
            })
            .catch(error => {
              console.error(`Error processing ${item.file_path}:`, error);
              activePromises.delete(operationId);
            });
          
          activePromises.set(operationId, promise);
        }
        
        if (claimedItems.length > 0) {
          console.log(`Worker ${this.workerId}: Claimed ${claimedItems.length} items, ${activePromises.size} operations active`);
        }
      }
      
      // Wait for at least one operation to complete before checking for more work
      if (activePromises.size > 0) {
        await Promise.race(activePromises.values());
      }
      
      // Update progress periodically (every 5 seconds or 50 files)
      if (completedCount >= 50 || Date.now() - lastProgressUpdate > 5000) {
        await CacheJobModel.updateProgress(jobId);
        
        const updatedJob = await CacheJobModel.findById(jobId);
        if (updatedJob) {
          this.emit('job-progress', {
            workerId: this.workerId,
            jobId: jobId,
            completedFiles: updatedJob.completed_files,
            totalFiles: updatedJob.total_files,
            failedFiles: updatedJob.failed_files
          });
        }
        
        completedCount = 0;
        lastProgressUpdate = Date.now();
      }
      
      // Batch update cache status (every 10 seconds or 100 files)
      if (pendingCacheUpdates.length >= 100 || (pendingCacheUpdates.length > 0 && Date.now() - lastBatchUpdate > 10000)) {
        try {
          await FileModel.batchUpdateCacheStatus(pendingCacheUpdates);
          console.log(`Batch updated cache status for ${pendingCacheUpdates.length} files`);
          pendingCacheUpdates.length = 0; // Clear the array
          lastBatchUpdate = Date.now();
        } catch (error) {
          console.error('Error batch updating cache status:', error);
        }
      }
    }
    
    // Wait for remaining operations to complete
    if (activePromises.size > 0) {
      console.log(`Worker ${this.workerId}: Waiting for ${activePromises.size} remaining operations`);
      await Promise.all(activePromises.values());
    }
    
    // Process any remaining cache updates
    if (pendingCacheUpdates.length > 0) {
      try {
        await FileModel.batchUpdateCacheStatus(pendingCacheUpdates);
        console.log(`Final batch updated cache status for ${pendingCacheUpdates.length} files`);
      } catch (error) {
        console.error('Error in final batch update:', error);
      }
    }
    
    // Final progress update
    await CacheJobModel.updateProgress(jobId);
  }

  async processJobItem(jobId, item) {
    const operationId = `${jobId}-${item.file_path}`;
    this.activeOperations.add(operationId);

    try {
      // console.log(`Caching file: ${item.file_path}`);
      
      // Item is already marked as 'running' by claimPendingItems, no need to update

      this.emit('file-started', {
        workerId: this.workerId,
        jobId: jobId,
        filePath: item.file_path
      });

      // Skip job check here - it's done periodically in processJobItems

      // Execute cache command
      await this.executeCacheCommand(item.file_path);

      // Update item status to completed
      await CacheJobItemModel.updateStatus(
        jobId, 
        item.file_path, 
        'completed', 
        this.workerId
      );

      // Defer file database operations - they'll be handled in batch
      // This significantly reduces database load

      // console.log(`File completed: ${item.file_path} for job ${jobId}`);
      this.emit('file-completed', {
        workerId: this.workerId,
        jobId: jobId,
        filePath: item.file_path
      });

      // Progress updates are handled periodically in processJobItems, not per-file

    } catch (error) {
      console.error(`Error caching file ${item.file_path}:`, error);
      
      // Update item status to failed
      await CacheJobItemModel.updateStatus(
        jobId, 
        item.file_path, 
        'failed', 
        this.workerId,
        error.message
      );

      // Update job progress immediately after file failure
      await this.updateJobProgress(jobId);

      this.emit('file-failed', {
        workerId: this.workerId,
        jobId: jobId,
        filePath: item.file_path,
        error: error.message
      });

    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  async updateJobProgress(jobId) {
    try {
      console.log(`Updating progress for job ${jobId} after file completion`);
      await CacheJobModel.updateProgress(jobId);
      
      // Force a progress broadcast
      const updatedJob = await CacheJobModel.findById(jobId);
      if (updatedJob) {
        console.log(`Broadcasting progress: ${updatedJob.completed_files}/${updatedJob.total_files} files completed`);
        this.emit('job-progress', {
          workerId: this.workerId,
          jobId: jobId,
          completedFiles: updatedJob.completed_files,
          totalFiles: updatedJob.total_files,
          failedFiles: updatedJob.failed_files
        });
      } else {
        console.log(`Could not find job ${jobId} for progress update`);
      }
    } catch (error) {
      console.error(`Error updating job progress for ${jobId}:`, error);
    }
  }

  async executeCacheCommand(filePath) {
    return new Promise((resolve, reject) => {
      // Execute: cp /path/to/file /dev/null (force complete file read for caching)
      const cp = spawn('cp', [filePath, '/dev/null']);
      
      let stderr = '';
      
      cp.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      cp.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`cp command failed with code ${code}: ${stderr}`));
        }
      });
      
      cp.on('error', (error) => {
        reject(new Error(`Failed to spawn cp process: ${error.message}`));
      });
    });
  }

  async ensureParentDirectoriesExist(filePath) {
    // Get all parent directories up to root
    const parents = [];
    let currentPath = path.dirname(filePath);
    
    while (currentPath && currentPath !== '/' && currentPath !== '.') {
      parents.unshift(currentPath); // Add to beginning to process from root down
      currentPath = path.dirname(currentPath);
    }
    
    // Check and create parent directories from root down
    for (const parentPath of parents) {
      const exists = await FileModel.findByPath(parentPath);
      if (!exists) {
        try {
          const stats = await fs.stat(parentPath);
          const dirData = {
            path: parentPath,
            name: path.basename(parentPath),
            parent_path: path.dirname(parentPath),
            is_directory: true,
            size: stats.size,
            modified_at: stats.mtime,
            permissions: stats.mode,
            metadata: {
              auto_indexed_by_cache: true
            }
          };
          await FileModel.upsert(dirData);
          console.log(`Auto-indexed parent directory: ${parentPath}`);
        } catch (error) {
          console.error(`Failed to index parent directory ${parentPath}:`, error);
        }
      }
    }
  }

  async markDirectoriesAsCached(directoryPaths, jobId) {
    console.log(`Validating and marking ${directoryPaths.length} directories as cached for job ${jobId}`);
    
    const results = { validated: 0, failed: 0 };
    
    for (const dirPath of directoryPaths) {
      try {
        const isValid = await FileModel.updateDirectoryCacheIfValid(dirPath, jobId);
        if (isValid) {
          results.validated++;
        } else {
          results.failed++;
        }
      } catch (error) {
        console.error(`Failed to validate/mark directory as cached: ${dirPath}`, error);
        results.failed++;
      }
    }
    
    console.log(`Directory validation complete: ${results.validated} validated, ${results.failed} failed`);
    return results;
  }

  getStatus() {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      currentJob: this.currentJob?.id || null,
      activeOperations: this.activeOperations.size,
      maxConcurrentFiles: this.maxConcurrentFiles
    };
  }
}

module.exports = CacheWorker;