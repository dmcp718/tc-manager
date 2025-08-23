// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const pty = require('node-pty');

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
  CacheJobProfileModel,
  VideoPreviewJobModel,
  VideoPreviewJobItemModel,
  VideoPreviewProfileModel
} = require('./database');

// Import indexer
const { getIndexer } = require('./indexer');

// Import cache worker manager
const { getCacheWorkerManager } = require('./workers/cache-worker-manager');

// Import video preview manager
const VideoPreviewManager = require('./workers/video-preview-manager');

// Import network stats workers
const NetworkStatsWorker = require('./network-stats-worker');
const LucidLinkStatsWorker = require('./lucidlink-stats-worker');
const VarnishStatsWorker = require('./varnish-stats-worker');

// Import media preview service
const { MediaPreviewService } = require('./services/media-preview-service');

// Import Elasticsearch client
const ElasticsearchClient = require('./elasticsearch-client');

// Import RUI service
const RUIService = require('./rui-service');

// Import authentication service
const authService = require('./auth');

const app = express();
const PORT = process.env.PORT || 3001;
const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for large file arrays

// Request logging middleware - only log important endpoints
app.use((req, res, next) => {
  const start = Date.now();
  const originalSend = res.send;
  
  res.send = function(data) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    
    // Only log specific important endpoints, not routine API calls
    const importantEndpoints = [
      '/api/auth/login',
      '/api/jobs/cache',
      '/api/index/start',
      '/api/index/stop',
      '/api/admin/users'
    ];
    
    const shouldLog = importantEndpoints.some(endpoint => req.url.includes(endpoint)) ||
                     statusCode >= 400; // Always log errors
    
    if (shouldLog) {
      logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
});

// In-memory job storage (for backward compatibility)
const jobs = new Map();

// Global stats workers for API access
let varnishStatsWorkerInstance = null;

// Global media preview service instance
let mediaPreviewService = null;

// Global Elasticsearch client instance
let elasticsearchClient = null;

// Global RUI service instance
let ruiService = null;

// WebSocket server - bind to all interfaces for external access
const wss = new WebSocket.Server({ 
  port: WEBSOCKET_PORT,
  host: '0.0.0.0'  // Allow connections from outside container
});

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
      searchElasticsearch: '/api/search/elasticsearch?q={query}',
      elasticsearchAvailability: '/api/search/elasticsearch/availability',
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

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Get client IP address
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                     (req.connection.socket ? req.connection.socket.remoteAddress : 'unknown');
    
    const userInfo = await authService.validateCredentials(username, password, clientIP);
    
    if (!userInfo) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = authService.generateToken(userInfo.username, userInfo.role);
    
    res.json({
      success: true,
      token,
      user: { username: userInfo.username, role: userInfo.role }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  // For JWT tokens, logout is handled client-side by removing the token
  // In a more sophisticated setup, we could maintain a blacklist of revoked tokens
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/verify', authService.requireAuth, (req, res) => {
  // If we reach this point, the token is valid (middleware passed)
  res.json({
    success: true,
    user: req.user
  });
});

// Get root directories - check database first, fallback to filesystem
app.get('/api/roots', authService.requireAuth, async (req, res) => {
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
app.get('/api/files', authService.requireAuth, async (req, res) => {
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

// Filesystem verification for search results
async function verifySearchResults(results, options = {}) {
  const { batchSize = 50, logStaleEntries = true } = options;
  const verifiedResults = [];
  const staleEntries = [];
  
  // Process results in batches to avoid overwhelming the filesystem
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);
    
    // Check filesystem existence for each file in batch
    const verificationPromises = batch.map(async (result) => {
      try {
        await fs.access(result.path);
        return { result, exists: true };
      } catch (error) {
        return { result, exists: false };
      }
    });
    
    const verificationResults = await Promise.all(verificationPromises);
    
    // Separate verified from stale entries
    for (const { result, exists } of verificationResults) {
      if (exists) {
        verifiedResults.push(result);
      } else {
        staleEntries.push(result.path);
        if (logStaleEntries) {
          console.log(`Stale entry detected in search results: ${result.path}`);
        }
      }
    }
  }
  
  // Queue stale entries for async cleanup if any found
  if (staleEntries.length > 0) {
    setImmediate(() => {
      queueStaleEntriesForCleanup(staleEntries);
    });
  }
  
  return {
    verified: verifiedResults,
    staleCount: staleEntries.length,
    originalCount: results.length
  };
}

// Queue stale entries for cleanup (async, non-blocking)
async function queueStaleEntriesForCleanup(stalePaths) {
  if (stalePaths.length === 0) return;
  
  try {
    console.log(`Queuing ${stalePaths.length} stale entries for cleanup`);
    
    // Remove from PostgreSQL
    const { pool } = require('./database');
    const result = await pool.query(
      'DELETE FROM files WHERE path = ANY($1) RETURNING path',
      [stalePaths]
    );
    
    console.log(`Removed ${result.rows.length} stale entries from PostgreSQL`);
    
    // Remove from Elasticsearch if enabled
    const syncElasticsearch = process.env.ELASTICSEARCH_SYNC_DELETIONS !== 'false';
    if (elasticsearchClient && syncElasticsearch) {
      try {
        const esResult = await elasticsearchClient.bulkDeleteByPaths(stalePaths);
        console.log(`Removed ${esResult.deleted} stale entries from Elasticsearch`);
      } catch (error) {
        console.warn('Failed to clean stale entries from Elasticsearch:', error.message);
      }
    }
  } catch (error) {
    console.error('Error during stale entry cleanup:', error.message);
  }
}

// Search files
app.get('/api/search', authService.requireAuth, async (req, res) => {
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
    
    // Verify filesystem existence for all results
    const verification = await verifySearchResults(formattedResults);
    
    // Add verification metadata to response
    const response = {
      results: verification.verified,
      total: verification.verified.length,
      verification: {
        originalCount: verification.originalCount,
        staleCount: verification.staleCount,
        verifiedCount: verification.verified.length
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error searching files:', error);
    res.status(500).json({ error: 'Failed to search files' });
  }
});

// Elasticsearch search endpoint
app.get('/api/search/elasticsearch', authService.requireAuth, async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    // Check if Elasticsearch is available
    if (!elasticsearchClient) {
      return res.status(503).json({ error: 'Elasticsearch not available' });
    }
    
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const results = await elasticsearchClient.searchFiles(query, { size: limit, from: offset });
    const formattedResults = results.hits.map(hit => ({
      name: hit.name,
      path: hit.path,
      isDirectory: hit.is_directory,
      size: hit.size,
      modified: hit.modified_at,
      created: hit.modified_at,
      extension: hit.extension,
      cached: hit.cached,
      score: hit._score
    }));
    
    // Verify filesystem existence for all results
    const verification = await verifySearchResults(formattedResults);
    
    res.json({
      results: verification.verified,
      total: verification.verified.length,
      originalTotal: results.total,
      took: results.took,
      verification: {
        originalCount: verification.originalCount,
        staleCount: verification.staleCount,
        verifiedCount: verification.verified.length
      }
    });
  } catch (error) {
    console.error('Error searching files with Elasticsearch:', error);
    res.status(500).json({ error: 'Failed to search files with Elasticsearch' });
  }
});

// Check Elasticsearch availability
app.get('/api/search/elasticsearch/availability', async (req, res) => {
  try {
    if (!elasticsearchClient) {
      return res.json({ available: false, reason: 'Elasticsearch client not initialized' });
    }
    
    const isConnected = await elasticsearchClient.testConnection();
    res.json({ available: isConnected });
  } catch (error) {
    console.error('Error checking Elasticsearch availability:', error);
    res.json({ available: false, reason: 'Connection test failed' });
  }
});

// Get cache statistics
app.get('/api/stats', authService.requireAuth, async (req, res) => {
  try {
    const stats = await FileModel.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Cache statistics endpoint for immediate access
app.get('/api/cache-stats', authService.requireAuth, async (req, res) => {
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

// Admin system information endpoint
app.get('/api/admin/system-info', authService.requireAuth, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Try to load host info from file first
    const hostInfoPath = path.join(__dirname, 'host-info.json');
    let hostInfo = null;
    
    try {
      if (fsSync.existsSync(hostInfoPath)) {
        const hostInfoData = fs.readFileSync(hostInfoPath, 'utf8');
        hostInfo = JSON.parse(hostInfoData);
        console.log('Loaded host info from file');
      }
    } catch (error) {
      console.warn('Could not load host-info.json:', error.message);
    }
    
    // Start with host info if available, otherwise gather container info
    const systemInfo = {};
    
    try {
      // Get hostname - prefer SERVER_HOST env var, then host info, then fallbacks
      if (process.env.SERVER_HOST) {
        systemInfo.hostname = process.env.SERVER_HOST;
      } else if (hostInfo?.hostname) {
        systemInfo.hostname = hostInfo.hostname;
      } else {
        systemInfo.hostname = process.env.HOSTNAME || 'Unknown';
      }
    } catch (error) {
      systemInfo.hostname = 'Unknown';
    }
    
    try {
      // Linux release info
      const { stdout: release } = await execAsync('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'');
      systemInfo.release = release.trim() || 'Unknown';
    } catch (error) {
      systemInfo.release = 'Unknown';
    }
    
    try {
      // CPU info
      const { stdout: cpuCount } = await execAsync('nproc');
      const { stdout: cpuModel } = await execAsync('cat /proc/cpuinfo | grep "model name" | head -1 | cut -d: -f2');
      systemInfo.cpu = {
        cores: parseInt(cpuCount.trim()),
        model: cpuModel.trim() || 'Unknown'
      };
    } catch (error) {
      systemInfo.cpu = { cores: 0, model: 'Unknown' };
    }
    
    try {
      // Network info - use hostname -I for IP and parse /proc/net/route for interface
      const { stdout: ipList } = await execAsync('hostname -I 2>/dev/null || echo ""');
      const ips = ipList.trim().split(' ').filter(ip => ip && !ip.startsWith('127.'));
      const primaryIP = ips[0] || 'Unknown';
      
      // Try to get the default interface from /proc/net/route
      let interfaceName = 'Unknown';
      try {
        const { stdout: routeData } = await execAsync('cat /proc/net/route | grep "00000000" | head -1 | awk \'{print $1}\'');
        if (routeData.trim()) {
          interfaceName = routeData.trim();
        }
      } catch {
        // If that fails, try to get from /sys/class/net
        try {
          const { stdout: netDevices } = await execAsync('ls /sys/class/net | grep -v lo | head -1');
          if (netDevices.trim()) {
            interfaceName = netDevices.trim();
          }
        } catch {
          interfaceName = 'eth0'; // Common default
        }
      }
      
      systemInfo.network = {
        interface: interfaceName,
        ip: primaryIP
      };
    } catch (error) {
      systemInfo.network = { interface: 'Unknown', ip: 'Unknown' };
    }
    
    try {
      // Use host memory info if available, otherwise get current memory stats
      if (hostInfo?.memory) {
        // Get current memory usage from /proc/meminfo for real-time data
        try {
          const { stdout: meminfo } = await execAsync('cat /proc/meminfo');
          const memTotal = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
          const memAvailable = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
          
          if (memTotal && memAvailable) {
            const totalKB = parseInt(memTotal[1]);
            const availableKB = parseInt(memAvailable[1]);
            const usedKB = totalKB - availableKB;
            
            const totalGB = (totalKB / 1024 / 1024).toFixed(1);
            const availableGB = (availableKB / 1024 / 1024).toFixed(1);
            const usedGB = (usedKB / 1024 / 1024).toFixed(1);
            systemInfo.memory = `${totalGB}G total, ${usedGB}G used, ${availableGB}G available`;
          } else {
            // Fallback to host info static data
            systemInfo.memory = `${hostInfo.memory.total_gb}G total (from host info)`;
          }
        } catch {
          systemInfo.memory = `${hostInfo.memory.total_gb}G total (from host info)`;
        }
      } else {
        // Container memory detection fallback
        const { stdout: meminfo } = await execAsync('cat /proc/meminfo');
        const memTotal = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
        const memAvailable = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
        
        if (memTotal && memAvailable) {
          const totalKB = parseInt(memTotal[1]);
          const availableKB = parseInt(memAvailable[1]);
          const usedKB = totalKB - availableKB;
          
          const totalGB = (totalKB / 1024 / 1024).toFixed(1);
          const availableGB = (availableKB / 1024 / 1024).toFixed(1);
          const usedGB = (usedKB / 1024 / 1024).toFixed(1);
          systemInfo.memory = `${totalGB}G total, ${usedGB}G used, ${availableGB}G available`;
        } else {
          systemInfo.memory = 'Unable to read memory info';
        }
      }
    } catch (error) {
      systemInfo.memory = 'Unknown';
    }
    
    try {
      // Use host storage info if available
      if (hostInfo?.storage) {
        systemInfo.storage = hostInfo.storage;
      } else {
        // Fallback to container storage detection
        // Get mounted filesystems info from df first
      const { stdout: dfOutput } = await execAsync('df -h -t ext4 -t xfs -t btrfs -t ntfs 2>/dev/null || df -h');
      const dfLines = dfOutput.trim().split('\n').slice(1); // Skip header
      const mountMap = {};
      
      dfLines.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length >= 6) {
          const device = parts[0];
          const size = parts[1];
          const used = parts[2];
          const avail = parts[3];
          const usage = parts[4];
          const mount = parts.slice(5).join(' '); // Handle spaces in mount paths
          
          if (device.startsWith('/dev/')) {
            const deviceName = device.replace('/dev/', '');
            mountMap[deviceName] = {
              size,
              used,
              avail,
              usage,
              mountpoint: mount
            };
          }
        }
      });
      
      // Get block devices using lsblk
      const { stdout: lsblkOutput } = await execAsync('lsblk -o NAME,SIZE,TYPE,FSTYPE -n 2>/dev/null || echo ""');
      const devices = [];
      
      if (lsblkOutput) {
        const lines = lsblkOutput.trim().split('\n');
        lines.forEach(line => {
          const parts = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s*(.*)?$/);
          if (parts) {
            const name = parts[1];
            const size = parts[2];
            const type = parts[3];
            const fstype = parts[4] || '-';
            
            // Skip loop devices
            if (name.includes('loop') || type === 'loop') {
              return;
            }
            
            // Check if we have mount info from df
            const dfInfo = mountMap[name];
            
            // Known host mount mappings for SiteCache server
            const hostMountMap = {
              'sdb1': '/media/disk1',
              'sdc1': '/media/disk2', 
              'sdd1': '/media/disk3',
              'sde1': '/media/disk4',
              'nvme0n1p1': '/',
              'nvme0n1p2': '/boot/efi'
            };
            
            const cleanName = name.replace(/[`|-]+-/, '');
            const mountpoint = hostMountMap[cleanName] || dfInfo?.mountpoint || '-';
            
            devices.push({
              name: name.includes('└─') ? name : name,
              size: dfInfo?.size || size,
              type: type,
              fstype: fstype || 'ext4',
              mountpoint: mountpoint,
              usage: dfInfo?.usage || '-'
            });
          }
        });
      }
      
      // If we couldn't get lsblk info, just use df output
      if (devices.length === 0 && Object.keys(mountMap).length > 0) {
        Object.entries(mountMap).forEach(([device, info]) => {
          devices.push({
            name: device,
            size: info.size,
            type: 'partition',
            fstype: 'ext4',
            mountpoint: info.mountpoint,
            usage: info.usage
          });
        });
      }
      
      systemInfo.storage = devices.length > 0 ? devices : [{ name: 'No devices found' }];
      }
    } catch (error) {
      console.error('Error getting storage info:', error);
      systemInfo.storage = [{ name: 'Error loading storage info' }];
    }
    
    res.json(systemInfo);
  } catch (error) {
    console.error('Error getting system info:', error);
    res.status(500).json({ error: 'Failed to get system information' });
  }
});

// Log viewing endpoints
app.get('/api/admin/logs', authService.requireAuth, async (req, res) => {
  try {
    const { level = 'all', limit = 100, offset = 0, search = '', startDate, endDate } = req.query;
    
    const logDir = process.env.LOG_DIR || './logs';
    const logFile = level === 'all' ? 'sitecache-all.log' : `sitecache-${level}.log`;
    const logPath = path.join(logDir, logFile);
    
    if (!fsSync.existsSync(logPath)) {
      return res.json({ logs: [], total: 0, hasMore: false });
    }
    
    // Read log file
    const logContent = fsSync.readFileSync(logPath, 'utf8');
    const allLines = logContent.split('\n').filter(line => line.trim());
    
    // Parse and filter logs
    let logs = [];
    for (const line of allLines) {
      try {
        // Try to parse as JSON first
        if (line.startsWith('{')) {
          const logEntry = JSON.parse(line);
          logs.push({
            timestamp: logEntry.timestamp,
            level: logEntry.level,
            message: logEntry.message,
            event: logEntry.event || 'general',
            details: JSON.stringify(logEntry, null, 2),
            raw: line
          });
        } else {
          // Parse text format: timestamp [LEVEL] [PID:xxx] message
          const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) \[(\w+)\] \[PID:\d+\] (.+)$/);
          if (match) {
            const [, timestamp, level, message] = match;
            logs.push({
              timestamp,
              level,
              message,
              event: 'general',
              details: message,
              raw: line
            });
          }
        }
      } catch (e) {
        // Skip malformed log entries
        continue;
      }
    }
    
    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        log.details.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by log level or event category
    if (level !== 'all') {
      if (level === 'cache_jobs') {
        // Filter for cache job related events
        logs = logs.filter(log => 
          log.event && (
            log.event.includes('cache_job') ||
            log.event.includes('cache-job')
          )
        );
      } else if (level === 'index_jobs') {
        // Filter for index job related events
        logs = logs.filter(log => 
          log.event && (
            log.event.includes('index_job') ||
            log.event.includes('index-job')
          )
        );
      } else {
        // Filter by standard log levels (info, warn, error)
        logs = logs.filter(log => log.level.toLowerCase() === level.toLowerCase());
      }
    }
    
    if (startDate) {
      logs = logs.filter(log => new Date(log.timestamp) >= new Date(startDate));
    }
    
    if (endDate) {
      logs = logs.filter(log => new Date(log.timestamp) <= new Date(endDate));
    }
    
    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply pagination
    const total = logs.length;
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedLogs = logs.slice(startIndex, endIndex);
    
    res.json({
      logs: paginatedLogs,
      total,
      hasMore: endIndex < total,
      level,
      filters: { search, startDate, endDate, limit, offset }
    });
    
  } catch (error) {
    logger.error('Error reading logs', { error: error.message });
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

app.get('/api/admin/logs/files', authService.requireAuth, async (req, res) => {
  try {
    const logDir = process.env.LOG_DIR || './logs';
    
    if (!fsSync.existsSync(logDir)) {
      return res.json({ files: [] });
    }
    
    const files = fsSync.readdirSync(logDir)
      .filter(file => file.startsWith('sitecache-') && file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(logDir, file);
        const stats = fsSync.statSync(filePath);
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime,
          level: file.replace('sitecache-', '').replace('.log', '')
        };
      })
      .sort((a, b) => b.modified - a.modified);
    
    res.json({ files });
  } catch (error) {
    logger.error('Error listing log files', { error: error.message });
    res.status(500).json({ error: 'Failed to list log files' });
  }
});

app.get('/api/admin/logs/export', authService.requireAuth, async (req, res) => {
  try {
    const { level = 'all', startDate, endDate } = req.query;
    
    const logDir = process.env.LOG_DIR || './logs';
    const logFile = level === 'all' ? 'sitecache-all.log' : `sitecache-${level}.log`;
    const logPath = path.join(logDir, logFile);
    
    if (!fsSync.existsSync(logPath)) {
      return res.status(404).json({ error: 'Log file not found' });
    }
    
    const fileName = `sitecache-logs-${level}-${new Date().toISOString().split('T')[0]}.log`;
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    
    // Stream the file to response
    const readStream = fsSync.createReadStream(logPath);
    readStream.pipe(res);
    
  } catch (error) {
    logger.error('Error exporting logs', { error: error.message });
    res.status(500).json({ error: 'Failed to export logs' });
  }
});

// Admin system status endpoint
app.get('/api/admin/system-status', authService.requireAuth, async (req, res) => {
  try {
    // Check SiteCache status by testing Varnish cache service connectivity
    // This is more reliable than trying to access Docker from within container
    let varnishStatus = 'unknown';
    let dbStatus = 'unknown';
    let esStatus = 'unknown';
    let active = false;
    let startTime = new Date().toISOString();
    
    try {
      // Test Varnish cache connectivity (main SiteCache service)
      const varnishResponse = await fetch('http://192.168.8.28:80/', {
        method: 'HEAD',
        timeout: 5000
      });
      
      // Varnish is healthy if we get any response (including 503 Backend fetch failed)
      // A 503 means Varnish is running but backend (LucidLink) is unavailable
      if (varnishResponse.status === 503) {
        const server = varnishResponse.headers.get('server');
        if (server && server.toLowerCase().includes('varnish')) {
          varnishStatus = 'connected (backend unavailable)';
        } else {
          varnishStatus = 'connected';
        }
      } else if (varnishResponse.ok) {
        varnishStatus = 'connected';
      } else {
        varnishStatus = 'error';
      }
    } catch (varnishError) {
      varnishStatus = 'unreachable';
      console.error('Varnish connection error:', varnishError.message);
    }
    
    try {
      // Test database connection
      const dbResult = await db.query('SELECT 1');
      dbStatus = 'connected';
    } catch (dbError) {
      dbStatus = 'disconnected';
      console.error('Database connection error:', dbError);
    }
    
    try {
      // Test Elasticsearch connection
      const esResponse = await fetch(`http://${process.env.ELASTICSEARCH_HOST}:${process.env.ELASTICSEARCH_PORT}/_cluster/health`, {
        timeout: 5000
      });
      if (esResponse.ok) {
        esStatus = 'connected';
      } else {
        esStatus = 'disconnected';
      }
    } catch (esError) {
      esStatus = 'disconnected';
      console.error('Elasticsearch connection error:', esError);
    }
    
    // SiteCache is active if Varnish cache is running (main service indicator)
    active = varnishStatus.startsWith('connected');
    const status = active ? 'active (running)' : 'degraded - Varnish cache unavailable';
    
    // Try to get service start time from environment or use current time
    if (process.env.SERVICE_START_TIME) {
      startTime = process.env.SERVICE_START_TIME;
    }
    
    res.json({
      lucidSiteCache: {
        status: status,
        since: startTime,
        active: active,
        services: {
          varnish: varnishStatus,
          database: dbStatus,
          elasticsearch: esStatus
        }
      }
    });
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({ error: 'Failed to get system status' });
  }
});

// User Management endpoints
app.get('/api/admin/users', authService.requireAuth, async (req, res) => {
  try {
    // Only admin users can manage users
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const users = await authService.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

app.post('/api/admin/users', authService.requireAuth, async (req, res) => {
  try {
    // Only admin users can create users
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { username, password, email, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin or user' });
    }
    
    const newUser = await authService.createUser(username, password, email, role || 'user');
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    if (error.message === 'Username already exists') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.delete('/api/admin/users/:id', authService.requireAuth, async (req, res) => {
  try {
    // Only admin users can delete users
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Prevent admin from deleting themselves
    const currentUser = await authService.getUserById(userId);
    if (currentUser && currentUser.username === req.user.username) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const deletedUser = await authService.deleteUser(userId);
    res.json({ message: 'User deleted successfully', user: deletedUser });
  } catch (error) {
    console.error('Error deleting user:', error);
    if (error.message === 'User not found or already deleted') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.put('/api/admin/users/:id/password', authService.requireAuth, async (req, res) => {
  try {
    // Only admin users can change passwords
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const userId = parseInt(req.params.id);
    const { password } = req.body;
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const updatedUser = await authService.updateUserPassword(userId, password);
    res.json({ message: 'Password updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating user password:', error);
    if (error.message === 'User not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Indexing endpoints
app.post('/api/index/start', authService.requireAuth, async (req, res) => {
  try {
    const { path: indexPath } = req.body;
    const rootPath = indexPath || process.env.INDEX_ROOT_PATH || '/media/lucidlink-1';
    
    // Get client IP and user info
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const username = req.user?.username || 'unknown';
    
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
    
    // Log index job creation
    logger.info('Index files job created', {
      event: 'index_job_created',
      username,
      clientIP,
      rootPath,
      timestamp: new Date().toISOString()
    });
    
    // Start indexing in background
    indexer.start(rootPath).catch(err => {
      logger.error('Index files job failed to start', {
        event: 'index_job_failed',
        username,
        rootPath,
        error: err.message,
        timestamp: new Date().toISOString()
      });
    });
    
    // Set up progress listeners
    indexer.on('progress', (data) => {
      // Only log periodic progress updates (every 100 files or so)
      if (data.processedFiles && data.processedFiles % 100 === 0) {
        logger.info('Index files job progress', {
          event: 'index_job_progress',
          processedFiles: data.processedFiles,
          totalFiles: data.totalFiles,
          currentPath: data.currentPath,
          timestamp: new Date().toISOString()
        });
      }
      broadcast({ type: 'index-progress', ...data });
    });
    
    indexer.on('complete', (data) => {
      logger.info('Index files job completed', {
        event: 'index_job_completed',
        totalFiles: data.totalFiles,
        processedFiles: data.processedFiles,
        duration: data.duration,
        timestamp: new Date().toISOString()
      });
      broadcast({ type: 'index-complete', ...data });
    });
    
    indexer.on('error', (data) => {
      logger.error('Index files job error', {
        event: 'index_job_error',
        error: data.error,
        currentPath: data.currentPath,
        timestamp: new Date().toISOString()
      });
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

app.get('/api/index/status', authService.requireAuth, async (req, res) => {
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

app.post('/api/index/stop', authService.requireAuth, async (req, res) => {
  try {
    // Get client IP and user info
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const username = req.user?.username || 'unknown';
    
    const indexer = getIndexer();
    await indexer.stop();
    
    // Log index job stop
    logger.info('Index files job stopped', {
      event: 'index_job_stopped',
      username,
      clientIP,
      timestamp: new Date().toISOString()
    });
    
    res.json({ status: 'stopping' });
  } catch (error) {
    logger.error('Error stopping indexing', {
      event: 'index_job_stop_error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Failed to stop indexing' });
  }
});

app.get('/api/index/history', authService.requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await IndexProgressModel.findAll(limit);
    res.json(history);
  } catch (error) {
    console.error('Error getting index history:', error);
    res.status(500).json({ error: 'Failed to get index history' });
  }
});

app.post('/api/index/cleanup-elasticsearch', authService.requireAuth, async (req, res) => {
  try {
    const ElasticsearchClient = require('./elasticsearch-client');
    const esClient = new ElasticsearchClient();
    
    // Test ES connection first
    const isConnected = await esClient.testConnection();
    if (!isConnected) {
      return res.status(503).json({ error: 'Elasticsearch not available' });
    }

    // Get all paths from PostgreSQL files table
    const { pool } = require('./database');
    const pgResult = await pool.query('SELECT path FROM files');
    const pgPaths = new Set(pgResult.rows.map(row => row.path));
    
    console.log(`Found ${pgPaths.size} files in PostgreSQL database`);

    // Get all document IDs from Elasticsearch
    const esSearchResult = await esClient.client.search({
      index: esClient.indexName,
      scroll: '1m',
      body: {
        query: { match_all: {} },
        _source: false,
        size: 10000 // Start with reasonable batch size
      }
    });

    let allEsPaths = [];
    let scrollId = esSearchResult._scroll_id;
    
    // Collect all ES document IDs using scroll API
    let esHits = esSearchResult.hits.hits;
    while (esHits.length > 0) {
      allEsPaths.push(...esHits.map(hit => hit._id));
      
      if (esHits.length < 10000) break; // No more results
      
      const scrollResult = await esClient.client.scroll({
        scroll_id: scrollId,
        scroll: '1m'
      });
      
      esHits = scrollResult.hits.hits;
      scrollId = scrollResult._scroll_id;
    }

    // Clear scroll context
    if (scrollId) {
      try {
        await esClient.client.clearScroll({ scroll_id: scrollId });
      } catch (error) {
        console.warn('Failed to clear scroll context:', error.message);
      }
    }

    console.log(`Found ${allEsPaths.length} documents in Elasticsearch index`);

    // Find orphaned paths (in ES but not in PostgreSQL)
    const orphanedPaths = allEsPaths.filter(path => !pgPaths.has(path));
    
    console.log(`Found ${orphanedPaths.length} orphaned documents in Elasticsearch`);

    if (orphanedPaths.length === 0) {
      return res.json({
        message: 'No orphaned documents found',
        orphaned: 0,
        deleted: 0
      });
    }

    // Safety check - don't delete more than 50% of ES documents
    const deletionPercentage = (orphanedPaths.length / allEsPaths.length) * 100;
    const maxDeletionPercentage = 50;
    
    if (deletionPercentage > maxDeletionPercentage) {
      return res.status(400).json({
        error: `Safety check failed: Would delete ${deletionPercentage.toFixed(1)}% of documents (max ${maxDeletionPercentage}%)`,
        orphaned: orphanedPaths.length,
        total: allEsPaths.length,
        deletionPercentage: deletionPercentage
      });
    }

    // Bulk delete orphaned documents in batches
    const batchSize = 1000;
    let totalDeleted = 0;
    let totalErrors = 0;

    for (let i = 0; i < orphanedPaths.length; i += batchSize) {
      const batch = orphanedPaths.slice(i, i + batchSize);
      const result = await esClient.bulkDeleteByPaths(batch);
      totalDeleted += result.deleted;
      totalErrors += result.errors.length;
    }

    res.json({
      message: `Cleanup completed: ${totalDeleted} orphaned documents deleted`,
      orphaned: orphanedPaths.length,
      deleted: totalDeleted,
      errors: totalErrors,
      deletionPercentage: deletionPercentage.toFixed(1)
    });

  } catch (error) {
    console.error('Error cleaning up Elasticsearch:', error);
    res.status(500).json({ error: `Cleanup failed: ${error.message}` });
  }
});

// RUI (Remote Upload Indicator) Endpoints

// Get RUI service status
app.get('/api/rui/status', authService.requireAuth, async (req, res) => {
  try {
    if (!ruiService) {
      return res.json({ enabled: false, message: 'RUI service not initialized' });
    }
    
    const status = ruiService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting RUI status:', error);
    res.status(500).json({ error: `Failed to get RUI status: ${error.message}` });
  }
});

// Get currently uploading files
app.get('/api/rui/uploading', authService.requireAuth, async (req, res) => {
  try {
    if (!ruiService) {
      return res.json([]);
    }
    
    const uploadingFiles = await ruiService.getUploadingFiles();
    res.json(uploadingFiles);
  } catch (error) {
    console.error('Error getting uploading files:', error);
    res.status(500).json({ error: `Failed to get uploading files: ${error.message}` });
  }
});

// Force check RUI status for specific file
app.post('/api/rui/check', authService.requireAuth, async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'filePath is required' });
    }
    
    if (!ruiService) {
      return res.status(503).json({ error: 'RUI service not available' });
    }
    
    const result = await ruiService.forceCheckFile(filePath);
    res.json(result);
  } catch (error) {
    console.error('Error force checking file:', error);
    res.status(500).json({ error: `Failed to check file: ${error.message}` });
  }
});

// Test RUI API connection
app.post('/api/rui/test-connection', authService.requireAuth, async (req, res) => {
  try {
    if (!ruiService) {
      return res.status(503).json({ error: 'RUI service not available' });
    }
    
    const result = await ruiService.testConnection();
    res.json(result);
  } catch (error) {
    console.error('Error testing RUI connection:', error);
    res.status(500).json({ error: `Connection test failed: ${error.message}` });
  }
});

// Start RUI service
app.post('/api/rui/start', authService.requireAuth, async (req, res) => {
  try {
    if (!ruiService) {
      return res.status(503).json({ error: 'RUI service not initialized' });
    }
    
    const started = await ruiService.start();
    res.json({ 
      success: started, 
      message: started ? 'RUI service started' : 'RUI service already running' 
    });
  } catch (error) {
    console.error('Error starting RUI service:', error);
    res.status(500).json({ error: `Failed to start RUI service: ${error.message}` });
  }
});

// Stop RUI service
app.post('/api/rui/stop', authService.requireAuth, async (req, res) => {
  try {
    if (!ruiService) {
      return res.status(503).json({ error: 'RUI service not initialized' });
    }
    
    ruiService.stop();
    res.json({ success: true, message: 'RUI service stopped' });
  } catch (error) {
    console.error('Error stopping RUI service:', error);
    res.status(500).json({ error: `Failed to stop RUI service: ${error.message}` });
  }
});


// Get available actions for a file
app.get('/api/actions', authService.requireAuth, async (req, res) => {
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
app.get('/api/directory-size', authService.requireAuth, async (req, res) => {
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
app.post('/api/directory-sizes', authService.requireAuth, async (req, res) => {
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
app.get('/api/profiles', authService.requireAuth, async (req, res) => {
  try {
    const profiles = await CacheJobProfileModel.findAll();
    res.json(profiles);
  } catch (error) {
    console.error('Error getting profiles:', error);
    res.status(500).json({ error: 'Failed to get profiles' });
  }
});

// Create cache job from selected files
app.post('/api/jobs/cache', authService.requireAuth, async (req, res) => {
  try {
    let { filePaths, directories = [], profileName, profileId } = req.body;
    
    // If no filePaths but directories provided, expand directories to get files
    if ((!filePaths || filePaths.length === 0) && directories && directories.length > 0) {
      console.log(`Expanding ${directories.length} directories to collect files for cache job`);
      filePaths = [];
      
      for (const dir of directories) {
        try {
          // Get all files recursively from the directory
          const dirFiles = await FileModel.findFilesRecursively(dir);
          filePaths.push(...dirFiles.map(f => f.path));
          console.log(`Collected ${dirFiles.length} files from directory: ${dir}`);
        } catch (error) {
          console.error(`Error collecting files from directory ${dir}:`, error);
        }
      }
      
      if (filePaths.length === 0) {
        logger.warn('No files found in provided directories', {
          event: 'cache_job_no_files',
          directories,
          username: req.user?.username || 'unknown',
          timestamp: new Date().toISOString()
        });
        return res.status(400).json({ error: 'No files found in provided directories' });
      }
      
      console.log(`Total files collected from directories: ${filePaths.length}`);
    }
    
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      logger.warn('Cache job creation failed - no files provided', {
        event: 'cache_job_invalid',
        username: req.user?.username || 'unknown',
        clientIP: req.ip || 'unknown',
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ error: 'File paths array required' });
    }
    
    // Get client IP and user info
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const username = req.user?.username || 'unknown';
    
    // Get profile - by ID, by name, auto-match, or default
    let profile;
    if (profileId) {
      profile = await CacheJobProfileModel.findById(profileId);
      logger.info(`Using profile by ID: ${profile?.name}`);
    } else if (profileName) {
      profile = await CacheJobProfileModel.findByName(profileName);
      logger.info(`Using profile by name: ${profile?.name}`);
    } else {
      // Auto-select best matching profile based on files
      profile = await CacheJobProfileModel.findBestMatch(filePaths);
      logger.info(`Auto-selected profile: ${profile?.name} for ${filePaths.length} files`);
    }
    
    if (!profile) {
      profile = await CacheJobProfileModel.findDefault();
      logger.warn('No suitable cache profile found, using default', {
        event: 'cache_job_profile_fallback',
        username,
        fileCount: filePaths.length,
        profileRequested: profileName || profileId,
        defaultProfile: profile?.name,
        timestamp: new Date().toISOString()
      });
    }
    
    // Create job in database with profile
    const job = await CacheJobModel.create(filePaths, directories, profile.id);
    
    // Log cache job creation
    logger.info('Cache job created', {
      event: 'cache_job_created',
      jobId: job.id,
      username,
      clientIP,
      fileCount: filePaths.length,
      directoryCount: directories.length,
      profileName: profile.name,
      profileId: profile.id,
      timestamp: new Date().toISOString()
    });
    
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

// Create video preview job from selected files
app.post('/api/jobs/video-preview', authService.requireAuth, async (req, res) => {
  try {
    let { filePaths, directories = [], profileName, profileId } = req.body;
    
    // If no filePaths but directories provided, expand directories to get files
    if ((!filePaths || filePaths.length === 0) && directories && directories.length > 0) {
      console.log(`Expanding ${directories.length} directories to collect files for video preview job`);
      filePaths = [];
      
      for (const dir of directories) {
        try {
          const dirFiles = await FileModel.findFilesRecursively(dir);
          // Filter for video files only
          const videoFiles = dirFiles.filter(f => {
            const type = MediaPreviewService.getPreviewType(f.path);
            return type === 'video';
          });
          filePaths.push(...videoFiles.map(f => f.path));
          console.log(`Collected ${videoFiles.length} video files from directory: ${dir}`);
        } catch (error) {
          console.error(`Error collecting video files from directory ${dir}:`, error);
        }
      }
      
      if (filePaths.length === 0) {
        return res.status(400).json({ error: 'No video files found in provided directories' });
      }
    }
    
    // Filter for video files only
    const videoFilePaths = filePaths.filter(path => {
      const type = MediaPreviewService.getPreviewType(path);
      return type === 'video';
    });
    
    if (videoFilePaths.length === 0) {
      return res.status(400).json({ error: 'No video files in selection' });
    }
    
    // Get profile
    let profile;
    if (profileId) {
      profile = await VideoPreviewProfileModel.findById(profileId);
    } else if (profileName) {
      profile = await VideoPreviewProfileModel.findByName(profileName);
    } else {
      profile = await VideoPreviewProfileModel.findDefault();
    }
    
    // Create the job
    const job = await VideoPreviewJobModel.create({
      filePaths: videoFilePaths,
      directoryPaths: directories,
      profileId: profile ? profile.id : null
    });
    
    // Create job items
    for (const filePath of videoFilePaths) {
      const fileName = path.basename(filePath);
      await VideoPreviewJobItemModel.create({
        jobId: job.id,
        filePath,
        fileName,
        fileSize: null // We'll get size during processing
      });
    }
    
    logger.info('Video preview job created', {
      event: 'video_preview_job_created',
      jobId: job.id,
      fileCount: videoFilePaths.length,
      profile: profile?.name || 'default',
      username: req.user?.username || 'unknown',
      timestamp: new Date().toISOString()
    });
    
    res.json({ 
      jobId: job.id, 
      fileCount: videoFilePaths.length,
      status: 'pending',
      profile: profile?.name || 'default'
    });
    
  } catch (error) {
    console.error('Error creating video preview job:', error);
    logger.error('Video preview job creation failed', {
      event: 'video_preview_job_failed',
      error: error.message,
      username: req.user?.username || 'unknown',
      timestamp: new Date().toISOString()
    });
    res.status(500).json({ error: 'Failed to create video preview job' });
  }
});

// Get video preview profiles
app.get('/api/video-preview/profiles', authService.requireAuth, async (req, res) => {
  try {
    const profiles = await VideoPreviewProfileModel.findAll();
    res.json(profiles);
  } catch (error) {
    console.error('Error getting video preview profiles:', error);
    res.status(500).json({ error: 'Failed to get profiles' });
  }
});

// Get video preview job statistics
app.get('/api/video-preview/stats', authService.requireAuth, async (req, res) => {
  try {
    const stats = await VideoPreviewJobModel.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting video preview stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Generate direct link for a file
app.post('/api/direct-link', authService.requireAuth, async (req, res) => {
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
app.get('/api/files/cached', authService.requireAuth, async (req, res) => {
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
app.post('/api/execute', authService.requireAuth, async (req, res) => {
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
app.get('/api/jobs', authService.requireAuth, async (req, res) => {
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
    
    // Get index jobs from database (only active + most recent completed)
    const { IndexProgressModel } = require('./database');
    const allIndexJobs = await IndexProgressModel.findAll(10);
    
    // Filter to get active jobs and most recent completed job
    const activeIndexJobs = allIndexJobs.filter(job => 
      ['pending', 'running'].includes(job.status)
    );
    const completedIndexJobs = allIndexJobs.filter(job => 
      ['completed', 'failed', 'stopped'].includes(job.status)
    );
    
    // Combine: all active jobs + last 5 completed jobs (if any)
    const relevantIndexJobs = [
      ...activeIndexJobs,
      ...completedIndexJobs.slice(0, 5)
    ];
    
    const indexJobList = relevantIndexJobs.map(job => ({
      id: `index-${job.id}`,
      type: 'index',
      status: job.status,
      totalFiles: job.total_files || 0,
      processedFiles: job.processed_files || 0,
      currentPath: job.current_path,
      rootPath: job.root_path,
      startTime: job.started_at,
      endTime: job.completed_at,
      errorMessage: job.error_message,
      output: [] // Index jobs don't have output like script jobs
    }));
    
    // Get video preview jobs from database
    const videoPreviewJobs = await VideoPreviewJobModel.findAll(20);
    const videoPreviewJobList = videoPreviewJobs.map(job => ({
      id: job.id,
      type: 'video-preview',
      status: job.status,
      totalFiles: job.total_files,
      completedFiles: job.completed_files,
      failedFiles: job.failed_files,
      skippedFiles: job.skipped_files,
      startTime: job.created_at,
      endTime: job.completed_at,
      output: [] // Video preview jobs don't have output like script jobs
    }));
    
    // Combine and sort by start time
    const allJobs = [...dbJobList, ...scriptJobList, ...indexJobList, ...videoPreviewJobList]
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    res.json(allJobs);
  } catch (error) {
    console.error('Error getting jobs:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// Get specific job
app.get('/api/jobs/:id', authService.requireAuth, async (req, res) => {
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
    
    // Try index jobs (format: index-{id})
    if (jobId.startsWith('index-')) {
      const indexId = parseInt(jobId.replace('index-', ''));
      const { IndexProgressModel } = require('./database');
      const indexProgress = await IndexProgressModel.findAll(50); // Search recent jobs
      const indexJob = indexProgress.find(job => job.id === indexId);
      if (indexJob) {
        return res.json({
          id: `index-${indexJob.id}`,
          type: 'index',
          status: indexJob.status,
          totalFiles: indexJob.total_files || 0,
          processedFiles: indexJob.processed_files || 0,
          currentPath: indexJob.current_path,
          rootPath: indexJob.root_path,
          startTime: indexJob.started_at,
          endTime: indexJob.completed_at,
          errorMessage: indexJob.error_message
        });
      }
    }
    
    res.status(404).json({ error: 'Job not found' });
  } catch (error) {
    console.error('Error getting job:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

// Cache Job Control Endpoints

// Start cache job processing
app.post('/api/jobs/:id/start', authService.requireAuth, async (req, res) => {
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
app.post('/api/jobs/:id/pause', authService.requireAuth, async (req, res) => {
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

// Cancel job (cache or video preview)
app.post('/api/jobs/:id/cancel', authService.requireAuth, async (req, res) => {
  try {
    const jobId = req.params.id;
    console.log(`Attempting to cancel job: ${jobId}`);
    
    // First try as cache job
    let job = await CacheJobModel.findById(jobId);
    let jobType = 'cache';
    
    if (!job) {
      // Try as video preview job
      job = await VideoPreviewJobModel.findById(jobId);
      jobType = 'video-preview';
    }
    
    if (!job) {
      // Try as index job (format: index-{id})
      if (jobId.startsWith('index-')) {
        const indexId = parseInt(jobId.replace('index-', ''));
        await IndexProgressModel.updateStatus(indexId, 'stopped');
        return res.json({
          jobId: jobId,
          status: 'stopped',
          message: 'Index job stopped successfully'
        });
      }
      
      console.log(`Job not found: ${jobId}`);
      return res.status(404).json({ error: 'Job not found' });
    }
    
    console.log(`Found ${jobType} job ${jobId} with status: ${job.status}`);
    
    if (!['pending', 'running', 'paused'].includes(job.status)) {
      console.log(`Job ${jobId} cannot be cancelled, status: ${job.status}`);
      return res.status(400).json({ 
        error: `Job cannot be cancelled. Current status: ${job.status}` 
      });
    }
    
    console.log(`Updating ${jobType} job ${jobId} status to cancelled`);
    
    // Update job status to cancelled based on type
    if (jobType === 'cache') {
      await CacheJobModel.updateStatus(jobId, 'cancelled');
    } else if (jobType === 'video-preview') {
      await VideoPreviewJobModel.updateStatus(jobId, 'cancelled');
      
      // Also notify the video preview manager to stop processing this job
      if (videoPreviewManager) {
        videoPreviewManager.cancelJob(jobId);
      }
    }
    
    console.log(`Successfully cancelled ${jobType} job ${jobId}`);
    
    res.json({ 
      jobId: job.id,
      jobType: jobType,
      status: 'cancelled',
      message: `${jobType} job cancelled successfully`
    });
    
  } catch (error) {
    console.error('Error cancelling job:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Failed to cancel job',
      details: error.message 
    });
  }
});

// Get cache worker status
app.get('/api/workers/status', authService.requireAuth, async (req, res) => {
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
app.post('/api/jobs/clear', authService.requireAuth, async (req, res) => {
  try {
    // Delete completed and failed cache jobs from database
    const result = await pool.query(`
      DELETE FROM cache_jobs 
      WHERE status IN ('completed', 'failed', 'cancelled')
    `);
    
    const deletedCacheJobs = result.rowCount;
    
    // Delete completed and failed video preview jobs from database
    const videoPreviewResult = await pool.query(`
      DELETE FROM video_preview_jobs 
      WHERE status IN ('completed', 'failed', 'cancelled')
    `);
    
    const deletedVideoPreviewJobs = videoPreviewResult.rowCount;
    
    // Delete completed and failed index jobs from database
    const indexResult = await pool.query(`
      DELETE FROM index_progress
      WHERE status IN ('completed', 'failed', 'cancelled')
    `);
    
    const deletedIndexJobs = indexResult.rowCount;
    
    // Clear completed script jobs from memory
    let deletedScriptJobs = 0;
    for (const [jobId, job] of jobs.entries()) {
      if (['completed', 'failed'].includes(job.status)) {
        jobs.delete(jobId);
        deletedScriptJobs++;
      }
    }
    
    const totalDeleted = deletedCacheJobs + deletedVideoPreviewJobs + deletedIndexJobs + deletedScriptJobs;
    
    res.json({ 
      message: `Cleared ${totalDeleted} completed jobs (${deletedCacheJobs} cache, ${deletedVideoPreviewJobs} video preview, ${deletedIndexJobs} index, ${deletedScriptJobs} script)`,
      deletedCount: totalDeleted,
      cacheJobs: deletedCacheJobs,
      videoPreviewJobs: deletedVideoPreviewJobs,
      indexJobs: deletedIndexJobs,
      scriptJobs: deletedScriptJobs
    });
    
    console.log(`Cleared ${totalDeleted} completed jobs: ${deletedCacheJobs} cache jobs, ${deletedVideoPreviewJobs} video preview jobs, ${deletedIndexJobs} index jobs, ${deletedScriptJobs} script jobs`);
    
  } catch (error) {
    console.error('Error clearing jobs:', error);
    res.status(500).json({ error: 'Failed to clear jobs' });
  }
});

// Validate directory cache status
app.post('/api/validate-directory-cache', authService.requireAuth, async (req, res) => {
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

// Media Preview Endpoints (using integrated service)
app.post('/api/preview', authService.requireAuth, async (req, res) => {
  try {
    const { filePath, type = 'auto' } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service is not available' });
    }
    
    // Check if file exists
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Generate preview based on file type
    let result;
    
    // Check file extension for type detection
    const ext = path.extname(filePath).toLowerCase();
    
    // Video files
    if (type === 'video' || (type === 'auto' && /\.(mp4|mov|avi|mkv|mxf|webm|ogg|m4v|wmv|flv|mpg|mpeg|3gp|3g2|m2ts|mts|vob|ogv|drc|gif|gifv|mng|qt|yuv|rm|rmvb|asf|amv|m4p|m4v|svi|3gpp|3gpp2|f4v|f4p|f4a|f4b|r3d|braw)$/i.test(filePath))) {
      result = await mediaPreviewService.generateVideoPreview(filePath, req.body.options || {});
    } 
    // Image files
    else if (type === 'image' || (type === 'auto' && /\.(jpg|jpeg|png|gif|webp|svg|tif|tiff|bmp|heic|heif|raw|exr|dpx|dng|cr2|nef|orf|arw|pef)$/i.test(filePath))) {
      result = await mediaPreviewService.generateImagePreview(filePath, req.body.options || {});
    }
    // Audio files
    else if (type === 'audio' || (type === 'auto' && /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i.test(filePath))) {
      result = await mediaPreviewService.generateAudioPreview(filePath, req.body.options || {});
    }
    else {
      return res.status(400).json({ error: 'Unsupported file type for preview' });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Get preview status
app.get('/api/preview/status/:cacheKey', authService.requireAuth, async (req, res) => {
  try {
    const { cacheKey } = req.params;
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service is not available' });
    }
    
    const result = await mediaPreviewService.getPreviewStatus(cacheKey);
    
    if (!result) {
      return res.status(404).json({ error: 'Preview not found' });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error getting preview status:', error);
    res.status(500).json({ error: 'Failed to get preview status' });
  }
});

// Direct image serving endpoint for web-compatible images
app.get('/api/preview/image/:cacheKey/direct', authService.requireAuth, async (req, res) => {
  try {
    const { cacheKey } = req.params;
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service is not available' });
    }
    
    // Get file info from cache
    console.log(`Getting preview status for cache key: ${cacheKey}`);
    const previewData = await mediaPreviewService.getPreviewStatus(cacheKey);
    console.log('Preview data:', previewData);
    if (!previewData || !previewData.originalFilePath) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const imagePath = previewData.originalFilePath;
    const stat = fsSync.statSync(imagePath);
    const contentType = MediaPreviewService.getContentType(imagePath);
    
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    
    fsSync.createReadStream(imagePath).pipe(res);
    
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Converted image preview endpoint for non-web-compatible images (TIF, EXR, etc.)
app.get('/api/preview/image/:cacheKey/preview.jpg', authService.requireAuth, async (req, res) => {
  try {
    const { cacheKey } = req.params;
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service is not available' });
    }
    
    // Get file info from cache
    console.log(`Looking for preview data with cache key: ${cacheKey}`);
    const previewData = await mediaPreviewService.getPreviewStatus(cacheKey);
    console.log('Preview data found:', previewData);
    if (!previewData || !previewData.originalFilePath) {
      console.log('No preview data or originalFilePath found');
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const imagePath = previewData.originalFilePath;
    const previewDir = path.join(mediaPreviewService.PREVIEW_CACHE_DIR, 'image', cacheKey);
    const convertedPath = path.join(previewDir, 'preview.jpg');
    
    // Check if preview already exists
    if (fsSync.existsSync(convertedPath)) {
      const stat = fsSync.statSync(convertedPath);
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*'
      });
      return fsSync.createReadStream(convertedPath).pipe(res);
    }
    
    // Create preview directory
    fsSync.mkdirSync(previewDir, { recursive: true });
    
    // Convert image to JPEG using ffmpeg
    const { spawn } = require('child_process');
    const ffmpeg = spawn('ffmpeg', [
      '-i', imagePath,
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease',
      '-q:v', '2',
      '-y',
      convertedPath
    ]);
    
    ffmpeg.on('close', (code) => {
      if (code === 0 && fsSync.existsSync(convertedPath)) {
        const stat = fsSync.statSync(convertedPath);
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        });
        fsSync.createReadStream(convertedPath).pipe(res);
      } else {
        console.error(`FFmpeg conversion failed with code ${code}`);
        res.status(500).json({ error: 'Failed to convert image' });
      }
    });
    
    ffmpeg.stderr.on('data', (data) => {
      console.error(`FFmpeg stderr: ${data}`);
    });
    
  } catch (error) {
    console.error('Error serving converted image:', error);
    res.status(500).json({ error: 'Failed to serve converted image' });
  }
});

// Direct audio serving endpoint for web-compatible audio
app.get('/api/preview/audio/:cacheKey/direct', authService.requireAuth, async (req, res) => {
  try {
    const { cacheKey } = req.params;
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service is not available' });
    }
    
    // Get file info from cache
    const previewData = await mediaPreviewService.getPreviewStatus(cacheKey);
    if (!previewData || !previewData.originalFilePath) {
      return res.status(404).json({ error: 'Audio not found' });
    }
    
    const audioPath = previewData.originalFilePath;
    const stat = fsSync.statSync(audioPath);
    const contentType = MediaPreviewService.getContentType(audioPath);
    const range = req.headers.range;
    
    if (range) {
      // Parse range header for audio scrubbing support
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      
      const stream = fsSync.createReadStream(audioPath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      
      fsSync.createReadStream(audioPath).pipe(res);
    }
    
  } catch (error) {
    console.error('Error serving audio:', error);
    res.status(500).json({ error: 'Failed to serve audio' });
  }
});

// Direct video serving endpoint for web-compatible videos
app.get('/api/preview/video/:cacheKey/direct', authService.requireAuth, async (req, res) => {
  try {
    const { cacheKey } = req.params;
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service is not available' });
    }
    
    // Get file info from cache
    const previewData = await mediaPreviewService.getPreviewStatus(cacheKey);
    if (!previewData || !previewData.originalFilePath) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const videoPath = previewData.originalFilePath;
    const stat = fsSync.statSync(videoPath);
    const contentType = MediaPreviewService.getContentType(videoPath);
    const range = req.headers.range;
    
    if (range) {
      // Parse range header for video seeking support
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      
      const stream = fsSync.createReadStream(videoPath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      
      fsSync.createReadStream(videoPath).pipe(res);
    }
    
  } catch (error) {
    console.error('Error serving direct video:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Direct preview file serving (for HLS segments)
app.get('/api/preview/:type/:cacheKey/*', authService.requireAuth, async (req, res) => {
  try {
    const { type, cacheKey } = req.params;
    const filename = req.params[0];
    
    // Construct file path
    const filePath = path.join(process.env.PREVIEW_CACHE_DIR || '/app/preview-cache', cacheKey, filename);
    
    // Check if file exists
    if (!fsSync.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Determine content type
    let contentType = 'application/octet-stream';
    if (filename.endsWith('.m3u8')) {
      contentType = 'application/vnd.apple.mpegurl';
    } else if (filename.endsWith('.ts')) {
      contentType = 'video/mp2t';
    } else if (filename.endsWith('.mp4')) {
      contentType = 'video/mp4';
    } else if (filename.endsWith('.mpd')) {
      contentType = 'application/dash+xml';
    } else if (filename.endsWith('.m4s')) {
      contentType = 'video/iso.segment';
    }
    
    // Get file stats
    const stat = fsSync.statSync(filePath);
    
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    // Set appropriate cache headers based on file type
    if (filename.endsWith('.ts') || filename.endsWith('.m4s')) {
      // Cache segments for 1 hour - they don't change once created
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else if (filename.endsWith('.m3u8') || filename.endsWith('.mpd')) {
      // Don't cache manifests during progressive streaming
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    
    // Stream the file
    fsSync.createReadStream(filePath).pipe(res);
    
  } catch (error) {
    console.error('Error serving preview file:', error);
    res.status(500).json({ error: 'Failed to serve preview file' });
  }
});

// Direct video streaming endpoint for web-compatible videos
app.get('/api/video/stream/:cacheKey', authService.requireAuth, async (req, res) => {
  try {
    const { cacheKey } = req.params;
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service is not available' });
    }
    
    // Get file info from cache
    const previewData = await mediaPreviewService.getPreviewStatus(cacheKey);
    if (!previewData || !previewData.originalFilePath) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const videoPath = previewData.originalFilePath;
    const stat = fsSync.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      
      const stream = fsSync.createReadStream(videoPath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      
      fsSync.createReadStream(videoPath).pipe(res);
    }
    
  } catch (error) {
    console.error('Error streaming video:', error);
    res.status(500).json({ error: 'Failed to stream video' });
  }
});



// WebSocket connection handling
// Terminal session management
const terminalSessions = new Map();

wss.on('connection', (ws, req) => {
  console.log('Client connected to WebSocket');
  
  // Check if this is a terminal connection
  const url = new URL(req.url, `http://${req.headers.host}`);
  const isTerminalConnection = url.pathname === '/terminal';
  
  if (isTerminalConnection) {
    handleTerminalConnection(ws);
  } else {
    // Regular WebSocket connection
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
    
    // Send current jobs on connection
    ws.send(JSON.stringify({ type: 'connection-established' }));
  }
});

function handleTerminalConnection(ws) {
  console.log('Terminal connection established');
  console.log('pty module available:', typeof pty !== 'undefined');
  
  let ptyProcess = null;
  const sessionId = uuidv4();
  
  try {
    // With privileged container, we can use nsenter to access host
    const hostIP = process.env.SERVER_HOST || 'host.docker.internal';
    
    // SSH to the host system directly
    // First, check if we can use SSH to connect to the host
    const sshHost = process.env.SSH_HOST || 'host.docker.internal'; // Docker host
    const sshUser = process.env.SSH_USER || 'ubuntu';
    const sshPort = process.env.SSH_PORT || '22';
    
    command = 'bash';
    args = [
      '-c',
      `# Attempt to SSH to the host system
echo "Connecting to host system..."
echo ""

# Set up SSH options for non-interactive connection
SSH_OPTIONS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

# Try to connect via SSH
if command -v ssh >/dev/null 2>&1; then
  # Check if we can reach the host
  if timeout 2 bash -c "</dev/tcp/${sshHost}/${sshPort}" 2>/dev/null; then
    echo "Connected to host system via SSH"
    echo "Host: ${sshHost}"
    echo ""
    exec ssh $SSH_OPTIONS -p ${sshPort} ${sshUser}@${sshHost}
  else
    echo "Cannot reach host SSH on ${sshHost}:${sshPort}"
    echo ""
  fi
fi

# If SSH fails, try nsenter as fallback
if nsenter --target 1 --mount --uts --ipc --net --pid -- /bin/bash -c 'echo "Successfully connected to host system via nsenter" && hostname && exec /bin/bash'; then
  exit 0
fi

# Final fallback - container shell
echo "==================================================================="
echo "Could not connect to host system directly."
echo "Terminal connected to Docker container instead."
echo ""
echo "Container hostname: $(hostname)"
echo ""
echo "To access the host system, configure SSH access:"
echo "1. Ensure SSH is running on the host"
echo "2. Set SSH_HOST, SSH_USER, and SSH_PORT environment variables"
echo "3. Or use: docker exec -it <container> bash"
echo "==================================================================="
echo ""
exec bash --rcfile <(echo 'PS1="[CONTAINER] \\u@\\h:\\w# "')`
    ];
    options = {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: '/root',
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        HOST_IP: hostIP
      }
    };
    
    ptyProcess = pty.spawn(command, args, options);
    
    terminalSessions.set(sessionId, {
      ptyProcess,
      ws,
      created: new Date()
    });
    
    console.log(`Terminal session ${sessionId} created with PID ${ptyProcess.pid}`);
    
    // Handle terminal output - send to client
    ptyProcess.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'terminal-output',
          data: data
        }));
      }
    });
    
    // Handle terminal exit
    ptyProcess.onExit((exitCode, signal) => {
      console.log(`Terminal session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'terminal-exit',
          exitCode,
          signal
        }));
      }
      terminalSessions.delete(sessionId);
    });
    
    // Handle client messages (terminal input)
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.type === 'terminal-input' && ptyProcess) {
          ptyProcess.write(data.data);
        } else if (data.type === 'terminal-resize' && ptyProcess) {
          ptyProcess.resize(data.cols || 80, data.rows || 24);
        }
      } catch (error) {
        console.error('Error handling terminal message:', error);
      }
    });
    
    // Handle client disconnect
    ws.on('close', () => {
      console.log(`Terminal session ${sessionId} client disconnected`);
      if (ptyProcess) {
        ptyProcess.kill();
      }
      terminalSessions.delete(sessionId);
    });
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'terminal-ready',
      sessionId: sessionId
    }));
    
  } catch (error) {
    console.error('Error creating terminal session:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'terminal-error',
        error: error.message
      }));
    }
  }
}

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
      logger.info('Cache job started', {
        event: 'cache_job_started',
        jobId: data.jobId,
        timestamp: new Date().toISOString()
      });
      broadcast({ type: 'cache-job-started', ...data });
    });
    
    cacheManager.on('job-completed', (data) => {
      logger.info('Cache job completed', {
        event: 'cache_job_completed',
        jobId: data.jobId,
        duration: data.duration,
        totalFiles: data.totalFiles,
        processedFiles: data.processedFiles,
        timestamp: new Date().toISOString()
      });
      broadcast({ type: 'cache-job-completed', ...data });
    });
    
    cacheManager.on('job-failed', (data) => {
      logger.error('Cache job failed', {
        event: 'cache_job_failed',
        jobId: data.jobId,
        error: data.error,
        timestamp: new Date().toISOString()
      });
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
    
    cacheManager.on('file-progress', (data) => {
      // Only log every 100th file to reduce console spam
      if (data.totalCompleted % 100 === 0) {
        console.log(`Cache file progress: ${data.totalCompleted} files (${(data.totalCompletedBytes / 1e9).toFixed(2)} GB)`);
      }
      broadcast({ type: 'cache-file-progress', ...data });
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
        pollInterval: parseInt(process.env.LUCIDLINK_STATS_INTERVAL) || 1000,
        includeGetTime: process.env.LUCIDLINK_INCLUDE_GET_TIME !== 'false',
        restEndpoint: process.env.LUCIDLINK_REST_ENDPOINT || null
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
  
  // Initialize media preview service
  try {
    mediaPreviewService = new MediaPreviewService(broadcast);
    console.log('Media preview service initialized');
    
    // Schedule cleanup of old previews (runs daily)
    setInterval(async () => {
      try {
        await mediaPreviewService.cleanupOldPreviews();
        console.log('Cleaned up old preview files');
      } catch (error) {
        console.error('Error cleaning up old previews:', error);
      }
    }, 24 * 60 * 60 * 1000); // Run every 24 hours
    
    // Run initial cleanup on startup
    mediaPreviewService.cleanupOldPreviews().catch(err => 
      console.error('Error during initial preview cleanup:', err)
    );
  } catch (error) {
    console.error('Failed to initialize media preview service:', error);
  }
  
  // Start video preview manager
  let videoPreviewManager = null;
  console.log('Checking video preview manager prerequisites:', {
    dbConnected,
    mediaPreviewService: !!mediaPreviewService
  });
  if (dbConnected && mediaPreviewService) {
    console.log('Initializing video preview manager...');
    videoPreviewManager = new VideoPreviewManager({
      workerCount: parseInt(process.env.VIDEO_PREVIEW_WORKER_COUNT) || 1,
      mediaPreviewService: mediaPreviewService,
      workerOptions: {
        maxConcurrentFiles: parseInt(process.env.VIDEO_PREVIEW_MAX_CONCURRENT) || 2,
        pollInterval: parseInt(process.env.VIDEO_PREVIEW_POLL_INTERVAL) || 5000
      }
    });
    
    // Set up video preview event forwarding to WebSocket
    videoPreviewManager.on('job-started', (data) => {
      logger.info('Video preview job started', {
        event: 'video_preview_job_started',
        jobId: data.jobId,
        timestamp: new Date().toISOString()
      });
      broadcast({ type: 'video-preview-job-started', ...data });
    });
    
    videoPreviewManager.on('job-completed', (data) => {
      logger.info('Video preview job completed', {
        event: 'video_preview_job_completed',
        jobId: data.jobId,
        duration: data.duration,
        totalFiles: data.totalFiles,
        timestamp: new Date().toISOString()
      });
      broadcast({ type: 'video-preview-job-completed', ...data });
    });
    
    videoPreviewManager.on('job-failed', (data) => {
      logger.error('Video preview job failed', {
        event: 'video_preview_job_failed',
        jobId: data.jobId,
        error: data.error,
        timestamp: new Date().toISOString()
      });
      broadcast({ type: 'video-preview-job-failed', ...data });
    });
    
    videoPreviewManager.on('job-progress', (data) => {
      broadcast({ type: 'video-preview-job-progress', ...data });
    });
    
    videoPreviewManager.on('file-started', (data) => {
      broadcast({ type: 'video-preview-file-started', ...data });
    });
    
    videoPreviewManager.on('file-completed', (data) => {
      broadcast({ type: 'video-preview-file-completed', ...data });
    });
    
    videoPreviewManager.on('file-failed', (data) => {
      broadcast({ type: 'video-preview-file-failed', ...data });
    });
    
    videoPreviewManager.on('file-skipped', (data) => {
      broadcast({ type: 'video-preview-file-skipped', ...data });
    });
    
    try {
      await videoPreviewManager.start();
      console.log('Video preview manager started');
      
      // Store in app locals for access in routes
      app.locals.videoPreviewManager = videoPreviewManager;
    } catch (error) {
      console.error('Failed to start video preview manager:', error);
    }
  } else {
    console.log('Video preview manager not started:', {
      dbConnected,
      mediaPreviewService: !!mediaPreviewService
    });
  }
  
  // Initialize Elasticsearch client
  try {
    elasticsearchClient = new ElasticsearchClient();
    const isConnected = await elasticsearchClient.testConnection();
    if (isConnected) {
      await elasticsearchClient.ensureIndexExists();
      console.log('Elasticsearch client initialized and connected');
    } else {
      console.log('Elasticsearch client initialized but not connected');
    }
  } catch (error) {
    console.error('Failed to initialize Elasticsearch client:', error);
  }
  
  // Initialize RUI service
  try {
    ruiService = new RUIService(broadcast);
    console.log('RUI service initialized');
    
    // Auto-start RUI service if enabled
    if (process.env.ENABLE_RUI === 'true') {
      await ruiService.start();
      console.log('RUI service auto-started');
    }
  } catch (error) {
    console.error('Failed to initialize RUI service:', error);
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