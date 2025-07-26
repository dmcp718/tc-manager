// Media Preview Service - Standalone Server
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { MediaPreviewService } = require('./media-preview-service');

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize media preview service
let mediaPreviewService = null;

// Initialize service on startup
async function initializeService() {
  try {
    mediaPreviewService = new MediaPreviewService();
    console.log('Media preview service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize media preview service:', error);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'media-preview',
    checks: {
      mediaPreviewService: mediaPreviewService !== null,
      lucidlinkMount: fs.existsSync(process.env.LUCIDLINK_MOUNT_POINT || '/media/lucidlink-1')
    }
  };
  
  const isHealthy = Object.values(health.checks).every(check => check === true);
  res.status(isHealthy ? 200 : 503).json(health);
});

// Generate preview endpoint
app.post('/preview', async (req, res) => {
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
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check if media preview service is initialized
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service not available' });
    }
    
    // Determine preview type based on file extension
    const previewType = type === 'auto' ? 
      MediaPreviewService.getPreviewType(filePath) : type;
    
    // Check if file format is supported
    if (!MediaPreviewService.isSupportedFormat(filePath)) {
      return res.status(400).json({ 
        error: 'Unsupported file format',
        supportedTypes: MediaPreviewService.getSupportedTypes()
      });
    }
    
    // Generate preview
    let result;
    if (previewType === 'video') {
      result = await mediaPreviewService.generateVideoPreview(filePath, req.body.options || {});
    } else if (previewType === 'image') {
      result = await mediaPreviewService.generateImagePreview(filePath, req.body.options || {});
    } else if (previewType === 'audio') {
      result = await mediaPreviewService.generateAudioPreview(filePath, req.body.options || {});
    } else {
      return res.status(400).json({ error: 'Unsupported preview type' });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error processing preview request:', error);
    res.status(500).json({ error: 'Failed to process preview request' });
  }
});

// Get preview status
app.get('/preview/status/:cacheKey', async (req, res) => {
  try {
    const { cacheKey } = req.params;
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service not available' });
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

// Serve preview files
app.get('/preview/:type/:cacheKey/*', async (req, res) => {
  try {
    const { type, cacheKey } = req.params;
    const filename = req.params[0];
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service not available' });
    }
    
    const cacheDir = process.env.PREVIEW_CACHE_DIR || '/app/preview-cache';
    
    if (type === 'video') {
      // For video previews, serve HLS files from cache directory
      const filePath = path.join(cacheDir, cacheKey, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      // Set appropriate content type
      let contentType = 'application/octet-stream';
      if (filename.endsWith('.m3u8')) {
        contentType = 'application/vnd.apple.mpegurl';
      } else if (filename.endsWith('.ts')) {
        contentType = 'video/mp2t';
      }
      
      res.setHeader('Content-Type', contentType);
      
      // Enable CORS for HLS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      
    } else if (type === 'image') {
      // Handle image preview serving
      if (filename === 'direct') {
        // Serve original image directly
        const previewData = await mediaPreviewService.getPreviewFromCache(cacheKey);
        if (!previewData || !previewData.originalFilePath) {
          return res.status(404).json({ error: 'Preview data not found' });
        }
        
        const contentType = MediaPreviewService.getContentType(previewData.originalFilePath);
        res.setHeader('Content-Type', contentType);
        
        const stream = fs.createReadStream(previewData.originalFilePath);
        stream.pipe(res);
      } else {
        // Serve converted preview
        const previewPath = path.join(cacheDir, cacheKey, filename);
        
        if (!fs.existsSync(previewPath)) {
          // Generate preview on demand
          const previewData = await mediaPreviewService.getPreviewFromCache(cacheKey);
          if (!previewData || !previewData.originalFilePath) {
            return res.status(404).json({ error: 'Preview data not found' });
          }
          
          // Create cache directory if needed
          const cacheKeyDir = path.join(cacheDir, cacheKey);
          if (!fs.existsSync(cacheKeyDir)) {
            await fsPromises.mkdir(cacheKeyDir, { recursive: true });
          }
          
          // Convert image to web format
          await mediaPreviewService.convertImageToWebFormat(
            previewData.originalFilePath, 
            previewPath
          );
        }
        
        res.setHeader('Content-Type', 'image/jpeg');
        const stream = fs.createReadStream(previewPath);
        stream.pipe(res);
      }
      
    } else if (type === 'audio') {
      // Handle audio preview serving (similar to image)
      // Implementation depends on specific audio handling requirements
      res.status(501).json({ error: 'Audio preview serving not yet implemented' });
    }
    
  } catch (error) {
    console.error('Error serving preview file:', error);
    res.status(500).json({ error: 'Failed to serve preview file' });
  }
});

// Direct video streaming for web-compatible videos
app.get('/video/stream/:cacheKey', async (req, res) => {
  try {
    const { cacheKey } = req.params;
    
    if (!mediaPreviewService) {
      return res.status(503).json({ error: 'Media preview service not available' });
    }
    
    // Get preview data from cache
    const previewData = await mediaPreviewService.getPreviewFromCache(cacheKey);
    
    if (!previewData || !previewData.originalFilePath) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const videoPath = previewData.originalFilePath;
    const stat = await fsPromises.stat(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      // Support range requests for video seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': MediaPreviewService.getContentType(videoPath),
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': MediaPreviewService.getContentType(videoPath),
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }
    
  } catch (error) {
    console.error('Error streaming video:', error);
    res.status(500).json({ error: 'Failed to stream video' });
  }
});

// Start server
async function start() {
  await initializeService();
  
  app.listen(PORT, () => {
    console.log(`Media preview service listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`Preview cache dir: ${process.env.PREVIEW_CACHE_DIR || '/app/preview-cache'}`);
    console.log(`LucidLink mount: ${process.env.LUCIDLINK_MOUNT_POINT || '/media/lucidlink-1'}`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the service
start().catch(error => {
  console.error('Failed to start media preview service:', error);
  process.exit(1);
});