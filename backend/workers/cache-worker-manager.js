const CacheWorker = require('./cache-worker');
const EventEmitter = require('events');

class CacheWorkerManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.workers = new Map();
    this.workerCount = options.workerCount || 1;
    this.workerOptions = options.workerOptions || {};
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      console.log('CacheWorkerManager is already running');
      return;
    }

    console.log(`Starting CacheWorkerManager with ${this.workerCount} workers`);
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

    console.log('Stopping CacheWorkerManager');
    this.isRunning = false;

    // Stop all workers
    const stopPromises = Array.from(this.workers.values()).map(worker => worker.stop());
    await Promise.all(stopPromises);

    this.workers.clear();
    this.emit('manager-stopped');
  }

  setupWorkerEvents(worker) {
    // Forward worker events
    worker.on('worker-started', (data) => {
      console.log(`Worker ${data.workerId} started`);
      this.emit('worker-started', data);
    });

    worker.on('worker-stopped', (data) => {
      console.log(`Worker ${data.workerId} stopped`);
      this.emit('worker-stopped', data);
    });

    worker.on('worker-error', (data) => {
      console.error(`Worker ${data.workerId} error:`, data.error);
      this.emit('worker-error', data);
    });

    worker.on('job-started', (data) => {
      console.log(`Worker ${data.workerId} started job ${data.jobId}`);
      this.emit('job-started', data);
    });

    worker.on('job-completed', (data) => {
      console.log(`Worker ${data.workerId} completed job ${data.jobId}: ${data.completedFiles} files cached, ${data.failedFiles} failed`);
      this.emit('job-completed', data);
    });

    worker.on('job-failed', (data) => {
      console.error(`Worker ${data.workerId} failed job ${data.jobId}:`, data.error);
      this.emit('job-failed', data);
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

    worker.on('job-progress', (data) => {
      this.emit('job-progress', data);
    });
  }

  async createWorker(index) {
    const workerId = `cache-worker-${index + 1}`;
    const worker = new CacheWorker({
      ...this.workerOptions,
      workerId
    });

    this.setupWorkerEvents(worker);
    this.workers.set(workerId, worker);
    await worker.start();

    return worker;
  }

  async restartWorker(workerId) {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    console.log(`Restarting worker ${workerId}`);
    await worker.stop();
    
    // Extract index from workerId (e.g., "cache-worker-1" -> 0)
    const index = parseInt(workerId.split('-').pop()) - 1;
    await this.createWorker(index);
  }

  getWorkerStatuses() {
    const statuses = {};
    for (const [workerId, worker] of this.workers) {
      statuses[workerId] = worker.getStatus();
    }
    return statuses;
  }

  getOverallStatus() {
    const workerStatuses = this.getWorkerStatuses();
    const workers = Object.values(workerStatuses);
    
    return {
      isRunning: this.isRunning,
      totalWorkers: this.workers.size,
      activeWorkers: workers.filter(w => w.isRunning).length,
      workersWithJobs: workers.filter(w => w.currentJob).length,
      totalActiveOperations: workers.reduce((sum, w) => sum + w.activeOperations, 0),
      workers: workerStatuses
    };
  }

  async adjustWorkers(targetCount, workerOptions = {}) {
    console.log(`Adjusting workers from ${this.workers.size} to ${targetCount}`);
    
    const currentCount = this.workers.size;
    
    if (targetCount > currentCount) {
      // Add more workers
      for (let i = currentCount; i < targetCount; i++) {
        const workerId = `cache-worker-${i + 1}`;
        const worker = new CacheWorker({
          workerId,
          ...this.defaultWorkerOptions,
          ...workerOptions
        });
        
        this.setupWorkerEvents(worker);
        this.workers.set(workerId, worker);
        await worker.start();
        
        console.log(`Added worker ${workerId} with options:`, workerOptions);
      }
    } else if (targetCount < currentCount) {
      // Remove excess workers (stop them gracefully)
      const workersToRemove = Array.from(this.workers.keys()).slice(targetCount);
      
      for (const workerId of workersToRemove) {
        const worker = this.workers.get(workerId);
        if (worker) {
          console.log(`Stopping worker ${workerId}`);
          await worker.stop();
          this.workers.delete(workerId);
        }
      }
    }
    
    // Update options for existing workers if provided
    if (Object.keys(workerOptions).length > 0) {
      for (const worker of this.workers.values()) {
        if (workerOptions.maxConcurrentFiles !== undefined) {
          worker.maxConcurrentFiles = workerOptions.maxConcurrentFiles;
        }
        if (workerOptions.pollInterval !== undefined) {
          worker.pollInterval = workerOptions.pollInterval;
        }
        console.log(`Updated worker ${worker.workerId} options:`, workerOptions);
      }
    }
  }
}

// Singleton instance
let managerInstance = null;

function getCacheWorkerManager(options) {
  if (!managerInstance) {
    managerInstance = new CacheWorkerManager(options);
  }
  return managerInstance;
}

module.exports = {
  CacheWorkerManager,
  getCacheWorkerManager
};