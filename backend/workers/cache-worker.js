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
    const batchSize = this.maxConcurrentFiles;
    
    while (!this.shouldStop) {
      // Check if job has been paused or cancelled - check more frequently
      const currentJob = await CacheJobModel.findById(jobId);
      if (!currentJob || ['paused', 'cancelled'].includes(currentJob.status)) {
        console.log(`Job ${jobId} is ${currentJob?.status || 'not found'}, stopping processing immediately`);
        
        // Cancel any active operations for this job
        for (const operationKey of this.activeOperations) {
          if (operationKey.startsWith(`${jobId}:`)) {
            console.log(`Cancelling active operation: ${operationKey}`);
            this.activeOperations.delete(operationKey);
          }
        }
        
        break;
      }
      
      // Get next batch of pending items
      const pendingItems = await CacheJobItemModel.findPendingByJob(jobId, batchSize);
      
      console.log(`Job ${jobId}: Found ${pendingItems.length} pending items to process`);
      
      if (pendingItems.length === 0) {
        console.log(`Job ${jobId}: No more pending items, finishing`);
        break; // No more items to process
      }

      // Process items concurrently
      const promises = pendingItems.map(item => this.processJobItem(jobId, item));
      await Promise.all(promises);
      
      // Update job progress after processing each batch
      console.log(`Updating progress for job ${jobId} after processing batch`);
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
    }
  }

  async processJobItem(jobId, item) {
    const operationId = `${jobId}-${item.file_path}`;
    this.activeOperations.add(operationId);

    try {
      console.log(`Caching file: ${item.file_path}`);
      
      // Update item status to running
      await CacheJobItemModel.updateStatus(
        jobId, 
        item.file_path, 
        'running', 
        this.workerId
      );

      this.emit('file-started', {
        workerId: this.workerId,
        jobId: jobId,
        filePath: item.file_path
      });

      // Check if job was cancelled before executing cache command
      const jobCheck = await CacheJobModel.findById(jobId);
      if (!jobCheck || ['cancelled', 'paused'].includes(jobCheck.status)) {
        console.log(`Job ${jobId} was cancelled/paused, skipping file ${item.file_path}`);
        await CacheJobItemModel.updateStatus(jobId, item.file_path, 'cancelled', this.workerId);
        return;
      }

      // Execute cache command
      await this.executeCacheCommand(item.file_path);

      // Update item status to completed
      await CacheJobItemModel.updateStatus(
        jobId, 
        item.file_path, 
        'completed', 
        this.workerId
      );

      // Check if file exists in database, if not add it with metadata
      const fileExists = await FileModel.findByPath(item.file_path);
      if (!fileExists) {
        try {
          console.log(`File not in database, collecting metadata: ${item.file_path}`);
          
          // Collect file metadata
          const stats = await fs.stat(item.file_path);
          const fileData = {
            path: item.file_path,
            name: path.basename(item.file_path),
            parent_path: path.dirname(item.file_path),
            is_directory: false, // Cache jobs only process files, not directories
            size: stats.size,
            modified_at: stats.mtime,
            permissions: stats.mode,
            metadata: {
              auto_indexed_by_cache: true,
              cache_job_id: jobId
            }
          };
          
          // Ensure parent directories exist in database
          await this.ensureParentDirectoriesExist(item.file_path);
          
          // Insert file record
          await FileModel.upsert(fileData);
          console.log(`Auto-indexed file during cache operation: ${item.file_path}`);
          
        } catch (metadataError) {
          console.error(`Failed to collect metadata for ${item.file_path}:`, metadataError);
          // Continue with cache operation even if metadata collection fails
        }
      }

      // Update file cache status
      await FileModel.updateCacheStatus(item.file_path, true, jobId);

      console.log(`File completed: ${item.file_path} for job ${jobId}`);
      this.emit('file-completed', {
        workerId: this.workerId,
        jobId: jobId,
        filePath: item.file_path
      });

      // Update job progress immediately after each file completion
      await this.updateJobProgress(jobId);

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