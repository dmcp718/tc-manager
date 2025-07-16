const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

// Import logger
const logger = require('./logger');

// Import database models
const { 
  pool,
  testConnection, 
  FileModel, 
  CacheJobModel, 
  CacheJobItemModel,
  IndexProgressModel,
  CacheJobProfileModel
} = require('./database');

// Import indexer
const { getIndexer } = require('./indexer');

// Import cache worker manager
const { getCacheWorkerManager } = require('./workers/cache-worker-manager');

// Import network stats workers
const NetworkStatsWorker = require('./network-stats-worker');
const LucidLinkStatsWorker = require('./lucidlink-stats-worker');
const VarnishStatsWorker = require('./varnish-stats-worker');

const app = express();
const PORT = process.env.PORT || 3001;
const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for large file arrays

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    });
    
    originalSend.call(this, data);
  };
  
  next();
});

// In-memory job storage (for backward compatibility)
const jobs = new Map();

// Global stats workers for API access
let varnishStatsWorkerInstance = null;

// WebSocket server
const wss = new WebSocket.Server({ port: WEBSOCKET_PORT });

// Broadcast to all connected clients
function broadcast(data) {
  const clientCount = Array.from(wss.clients).filter(client => client.readyState === WebSocket.OPEN).length;
  console.log(`Broadcasting ${data.type} to ${clientCount} WebSocket clients:`, data);
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Get file stats with additional metadata
async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const parsedPath = path.parse(filePath);
    
    return {
      name: parsedPath.name + parsedPath.ext,
      path: filePath,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime,
      extension: parsedPath.ext,
      permissions: stats.mode
    };
  } catch (error) {
    console.error(`Error getting stats for ${filePath}:`, error);
    return null;
  }
}

// Sync file from filesystem to database
async function syncFileToDatabase(filePath) {
  try {
    const fileStats = await getFileStats(filePath);
    if (!fileStats) return null;

    const parentPath = path.dirname(filePath);
    const fileData = {
      path: filePath,
      name: fileStats.name,
      parent_path: parentPath === filePath ? null : parentPath,
      is_directory: fileStats.isDirectory,
      size: fileStats.size,
      modified_at: fileStats.modified,
      permissions: fileStats.permissions
    };

    return await FileModel.upsert(fileData);
  } catch (error) {
    console.error('Error syncing file to database:', error);
    return null;
  }
}

// Root route - API status
app.get('/', (req, res) => {
  res.json({
    name: 'File Explorer Backend v2',
    version: '2.0.0',
    status: 'running',
    database: 'postgresql',
    features: ['lazy-loading', 'database-sync', 'caching', 'indexing'],
    endpoints: {
      roots: '/api/roots',
      files: '/api/files?path={path}',
      actions: '/api/actions?path={path}',
      execute: 'POST /api/execute',
      jobs: '/api/jobs',
      job: '/api/jobs/{id}',
      search: '/api/search?q={query}',
      stats: '/api/stats',
      indexStart: 'POST /api/index/start',
      indexStatus: '/api/index/status',
      indexStop: 'POST /api/index/stop',
      indexHistory: '/api/index/history',
      directorySize: '/api/directory-size?path={path}',
      directorySizes: 'POST /api/directory-sizes',
      cacheJobStart: 'POST /api/jobs/:id/start',
      cacheJobPause: 'POST /api/jobs/:id/pause',
      cacheJobCancel: 'POST /api/jobs/:id/cancel',
      cacheWorkerStatus: '/api/workers/status',
      clearJobs: 'POST /api/jobs/clear',
      validateDirectoryCache: 'POST /api/validate-directory-cache'
    },
    websocket: `ws://localhost:${WEBSOCKET_PORT}`,
    indexPath: process.env.INDEX_ROOT_PATH || '/media/lucidlink-1'
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: false,
      filesystem: false,
      workers: false
    }
  };

  try {
    // Check database connection
    const dbResult = await pool.query('SELECT 1');
    health.checks.database = dbResult.rows.length === 1;
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = false;
    health.errors = health.errors || {};
    health.errors.database = error.message;
  }

  try {
    // Check filesystem access
    const mountPath = process.env.INDEX_ROOT_PATH || '/media/lucidlink-1';
    await fs.access(mountPath);
    health.checks.filesystem = true;
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.filesystem = false;
    health.errors = health.errors || {};
    health.errors.filesystem = error.message;
  }

  try {
    // Check cache workers
    const cacheManager = getCacheWorkerManager();
    const workerStatus = await cacheManager.getWorkersStatus();
    health.checks.workers = workerStatus.some(w => w.status === 'idle' || w.status === 'busy');
    health.workerCount = workerStatus.length;
  } catch (error) {
    health.checks.workers = false;
    health.errors = health.errors || {};
    health.errors.workers = error.message;
  }

  // Set appropriate status code
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Get root directories - check database first, fallback to filesystem
app.get('/api/roots', async (req, res) => {
  try {
    // Try to get roots from database first
    let roots = await FileModel.findRoots();
    
    // If no roots in database, fallback to filesystem discovery
    if (roots.length === 0) {
      console.log('No roots in database, checking LucidLink mount');
      
      const fsPath = process.env.INDEX_ROOT_PATH || '/media/lucidlink-1';
      try {
        const stats = await fs.stat(fsPath);
        if (stats.isDirectory()) {
          // Sync to database
          await syncFileToDatabase(fsPath);
          
          // Check if path has been indexed
          const indexedInfo = await IndexProgressModel.isPathIndexed(fsPath);
          
          roots = [{
            name: process.env.LUCIDLINK_FILESPACE || path.basename(fsPath),
            path: fsPath,
            isDirectory: true,
            size: 0,
            modified: stats.mtime,
            created: stats.birthtime,
            extension: '',
            permissions: stats.mode,
            cached: false,
            indexed: !!indexedInfo,
            indexedAt: indexedInfo ? indexedInfo.completed_at : null
          }];
        }
      } catch (error) {
        console.error('LucidLink mount not found at:', fsPath);
        // Return empty array if LucidLink mount doesn't exist
        roots = [];
      }
    } else {
      // Validate database entries against filesystem
      const validRoots = [];
      for (const root of roots) {
        try {
          const stats = await fs.stat(root.path);
          if (stats.isDirectory()) {
            // Check if path has been indexed
            const indexedInfo = await IndexProgressModel.isPathIndexed(root.path);
            
            validRoots.push({
              name: root.name,
              path: root.path,
              isDirectory: root.is_directory,
              size: root.size,
              modified: root.modified_at,
              created: root.modified_at, // Use modified_at as fallback for created date
              extension: '',
              permissions: root.permissions,
              cached: root.cached,
              indexed: !!indexedInfo,
              indexedAt: indexedInfo ? indexedInfo.completed_at : null
            });
          }
        } catch (error) {
          // Remove invalid entries from database
          console.log(`Removing invalid root from database: ${root.path}`);
          // In a production system, you might want to mark as invalid instead of deleting
        }
      }
      
      // If no valid roots found, fallback to filesystem discovery
      if (validRoots.length === 0) {
        console.log('No valid roots in database, checking LucidLink mount');
        const fsPath = process.env.INDEX_ROOT_PATH || '/media/lucidlink-1';
        try {
          const stats = await fs.stat(fsPath);
          if (stats.isDirectory()) {
            await syncFileToDatabase(fsPath);
            
            // Check if path has been indexed
            const indexedInfo = await IndexProgressModel.isPathIndexed(fsPath);
            
            validRoots.push({
              name: process.env.LUCIDLINK_FILESPACE || path.basename(fsPath),
              path: fsPath,
              isDirectory: true,
              size: 0,
              modified: stats.mtime,
              created: stats.birthtime,
              extension: '',
              permissions: stats.mode,
              cached: false,
              indexed: !!indexedInfo,
              indexedAt: indexedInfo ? indexedInfo.completed_at : null
            });
          }
        } catch (error) {
          console.error('LucidLink mount not found at:', fsPath);
          // Return empty array if LucidLink mount doesn't exist
        }
      }
      
      roots = validRoots;
    }
    
    res.json(roots);
  } catch (error) {
    console.error('Error getting roots:', error);
    res.status(500).json({ error: 'Failed to get root directories' });
  }
});

// Get files in a directory - hybrid approach (database + filesystem)
app.get('/api/files', async (req, res) => {
  try {
    const dirPath = req.query.path;
    if (!dirPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }
    
    // Security check - only allow LucidLink mount
    const allowedPaths = (process.env.ALLOWED_PATHS || '/media/lucidlink-1').split(',');
    const isAllowed = allowedPaths.some(allowed => dirPath.startsWith(allowed.trim()));
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }
    
    // Try to get from database first
    let dbFiles = await FileModel.findChildren(dirPath);
    
    // Always sync with filesystem for real-time data
    let fsFiles = [];
    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        // Skip hidden files
        if (item.startsWith('.') && !item.startsWith('..')) {
          continue;
        }
        
        const fullPath = path.join(dirPath, item);
        const fileStats = await getFileStats(fullPath);
        
        if (fileStats) {
          // Sync to database in background
          syncFileToDatabase(fullPath).catch(err => 
            console.error('Background sync error:', err)
          );
          
          fsFiles.push({
            name: fileStats.name,
            path: fullPath,
            isDirectory: fileStats.isDirectory,
            size: fileStats.size,
            modified: fileStats.modified,
            created: fileStats.created,
            extension: fileStats.extension,
            permissions: fileStats.permissions,
            cached: false // Will be updated from database
          });
        }
      }
    } catch (fsError) {
      console.error('Filesystem error, using database only:', fsError);
      // If filesystem fails, use database data
      fsFiles = dbFiles.map(file => ({
        name: file.name,
        path: file.path,
        isDirectory: file.is_directory,
        size: file.size,
        modified: file.modified_at,
        created: file.modified_at, // Use modified_at as fallback for created date
        extension: path.extname(file.path),
        permissions: file.permissions,
        cached: file.cached
      }));
    }
    
    // Merge filesystem data with database cache status and computed sizes
    const dbFileMap = new Map(dbFiles.map(f => [f.path, f]));
    const mergedFiles = await Promise.all(fsFiles.map(async (fsFile) => {
      const dbFile = dbFileMap.get(fsFile.path);
      
      // For directories, include computed size if available
      let computedSize = null;
      if (fsFile.isDirectory && dbFile?.metadata?.computed_size) {
        computedSize = dbFile.metadata.computed_size;
      }
      
      // For directories marked as cached, validate the cache status
      let validatedCached = dbFile ? dbFile.cached : false;
      if (fsFile.isDirectory && validatedCached) {
        try {
          // Quick validation without updating - just check if cache status is accurate
          const validation = await FileModel.validateDirectoryCacheStatus(fsFile.path);
          if (!validation.should_be_cached) {
            validatedCached = false;
            // Update in background to correct the status
            FileModel.updateCacheStatus(fsFile.path, false, null).catch(err => 
              console.error('Background cache status correction error:', err)
            );
          }
        } catch (error) {
          console.error(`Error validating cache status for ${fsFile.path}:`, error);
        }
      }
      
      return {
        ...fsFile,
        cached: validatedCached,
        computedSize: computedSize,
        // Override size with computed size for directories
        size: computedSize ? computedSize.size : fsFile.size,
        fileCount: computedSize ? computedSize.file_count : undefined,
        directoryCount: computedSize ? computedSize.directory_count : undefined
      };
    }));
    
    // Sort: directories first, then by name
    mergedFiles.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    res.json(mergedFiles);
  } catch (error) {
    console.error('Error reading directory:', error);
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

// Search files
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    const limit = parseInt(req.query.limit) || 50; // Default to 50 results per page
    const offset = parseInt(req.query.offset) || 0; // Default to start from beginning
    const results = await FileModel.search(query, limit, offset);
    const formattedResults = results.map(file => ({
      name: file.name,
      path: file.path,
      isDirectory: file.is_directory,
      size: file.size,
      modified: file.modified_at,
      created: file.modified_at, // Use modified_at as fallback for created date
      extension: path.extname(file.path),
      cached: file.cached
    }));
    
    res.json(formattedResults);
  } catch (error) {
    console.error('Error searching files:', error);
    res.status(500).json({ error: 'Failed to search files' });
  }
});

// Get cache statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await FileModel.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Cache statistics endpoint for immediate access
app.get('/api/cache-stats', async (req, res) => {
  try {
    if (varnishStatsWorkerInstance) {
      const stats = varnishStatsWorkerInstance.getCurrentStats();
      if (stats) {
        res.json(stats);
      } else {
        res.json({ loading: true, message: 'Cache stats not yet available' });
      }
    } else {
      res.json({ loading: true, message: 'Cache stats worker not initialized' });
    }
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache statistics' });
  }
});

// Indexing endpoints
app.post('/api/index/start', async (req, res) => {
  try {
    const { path: indexPath } = req.body;
    const rootPath = indexPath || process.env.INDEX_ROOT_PATH || '/media/lucidlink-1';
    
    // Security check - only allow LucidLink mount
    const allowedPaths = (process.env.ALLOWED_PATHS || '/media/lucidlink-1').split(',');
    const isAllowed = allowedPaths.some(allowed => rootPath.startsWith(allowed.trim()));
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }
    
    const indexer = getIndexer();
    const status = await indexer.getStatus();
    
    if (status.running) {
      return res.status(400).json({ error: 'Indexing is already in progress' });
    }
    
    // Start indexing in background
    indexer.start(rootPath).catch(err => {
      console.error('Indexing failed:', err);
    });
    
    // Set up progress listeners
    indexer.on('progress', (data) => {
      broadcast({ type: 'index-progress', ...data });
    });
    
    indexer.on('complete', (data) => {
      broadcast({ type: 'index-complete', ...data });
    });
    
    indexer.on('error', (data) => {
      broadcast({ type: 'index-error', ...data });
    });
    
    res.json({ 
      status: 'started',
      path: rootPath,
      message: 'Indexing started in background'
    });
  } catch (error) {
    console.error('Error starting indexing:', error);
    res.status(500).json({ error: 'Failed to start indexing' });
  }
});

app.get('/api/index/status', async (req, res) => {
  try {
    const indexer = getIndexer();
    const status = await indexer.getStatus();
    
    if (status.running && status.progressId) {
      const progress = await IndexProgressModel.findActive();
      res.json({
        running: true,
        progress: progress
      });
    } else {
      res.json({
        running: false
      });
    }
  } catch (error) {
    console.error('Error getting index status:', error);
    res.status(500).json({ error: 'Failed to get index status' });
  }
});

app.post('/api/index/stop', async (req, res) => {
  try {
    const indexer = getIndexer();
    await indexer.stop();
    res.json({ status: 'stopping' });
  } catch (error) {
    console.error('Error stopping indexing:', error);
    res.status(500).json({ error: 'Failed to stop indexing' });
  }
});

app.get('/api/index/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await IndexProgressModel.findAll(limit);
    res.json(history);
  } catch (error) {
    console.error('Error getting index history:', error);
    res.status(500).json({ error: 'Failed to get index history' });
  }
});

// Get available actions for a file
app.get('/api/actions', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }
    
    const fileStats = await getFileStats(filePath);
    if (!fileStats) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const actions = ['cache']; // New cache action
    
    // Add specific actions based on file type
    if (fileStats.extension === '.py') {
      actions.unshift('run');
    }
    
    if (fileStats.extension === '.sh') {
      actions.unshift('execute');
    }
    
    res.json(actions);
  } catch (error) {
    console.error('Error getting actions:', error);
    res.status(500).json({ error: 'Failed to get actions' });
  }
});

// Get or calculate directory size
app.get('/api/directory-size', async (req, res) => {
  try {
    const { path: dirPath } = req.query;
    
    if (!dirPath) {
      return res.status(400).json({ error: 'Path parameter required' });
    }
    
    // Security check - only allow LucidLink mount
    const allowedPaths = (process.env.ALLOWED_PATHS || '/media/lucidlink-1').split(',');
    const isAllowed = allowedPaths.some(allowed => dirPath.startsWith(allowed.trim()));
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }
    
    const sizeInfo = await FileModel.getDirectorySize(dirPath);
    res.json(sizeInfo);
  } catch (error) {
    console.error('Error getting directory size:', error);
    res.status(500).json({ error: 'Failed to get directory size' });
  }
});

// Batch calculate directory sizes
app.post('/api/directory-sizes', async (req, res) => {
  try {
    const { paths } = req.body;
    
    if (!paths || !Array.isArray(paths)) {
      return res.status(400).json({ error: 'Paths array required' });
    }
    
    // Security check
    const allowedPaths = (process.env.ALLOWED_PATHS || '/media/lucidlink-1').split(',');
    const invalidPaths = paths.filter(path => 
      !allowedPaths.some(allowed => path.startsWith(allowed.trim()))
    );
    
    if (invalidPaths.length > 0) {
      return res.status(403).json({ 
        error: 'Access denied to paths',
        invalidPaths 
      });
    }
    
    const results = await FileModel.batchUpdateDirectorySizes(paths);
    res.json(results);
  } catch (error) {
    console.error('Error calculating directory sizes:', error);
    res.status(500).json({ error: 'Failed to calculate directory sizes' });
  }
});

// Get available cache job profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = await CacheJobProfileModel.findAll();
    res.json(profiles);
  } catch (error) {
    console.error('Error getting profiles:', error);
    res.status(500).json({ error: 'Failed to get profiles' });
  }
});

// Create cache job from selected files
app.post('/api/jobs/cache', async (req, res) => {
  try {
    const { filePaths, directories = [], profileName, profileId } = req.body;
    
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return res.status(400).json({ error: 'File paths array required' });
    }
    
    // Get profile - by ID, by name, auto-match, or default
    let profile;
    if (profileId) {
      profile = await CacheJobProfileModel.findById(profileId);
      console.log(`Using profile by ID: ${profile?.name}`);
    } else if (profileName) {
      profile = await CacheJobProfileModel.findByName(profileName);
      console.log(`Using profile by name: ${profile?.name}`);
    } else {
      // Auto-select best matching profile based on files
      profile = await CacheJobProfileModel.findBestMatch(filePaths);
      console.log(`Auto-selected profile: ${profile?.name} for ${filePaths.length} files`);
    }
    
    if (!profile) {
      profile = await CacheJobProfileModel.findDefault();
      console.log(`Fallback to default profile: ${profile?.name}`);
    }
    
    // Create job in database with profile
    const job = await CacheJobModel.create(filePaths, directories, profile.id);
    
    // Configure workers based on profile
    const cacheManager = getCacheWorkerManager();
    await cacheManager.adjustWorkers(profile.worker_count, {
      maxConcurrentFiles: profile.max_concurrent_files,
      pollInterval: profile.worker_poll_interval
    });
    
    // Broadcast job creation
    broadcast({ 
      type: 'job-created', 
      jobId: job.id, 
      totalFiles: job.total_files,
      profile: profile.name
    });
    
    res.json({ 
      jobId: job.id, 
      status: 'created',
      totalFiles: job.total_files,
      profile: {
        id: profile.id,
        name: profile.name,
        maxConcurrentFiles: profile.max_concurrent_files,
        workerCount: profile.worker_count
      }
    });
  } catch (error) {
    console.error('Error creating cache job:', error);
    res.status(500).json({ error: 'Failed to create cache job' });
  }
});

// Generate direct link for a file
app.post('/api/direct-link', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }
    
    // Security check - only allow LucidLink mount
    const allowedPaths = (process.env.ALLOWED_PATHS || '/media/lucidlink-1').split(',');
    const isAllowed = allowedPaths.some(allowed => filePath.startsWith(allowed.trim()));
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Direct link generation not allowed for this path' });
    }
    
    // Import DirectLinkService
    const DirectLinkService = require('./services/direct-link-service');
    const directLinkService = new DirectLinkService();
    
    // Generate direct link
    const directLink = await directLinkService.generateDirectLink(filePath);
    
    if (!directLink) {
      return res.status(500).json({ error: 'Failed to generate direct link' });
    }
    
    res.json({ 
      filePath,
      directLink,
      success: true,
      message: 'Direct link generated successfully'
    });
    
  } catch (error) {
    console.error('Error generating direct link:', error);
    res.status(500).json({ error: 'Failed to generate direct link' });
  }
});

// Get all cached files from database
app.get('/api/files/cached', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        path, name, parent_path, is_directory, size, modified_at, 
        cached, cached_at, permissions, metadata
      FROM files 
      WHERE cached = true 
      ORDER BY cached_at DESC, name ASC
    `);
    
    const cachedFiles = result.rows.map(row => ({
      path: row.path,
      name: row.name,
      parentPath: row.parent_path,
      isDirectory: row.is_directory,
      size: row.size,
      modified: row.modified_at,
      cached: row.cached,
      cachedAt: row.cached_at,
      permissions: row.permissions,
      extension: row.path ? row.path.split('.').pop().toLowerCase() : null
    }));
    
    res.json({
      files: cachedFiles,
      count: cachedFiles.length,
      message: `Found ${cachedFiles.length} cached files`
    });
    
  } catch (error) {
    console.error('Error fetching cached files:', error);
    res.status(500).json({ error: 'Failed to fetch cached files' });
  }
});

// Execute a script (legacy support)
app.post('/api/execute', async (req, res) => {
  try {
    const { scriptPath, args = [] } = req.body;
    
    if (!scriptPath) {
      return res.status(400).json({ error: 'Script path required' });
    }
    
    // Security check - only allow LucidLink mount
    const allowedPaths = (process.env.ALLOWED_PATHS || '/media/lucidlink-1').split(',');
    const isAllowed = allowedPaths.some(allowed => scriptPath.startsWith(allowed.trim()));
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Script execution not allowed for this path' });
    }
    
    const jobId = uuidv4();
    const job = {
      id: jobId,
      scriptPath,
      args,
      status: 'running',
      output: [],
      startTime: new Date(),
      endTime: null
    };
    
    jobs.set(jobId, job);
    
    // Determine execution command based on file extension
    let command, commandArgs;
    const ext = path.extname(scriptPath);
    
    if (ext === '.py') {
      command = 'python3';
      commandArgs = [scriptPath, ...args];
    } else if (ext === '.sh') {
      command = 'bash';
      commandArgs = [scriptPath, ...args];
    } else {
      return res.status(400).json({ error: 'Unsupported script type' });
    }
    
    const process = spawn(command, commandArgs, {
      cwd: path.dirname(scriptPath)
    });
    
    // Handle stdout
    process.stdout.on('data', (data) => {
      const output = { type: 'stdout', data: data.toString(), timestamp: new Date() };
      job.output.push(output);
      broadcast({ type: 'job-update', jobId, output });
    });
    
    // Handle stderr
    process.stderr.on('data', (data) => {
      const output = { type: 'stderr', data: data.toString(), timestamp: new Date() };
      job.output.push(output);
      broadcast({ type: 'job-update', jobId, output });
    });
    
    // Handle process completion
    process.on('close', (code) => {
      job.status = code === 0 ? 'completed' : 'failed';
      job.endTime = new Date();
      job.exitCode = code;
      
      broadcast({ type: 'job-complete', jobId, status: job.status, exitCode: code });
    });
    
    // Handle process error
    process.on('error', (error) => {
      job.status = 'failed';
      job.endTime = new Date();
      job.error = error.message;
      
      const output = { type: 'error', data: error.message, timestamp: new Date() };
      job.output.push(output);
      
      broadcast({ type: 'job-error', jobId, error: error.message });
    });
    
    res.json({ jobId, status: 'started' });
  } catch (error) {
    console.error('Error executing script:', error);
    res.status(500).json({ error: 'Failed to execute script' });
  }
});

// Get all jobs (hybrid - database + in-memory)
app.get('/api/jobs', async (req, res) => {
  try {
    // Get cache jobs from database
    const cacheJobs = await CacheJobModel.findAll(20);
    const dbJobList = cacheJobs.map(job => ({
      id: job.id,
      type: 'cache',
      status: job.status,
      totalFiles: job.total_files,
      completedFiles: job.completed_files,
      failedFiles: job.failed_files,
      startTime: job.created_at,
      endTime: job.completed_at,
      output: [] // Cache jobs don't have output like script jobs
    }));
    
    // Get script jobs from memory
    const scriptJobList = Array.from(jobs.values()).map(job => ({
      id: job.id,
      type: 'script',
      scriptPath: job.scriptPath,
      args: job.args,
      status: job.status,
      startTime: job.startTime,
      endTime: job.endTime,
      output: job.output.slice(-10) // Return last 10 output entries
    }));
    
    // Combine and sort by start time
    const allJobs = [...dbJobList, ...scriptJobList]
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    res.json(allJobs);
  } catch (error) {
    console.error('Error getting jobs:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// Get specific job
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Try database first (cache jobs)
    const cacheJob = await CacheJobModel.findById(jobId);
    if (cacheJob) {
      const items = await CacheJobItemModel.findByJob(jobId);
      return res.json({
        ...cacheJob,
        type: 'cache',
        items: items
      });
    }
    
    // Try in-memory (script jobs)
    const scriptJob = jobs.get(jobId);
    if (scriptJob) {
      return res.json({
        ...scriptJob,
        type: 'script'
      });
    }
    
    res.status(404).json({ error: 'Job not found' });
  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

// Cache Job Control Endpoints

// Start cache job processing
app.post('/api/jobs/:id/start', async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Verify job exists and is in correct state
    const job = await CacheJobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'pending') {
      return res.status(400).json({ 
        error: `Job cannot be started. Current status: ${job.status}` 
      });
    }
    
    // The cache worker manager will automatically pick up pending jobs
    // Just respond that the job is ready for processing
    res.json({ 
      jobId: job.id,
      status: 'queued',
      message: 'Job queued for processing by cache workers'
    });
    
  } catch (error) {
    console.error('Error starting cache job:', error);
    res.status(500).json({ error: 'Failed to start cache job' });
  }
});

// Pause cache job (mark as paused, workers will skip)
app.post('/api/jobs/:id/pause', async (req, res) => {
  try {
    const jobId = req.params.id;
    
    const job = await CacheJobModel.findById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'running') {
      return res.status(400).json({ 
        error: `Job cannot be paused. Current status: ${job.status}` 
      });
    }
    
    // Update job status to paused (workers will stop processing)
    await CacheJobModel.updateStatus(jobId, 'paused');
    
    res.json({ 
      jobId: job.id,
      status: 'paused',
      message: 'Job paused successfully'
    });
    
  } catch (error) {
    console.error('Error pausing cache job:', error);
    res.status(500).json({ error: 'Failed to pause cache job' });
  }
});

// Cancel cache job
app.post('/api/jobs/:id/cancel', async (req, res) => {
  try {
    const jobId = req.params.id;
    console.log(`Attempting to cancel job: ${jobId}`);
    
    const job = await CacheJobModel.findById(jobId);
    if (!job) {
      console.log(`Job not found: ${jobId}`);
      return res.status(404).json({ error: 'Job not found' });
    }
    
    console.log(`Found job ${jobId} with status: ${job.status}`);
    
    if (!['pending', 'running', 'paused'].includes(job.status)) {
      console.log(`Job ${jobId} cannot be cancelled, status: ${job.status}`);
      return res.status(400).json({ 
        error: `Job cannot be cancelled. Current status: ${job.status}` 
      });
    }
    
    console.log(`Updating job ${jobId} status to cancelled`);
    // Update job status to cancelled
    await CacheJobModel.updateStatus(jobId, 'cancelled');
    console.log(`Successfully cancelled job ${jobId}`);
    
    res.json({ 
      jobId: job.id,
      status: 'cancelled',
      message: 'Job cancelled successfully'
    });
    
  } catch (error) {
    console.error('Error cancelling cache job:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to cancel cache job',
      details: error.message 
    });
  }
});

// Get cache worker status
app.get('/api/workers/status', async (req, res) => {
  try {
    const manager = getCacheWorkerManager();
    const status = manager.getOverallStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting worker status:', error);
    res.status(500).json({ error: 'Failed to get worker status' });
  }
});

// Clear completed cache jobs
app.post('/api/jobs/clear', async (req, res) => {
  try {
    // Delete completed and failed cache jobs from database
    const result = await pool.query(`
      DELETE FROM cache_jobs 
      WHERE status IN ('completed', 'failed', 'cancelled')
    `);
    
    const deletedCacheJobs = result.rowCount;
    
    // Clear completed script jobs from memory
    let deletedScriptJobs = 0;
    for (const [jobId, job] of jobs.entries()) {
      if (['completed', 'failed'].includes(job.status)) {
        jobs.delete(jobId);
        deletedScriptJobs++;
      }
    }
    
    const totalDeleted = deletedCacheJobs + deletedScriptJobs;
    
    res.json({ 
      message: `Cleared ${totalDeleted} completed jobs (${deletedCacheJobs} cache, ${deletedScriptJobs} script)`,
      deletedCount: totalDeleted,
      cacheJobs: deletedCacheJobs,
      scriptJobs: deletedScriptJobs
    });
    
    console.log(`Cleared ${totalDeleted} completed jobs: ${deletedCacheJobs} cache jobs, ${deletedScriptJobs} script jobs`);
    
  } catch (error) {
    console.error('Error clearing jobs:', error);
    res.status(500).json({ error: 'Failed to clear jobs' });
  }
});

// Validate directory cache status
app.post('/api/validate-directory-cache', async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    
    if (!dirPath) {
      return res.status(400).json({ error: 'Directory path required' });
    }
    
    // Security check - only allow LucidLink mount
    const allowedPaths = (process.env.ALLOWED_PATHS || '/media/lucidlink-1').split(',');
    const isAllowed = allowedPaths.some(allowed => dirPath.startsWith(allowed.trim()));
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }
    
    // Get validation stats
    const validation = await FileModel.validateDirectoryCacheStatus(dirPath);
    
    // Update directory cache status based on validation
    const isValid = await FileModel.updateDirectoryCacheIfValid(dirPath);
    
    res.json({
      path: dirPath,
      validation: validation,
      wasUpdated: isValid,
      message: isValid ? 
        'Directory cache status validated and confirmed' : 
        'Directory cache status corrected - not all children are cached'
    });
    
  } catch (error) {
    console.error('Error validating directory cache:', error);
    res.status(500).json({ error: 'Failed to validate directory cache' });
  }
});

// Media Preview Endpoints (proxy to media-preview service)
app.post('/api/preview', async (req, res) => {
  try {
    const { filePath, type = 'auto' } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Security check - only allow LucidLink mount
    const allowedPaths = (process.env.ALLOWED_PATHS || '/media/lucidlink-1').split(',');
    const isAllowed = allowedPaths.some(allowed => filePath.startsWith(allowed.trim()));
    
    if (!isAllowed) {
      return res.status(403).json({ error: 'Access denied to this path' });
    }
    
    // Check if file exists
    if (!require('fs').existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Determine preview type based on file extension
    const MediaPreviewService = require('./services/media-preview-service');
    const previewType = type === 'auto' ? 
      MediaPreviewService.getPreviewType(filePath) : type;
    
    // Check if file format is supported
    if (!MediaPreviewService.isSupportedFormat(filePath)) {
      return res.status(400).json({ 
        error: 'Unsupported file format',
        supportedTypes: MediaPreviewService.getSupportedTypes()
      });
    }
    
    // Forward request to media preview service
    const previewServiceUrl = process.env.MEDIA_PREVIEW_SERVICE_URL || 'http://media-preview:3003';
    const endpoint = previewType === 'video' ? 'video' : 'image';
    
    const response = await fetch(`${previewServiceUrl}/api/preview/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, options: req.body.options || {} })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error processing preview request:', error);
    res.status(500).json({ error: 'Failed to process preview request' });
  }
});

// Get preview status
app.get('/api/preview/status/:cacheKey', async (req, res) => {
  try {
    const { cacheKey } = req.params;
    const previewServiceUrl = process.env.MEDIA_PREVIEW_SERVICE_URL || 'http://media-preview:3003';
    
    const response = await fetch(`${previewServiceUrl}/api/preview/status/${cacheKey}`);
    const result = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting preview status:', error);
    res.status(500).json({ error: 'Failed to get preview status' });
  }
});

// Proxy preview file serving to media preview service
app.get('/api/preview/:type/:cacheKey/*', async (req, res) => {
  try {
    const { type, cacheKey } = req.params;
    const filename = req.params[0];
    const previewServiceUrl = process.env.MEDIA_PREVIEW_SERVICE_URL || 'http://media-preview:3003';
    
    const response = await fetch(`${previewServiceUrl}/api/preview/${type}/${cacheKey}/${filename}`);
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Preview file not found' });
    }
    
    // Forward headers
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    // Stream the response
    response.body.pipe(res);
    
  } catch (error) {
    console.error('Error serving preview file:', error);
    res.status(500).json({ error: 'Failed to serve preview file' });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
  });
  
  // Send current jobs on connection
  ws.send(JSON.stringify({ type: 'connection-established' }));
});

// Initialize database connection and start server
async function startServer() {
  console.log('Starting File Explorer Backend v2...');
  
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('Database connection failed. Some features may not work properly.');
  }
  
  // Start cache worker manager
  if (dbConnected) {
    const cacheManager = getCacheWorkerManager({
      workerCount: process.env.CACHE_WORKER_COUNT || 1,
      workerOptions: {
        maxConcurrentFiles: process.env.MAX_CONCURRENT_FILES || 3,
        pollInterval: process.env.WORKER_POLL_INTERVAL || 5000
      }
    });
    
    console.log('About to set up WebSocket event listeners...');
    
    // Test WebSocket broadcast immediately
    setTimeout(() => {
      console.log('Testing WebSocket broadcast...');
      broadcast({ type: 'test-message', message: 'WebSocket test from server startup' });
    }, 5000);
    
    // Set up cache worker event forwarding to WebSocket clients
    console.log('Setting up cache manager event listeners for WebSocket broadcasting');
    
    cacheManager.on('job-started', (data) => {
      console.log('Cache manager job-started event received:', data);
      broadcast({ type: 'cache-job-started', ...data });
    });
    
    cacheManager.on('job-completed', (data) => {
      console.log('Cache manager job-completed event received:', data);
      broadcast({ type: 'cache-job-completed', ...data });
    });
    
    cacheManager.on('job-failed', (data) => {
      console.log('Cache manager job-failed event received:', data);
      broadcast({ type: 'cache-job-failed', ...data });
    });
    
    cacheManager.on('file-started', (data) => {
      console.log('Cache manager file-started event received:', data);
      broadcast({ type: 'cache-file-started', ...data });
    });
    
    cacheManager.on('file-completed', (data) => {
      console.log('Cache manager file-completed event received:', data);
      broadcast({ type: 'cache-file-completed', ...data });
    });
    
    cacheManager.on('file-failed', (data) => {
      console.log('Cache manager file-failed event received:', data);
      broadcast({ type: 'cache-file-failed', ...data });
    });
    
    cacheManager.on('job-progress', (data) => {
      console.log('Cache manager job-progress event received:', data);
      broadcast({ type: 'cache-job-progress', ...data });
    });
    
    await cacheManager.start();
    console.log('Cache worker manager started');
  }
  
  // Start LucidLink stats worker for download speed monitoring
  if (process.env.ENABLE_LUCIDLINK_STATS !== 'false') {
    try {
      console.log('Initializing LucidLinkStatsWorker');
      const lucidStatsWorker = new LucidLinkStatsWorker({
        lucidCommand: process.env.LUCIDLINK_COMMAND || '/usr/local/bin/lucid',
        pollInterval: parseInt(process.env.LUCIDLINK_STATS_INTERVAL) || 1000
      });
      
      lucidStatsWorker.on('stats', (stats) => {
        broadcast({ type: 'lucidlink-stats', ...stats });
      });
      
      lucidStatsWorker.on('error', (error) => {
        console.error('LucidLinkStatsWorker error:', error);
      });
      
      await lucidStatsWorker.start();
      console.log('LucidLink stats worker started successfully');
    } catch (error) {
      console.error('Failed to start LucidLinkStatsWorker:', error);
    }
  } else if (process.env.ENABLE_NETWORK_STATS !== 'false') {
    // Fallback to old network stats if LucidLink stats are disabled
    try {
      console.log('Initializing NetworkStatsWorker with interface:', process.env.NETWORK_INTERFACE || 'en0');
      const networkStatsWorker = new NetworkStatsWorker({
        interface: process.env.NETWORK_INTERFACE || 'en0',
        pollInterval: parseInt(process.env.NETWORK_STATS_INTERVAL) || 2000
      });
      
      networkStatsWorker.on('stats', (stats) => {
        broadcast({ type: 'network-stats', ...stats });
      });
      
      networkStatsWorker.on('error', (error) => {
        console.error('NetworkStatsWorker error:', error);
      });
      
      await networkStatsWorker.start();
      console.log('Network stats worker started successfully');
    } catch (error) {
      console.error('Failed to start NetworkStatsWorker:', error);
    }
  } else {
    console.log('Both LucidLink stats and network stats disabled');
  }

  // Initialize VarnishStatsWorker for cache statistics
  if (process.env.ENABLE_VARNISH_STATS !== 'false') {
    try {
      console.log('Initializing VarnishStatsWorker');
      const varnishStatsWorker = new VarnishStatsWorker({
        statsFilePath: '/data/varnish-stats.json',
        updateInterval: parseInt(process.env.VARNISH_STATS_INTERVAL) || 60000
      });
      
      // Store reference for API access
      varnishStatsWorkerInstance = varnishStatsWorker;
      
      varnishStatsWorker.on('stats', (stats) => {
        broadcast({ type: 'varnish-stats', ...stats });
      });
      
      varnishStatsWorker.on('error', (error) => {
        console.error('VarnishStatsWorker error:', error);
      });
      
      await varnishStatsWorker.start();
      console.log('Varnish stats worker started successfully');
    } catch (error) {
      console.error('Failed to start VarnishStatsWorker:', error);
    }
  } else {
    console.log('Varnish stats disabled');
  }
  
  // Start HTTP server
  const server = app.listen(PORT, () => {
    logger.info('File Explorer Backend v2 started', {
      port: PORT,
      websocketPort: WEBSOCKET_PORT,
      database: dbConnected ? 'Connected' : 'Disconnected',
      indexPath: process.env.INDEX_ROOT_PATH || '/media/lucidlink-1',
      nodeEnv: process.env.NODE_ENV || 'development'
    });
  });

  // Store server instance for graceful shutdown
  app.locals.server = server;
  app.locals.wss = wss;
  app.locals.cacheManager = getCacheWorkerManager();
  app.locals.indexer = getIndexer();
}

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  logger.info('Graceful shutdown initiated', { signal });
  
  const shutdownTimeout = parseInt(process.env.SHUTDOWN_TIMEOUT) || 30000; // 30 seconds default
  
  // Set a timeout for forced shutdown
  const forceShutdown = setTimeout(() => {
    logger.error('Forced shutdown due to timeout', { timeout: shutdownTimeout });
    process.exit(1);
  }, shutdownTimeout);

  try {
    // 1. Stop accepting new connections
    if (app.locals.server) {
      console.log('Closing HTTP server...');
      await new Promise((resolve) => {
        app.locals.server.close(resolve);
      });
    }

    // 2. Close WebSocket connections
    if (app.locals.wss) {
      console.log('Closing WebSocket connections...');
      app.locals.wss.clients.forEach(client => {
        client.close(1000, 'Server shutting down');
      });
      await new Promise((resolve) => {
        app.locals.wss.close(resolve);
      });
    }

    // 3. Stop cache workers
    if (app.locals.cacheManager) {
      console.log('Stopping cache workers...');
      await app.locals.cacheManager.stop();
    }

    // 4. Stop indexer if running
    if (app.locals.indexer && app.locals.indexer.isRunning) {
      console.log('Stopping indexer...');
      await app.locals.indexer.stop();
    }

    // 5. Close database connections
    console.log('Closing database connections...');
    await pool.end();

    clearTimeout(forceShutdown);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message, stack: error.stack });
    clearTimeout(forceShutdown);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();

module.exports = app;