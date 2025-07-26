const { parentPort, workerData } = require('worker_threads');
const fs = require('fs').promises;
const path = require('path');

// Worker thread for parallel directory indexing
class IndexingWorker {
  constructor(workerData) {
    this.dirPath = workerData.dirPath;
    this.depth = workerData.depth;
    this.maxDepth = workerData.maxDepth || 50;
    this.skipPatterns = workerData.skipPatterns || [];
    this.skipDirs = workerData.skipDirs || [];
    this.batchSize = workerData.batchSize || 100;
    this.files = [];
    this.subdirectories = [];
  }

  async process() {
    try {
      await this.indexDirectory();
      
      // Send results back to main thread
      parentPort.postMessage({
        type: 'success',
        dirPath: this.dirPath,
        files: this.files,
        subdirectories: this.subdirectories,
        stats: {
          fileCount: this.files.length,
          dirCount: this.subdirectories.length
        }
      });
    } catch (error) {
      parentPort.postMessage({
        type: 'error',
        dirPath: this.dirPath,
        error: error.message,
        stack: error.stack
      });
    }
  }

  async indexDirectory() {
    if (this.depth > this.maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(this.dirPath, { withFileTypes: true });
      
      // Filter valid entries
      const validEntries = entries.filter(entry => {
        const fullPath = path.join(this.dirPath, entry.name);
        return !this.shouldSkip(fullPath);
      });

      // Batch process file stats
      const statPromises = validEntries.map(async (entry) => {
        const fullPath = path.join(this.dirPath, entry.name);
        try {
          const stats = await fs.stat(fullPath);
          return { entry, fullPath, stats, error: null };
        } catch (error) {
          return { entry, fullPath, stats: null, error };
        }
      });

      const statResults = await Promise.allSettled(statPromises);

      // Process results and separate files from directories
      for (const result of statResults) {
        if (result.status === 'fulfilled' && result.value.stats) {
          const { entry, fullPath, stats } = result.value;
          
          const fileData = {
            path: fullPath,
            name: entry.name,
            parent_path: this.dirPath,
            is_directory: entry.isDirectory(),
            size: stats.size,
            modified_at: stats.mtime,
            permissions: stats.mode
          };

          this.files.push(fileData);

          // Collect subdirectories for further processing
          if (entry.isDirectory() && this.depth < this.maxDepth) {
            this.subdirectories.push(fullPath);
          }

          // Send batch updates periodically
          if (this.files.length >= this.batchSize) {
            parentPort.postMessage({
              type: 'batch',
              dirPath: this.dirPath,
              files: this.files.splice(0, this.batchSize)
            });
          }
        }
      }
    } catch (error) {
      throw new Error(`Error reading directory ${this.dirPath}: ${error.message}`);
    }
  }

  shouldSkip(filePath) {
    // Check skip patterns
    if (this.skipPatterns.some(pattern => new RegExp(pattern).test(filePath))) {
      return true;
    }

    // Check skip directories
    const pathSegments = filePath.split(path.sep);
    return this.skipDirs.some(skip => 
      pathSegments.includes(skip) ||
      filePath.includes(`${path.sep}${skip}${path.sep}`) ||
      filePath.endsWith(`${path.sep}${skip}`)
    );
  }
}

// Start worker processing
if (workerData) {
  const worker = new IndexingWorker(workerData);
  worker.process();
}