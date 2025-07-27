const EventEmitter = require('events');
const path = require('path');
const { 
  VideoPreviewJobModel, 
  VideoPreviewJobItemModel,
  FileModel 
} = require('../database');
const { MediaPreviewService } = require('../services/media-preview-service');

class VideoPreviewWorker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workerId = options.workerId || `video-preview-worker-${Date.now()}`;
    this.isRunning = false;
    this.currentJob = null;
    this.shouldStop = false;
    this.maxConcurrentFiles = options.maxConcurrentFiles || 2;
    this.activeOperations = new Set();
    this.pollInterval = options.pollInterval || 5000; // 5 seconds
    this.pollTimer = null;
    this.mediaPreviewService = options.mediaPreviewService;
  }

  async start() {
    if (this.isRunning) {
      console.log(`VideoPreviewWorker ${this.workerId} is already running`);
      return;
    }

    console.log(`Starting VideoPreviewWorker ${this.workerId}`);
    this.isRunning = true;
    this.shouldStop = false;
    
    // Start polling for jobs
    this.pollForJobs();
    
    this.emit('worker-started', { workerId: this.workerId });
  }

  async stop() {
    console.log(`Stopping VideoPreviewWorker ${this.workerId}`);
    this.shouldStop = true;
    
    // Clear polling timer
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wait for active operations to complete
    if (this.activeOperations.size > 0) {
      console.log(`Waiting for ${this.activeOperations.size} active operations to complete`);
      await this.waitForActiveOperations();
    }

    this.isRunning = false;
    this.emit('worker-stopped', { workerId: this.workerId });
  }

  async pollForJobs() {
    if (this.shouldStop) {
      return;
    }

    try {
      // Check if we have capacity
      if (this.activeOperations.size >= this.maxConcurrentFiles) {
        // Schedule next poll
        this.pollTimer = setTimeout(() => this.pollForJobs(), this.pollInterval);
        return;
      }

      // Find a pending job
      const job = await VideoPreviewJobModel.findPending();
      
      if (job) {
        console.log(`Found pending video preview job: ${job.id}`);
        this.currentJob = job;
        
        // Mark job as running
        await VideoPreviewJobModel.updateStatus(job.id, 'running', this.workerId);
        
        this.emit('job-started', {
          jobId: job.id,
          workerId: this.workerId,
          totalFiles: job.total_files
        });
        
        // Process the job
        await this.processJob(job);
      }
    } catch (error) {
      console.error('Error polling for video preview jobs:', error);
    }

    // Schedule next poll
    if (!this.shouldStop) {
      this.pollTimer = setTimeout(() => this.pollForJobs(), this.pollInterval);
    }
  }

  async processJob(job) {
    console.log(`Processing video preview job ${job.id} with ${job.total_files} files`);
    
    let completedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const startTime = Date.now();

    try {
      // Get all pending items for this job
      let hasMoreItems = true;
      
      while (hasMoreItems && !this.shouldStop) {
        // Wait if we're at capacity
        while (this.activeOperations.size >= this.maxConcurrentFiles && !this.shouldStop) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (this.shouldStop) break;
        
        // Get next batch of items
        const items = await VideoPreviewJobItemModel.findPendingByJob(
          job.id, 
          this.maxConcurrentFiles - this.activeOperations.size
        );
        
        if (items.length === 0) {
          hasMoreItems = false;
          break;
        }
        
        // Process items concurrently
        const promises = items.map(item => this.processItem(item, job));
        const results = await Promise.allSettled(promises);
        
        // Count results
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const status = result.value;
            if (status === 'completed') {
              completedCount++;
            } else if (status === 'skipped') {
              skippedCount++;
            } else {
              failedCount++;
            }
          } else {
            failedCount++;
            console.error(`Failed to process item ${items[index].id}:`, result.reason);
          }
        });
        
        // Update job progress
        await VideoPreviewJobModel.updateProgress(job.id, completedCount, failedCount, skippedCount);
        
        this.emit('job-progress', {
          jobId: job.id,
          workerId: this.workerId,
          completedFiles: completedCount,
          failedFiles: failedCount,
          skippedFiles: skippedCount,
          totalFiles: job.total_files,
          progress: Math.round(((completedCount + failedCount + skippedCount) / job.total_files) * 100)
        });
      }
      
      // Wait for any remaining operations
      await this.waitForActiveOperations();
      
      // Mark job as completed
      const finalStatus = this.shouldStop ? 'cancelled' : 'completed';
      await VideoPreviewJobModel.updateStatus(job.id, finalStatus);
      
      const duration = Date.now() - startTime;
      this.emit('job-completed', {
        jobId: job.id,
        workerId: this.workerId,
        status: finalStatus,
        completedFiles: completedCount,
        failedFiles: failedCount,
        skippedFiles: skippedCount,
        totalFiles: job.total_files,
        duration: duration
      });
      
      console.log(`Video preview job ${job.id} completed in ${duration}ms`);
      
    } catch (error) {
      console.error(`Error processing video preview job ${job.id}:`, error);
      await VideoPreviewJobModel.setError(job.id, error.message);
      
      this.emit('job-failed', {
        jobId: job.id,
        workerId: this.workerId,
        error: error.message
      });
    } finally {
      this.currentJob = null;
    }
  }

  async processItem(item, job) {
    const operationId = `${item.id}-${Date.now()}`;
    this.activeOperations.add(operationId);
    
    try {
      console.log(`Processing video preview item: ${item.file_path}`);
      
      // Mark item as running
      await VideoPreviewJobItemModel.updateStatus(item.id, 'running', this.workerId);
      
      this.emit('file-started', {
        jobId: job.id,
        itemId: item.id,
        filePath: item.file_path,
        workerId: this.workerId
      });
      
      // Check if file is a video
      const fileType = MediaPreviewService.getPreviewType(item.file_path);
      if (fileType !== 'video') {
        await VideoPreviewJobItemModel.setSkipped(item.id, 'not_video');
        return 'skipped';
      }
      
      // Check if file is web-compatible
      if (MediaPreviewService.isWebCompatibleVideo(item.file_path)) {
        await VideoPreviewJobItemModel.setSkipped(item.id, 'web_compatible');
        this.emit('file-skipped', {
          jobId: job.id,
          itemId: item.id,
          filePath: item.file_path,
          reason: 'web_compatible',
          workerId: this.workerId
        });
        return 'skipped';
      }
      
      // Generate preview using MediaPreviewService
      const preview = await this.mediaPreviewService.generateVideoPreview(item.file_path, {
        profileId: job.profile_id,
        forceTranscode: true
      });
      
      // Check if preview was actually generated or if it already existed
      if (preview.alreadyTranscoded) {
        await VideoPreviewJobItemModel.setSkipped(item.id, 'already_transcoded');
        this.emit('file-skipped', {
          jobId: job.id,
          itemId: item.id,
          filePath: item.file_path,
          reason: 'already_transcoded',
          workerId: this.workerId
        });
        return 'skipped';
      }
      
      // Wait for transcoding to complete
      let checkCount = 0;
      const maxChecks = 600; // 10 minutes max
      while (preview.status === 'processing' && checkCount < maxChecks) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const status = await this.mediaPreviewService.getPreviewStatus(preview.cacheKey);
        if (status && status.status !== 'processing') {
          preview.status = status.status;
          break;
        }
        checkCount++;
      }
      
      if (preview.status === 'completed' || preview.status === 'progressive_ready') {
        // Mark item as completed
        await VideoPreviewJobItemModel.setCompleted(
          item.id, 
          preview.cacheKey, 
          preview.outputDir
        );
        
        this.emit('file-completed', {
          jobId: job.id,
          itemId: item.id,
          filePath: item.file_path,
          cacheKey: preview.cacheKey,
          workerId: this.workerId
        });
        
        return 'completed';
      } else {
        throw new Error(`Preview generation failed with status: ${preview.status}`);
      }
      
    } catch (error) {
      console.error(`Error processing video preview item ${item.id}:`, error);
      await VideoPreviewJobItemModel.setError(item.id, error.message);
      
      this.emit('file-failed', {
        jobId: job.id,
        itemId: item.id,
        filePath: item.file_path,
        error: error.message,
        workerId: this.workerId
      });
      
      return 'failed';
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  async waitForActiveOperations() {
    while (this.activeOperations.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  getStatus() {
    return {
      workerId: this.workerId,
      isRunning: this.isRunning,
      currentJob: this.currentJob ? {
        id: this.currentJob.id,
        totalFiles: this.currentJob.total_files
      } : null,
      activeOperations: this.activeOperations.size
    };
  }
}

module.exports = VideoPreviewWorker;