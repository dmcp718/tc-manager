const VideoPreviewWorker = require('./video-preview-worker');
const EventEmitter = require('events');

class VideoPreviewManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workers = new Map();
    this.workerCount = options.workerCount || 1;
    this.workerOptions = options.workerOptions || {};
    this.mediaPreviewService = options.mediaPreviewService;
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      console.log('VideoPreviewManager is already running');
      return;
    }

    console.log(`Starting VideoPreviewManager with ${this.workerCount} workers`);
    this.isRunning = true;

    // Create and start workers
    for (let i = 0; i < this.workerCount; i++) {
      await this.createWorker(i);
    }

    this.emit('manager-started', { 
      workerCount: this.workers.size 
    });
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping VideoPreviewManager');
    this.isRunning = false;

    // Stop all workers
    const stopPromises = Array.from(this.workers.values()).map(worker => worker.stop());
    await Promise.all(stopPromises);

    this.workers.clear();
    this.emit('manager-stopped');
  }

  async createWorker(index) {
    const workerId = `video-preview-worker-${index}`;
    
    const worker = new VideoPreviewWorker({
      ...this.workerOptions,
      workerId,
      mediaPreviewService: this.mediaPreviewService
    });

    this.setupWorkerEvents(worker);
    this.workers.set(workerId, worker);
    
    await worker.start();
    console.log(`Created and started worker: ${workerId}`);
  }

  setupWorkerEvents(worker) {
    // Forward worker events
    worker.on('worker-started', (data) => {
      this.emit('worker-started', data);
    });

    worker.on('worker-stopped', (data) => {
      this.emit('worker-stopped', data);
    });

    worker.on('job-started', (data) => {
      console.log(`Video preview job started: ${data.jobId} by worker ${data.workerId}`);
      this.emit('job-started', data);
    });

    worker.on('job-completed', (data) => {
      console.log(`Video preview job completed: ${data.jobId} by worker ${data.workerId}`);
      this.emit('job-completed', data);
    });

    worker.on('job-failed', (data) => {
      console.error(`Video preview job failed: ${data.jobId} by worker ${data.workerId}`, data.error);
      this.emit('job-failed', data);
    });

    worker.on('job-progress', (data) => {
      this.emit('job-progress', data);
    });

    worker.on('file-started', (data) => {
      this.emit('file-started', data);
    });

    worker.on('file-completed', (data) => {
      this.emit('file-completed', data);
    });

    worker.on('file-failed', (data) => {
      this.emit('file-failed', data);
    });

    worker.on('file-skipped', (data) => {
      this.emit('file-skipped', data);
    });
  }

  getWorkersStatus() {
    const statuses = [];
    
    for (const [workerId, worker] of this.workers) {
      statuses.push(worker.getStatus());
    }
    
    return {
      isRunning: this.isRunning,
      workerCount: this.workers.size,
      workers: statuses
    };
  }

  async adjustWorkerCount(newCount) {
    if (newCount === this.workerCount) {
      return;
    }

    console.log(`Adjusting worker count from ${this.workerCount} to ${newCount}`);

    if (newCount > this.workerCount) {
      // Add more workers
      for (let i = this.workerCount; i < newCount; i++) {
        await this.createWorker(i);
      }
    } else {
      // Remove workers
      const workersToRemove = this.workerCount - newCount;
      const workerIds = Array.from(this.workers.keys()).slice(-workersToRemove);
      
      for (const workerId of workerIds) {
        const worker = this.workers.get(workerId);
        await worker.stop();
        this.workers.delete(workerId);
      }
    }

    this.workerCount = newCount;
    this.emit('worker-count-changed', { newCount });
  }
}

module.exports = VideoPreviewManager;