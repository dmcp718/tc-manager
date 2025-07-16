const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { MediaPreviewService } = require('./media-preview-service');

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Media Preview Service
const mediaService = new MediaPreviewService();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'media-preview-service',
    timestamp: new Date().toISOString()
  });
});

// Get supported file types
app.get('/api/preview/types', (req, res) => {
  res.json({
    supported: MediaPreviewService.getSupportedTypes(),
    success: true
  });
});

// Check if file is supported
app.get('/api/preview/supported/:filename', (req, res) => {
  const { filename } = req.params;
  const supported = MediaPreviewService.isSupportedFormat(filename);
  const type = MediaPreviewService.getPreviewType(filename);
  const webCompatible = MediaPreviewService.isWebCompatible(filename);
  
  res.json({
    filename,
    supported,
    type,
    webCompatible,
    success: true
  });
});

// Generate video preview
app.post('/api/preview/video', async (req, res) => {
  try {
    const { filePath, options = {} } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const type = MediaPreviewService.getPreviewType(filePath);
    if (type !== 'video') {
      return res.status(400).json({ error: 'File is not a video' });
    }
    
    const preview = await mediaService.generateVideoPreview(filePath, options);
    res.json({ preview, success: true });
    
  } catch (error) {
    console.error('Error generating video preview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate image preview
app.post('/api/preview/image', async (req, res) => {
  try {
    const { filePath, options = {} } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const type = MediaPreviewService.getPreviewType(filePath);
    if (type !== 'image') {
      return res.status(400).json({ error: 'File is not an image' });
    }
    
    const preview = await mediaService.generateImagePreview(filePath, options);
    res.json({ preview, success: true });
    
  } catch (error) {
    console.error('Error generating image preview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get preview status
app.get('/api/preview/status/:cacheKey', async (req, res) => {
  try {
    const { cacheKey } = req.params;
    const status = await mediaService.getPreviewStatus(cacheKey);
    
    if (!status) {
      return res.status(404).json({ error: 'Preview not found' });
    }
    
    res.json({ status, success: true });
    
  } catch (error) {
    console.error('Error getting preview status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve video playlist files
app.get('/api/preview/video/:cacheKey/:filename', (req, res) => {
  try {
    const { cacheKey, filename } = req.params;
    const filePath = path.join(mediaService.PREVIEW_CACHE_DIR, cacheKey, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set appropriate content type for HLS files
    if (filename.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    } else if (filename.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
    }
    
    // Enable CORS for HLS streaming
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('Error serving video file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve image preview files
app.get('/api/preview/image/:cacheKey/:filename', (req, res) => {
  try {
    const { cacheKey, filename } = req.params;
    const filePath = path.join(mediaService.PREVIEW_CACHE_DIR, cacheKey, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set appropriate content type
    const contentType = MediaPreviewService.getContentType(filename);
    res.setHeader('Content-Type', contentType);
    
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('Error serving image file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve direct image files (for web-compatible formats)
app.get('/api/preview/image/:cacheKey/direct', async (req, res) => {
  try {
    const { cacheKey } = req.params;
    const status = await mediaService.getPreviewStatus(cacheKey);
    
    if (!status || !status.originalPath) {
      return res.status(404).json({ error: 'Preview not found' });
    }
    
    const contentType = MediaPreviewService.getContentType(status.originalPath);
    res.setHeader('Content-Type', contentType);
    
    res.sendFile(status.originalPath);
    
  } catch (error) {
    console.error('Error serving direct image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cleanup endpoint (for maintenance)
app.post('/api/preview/cleanup', async (req, res) => {
  try {
    const { maxAge = 86400000 } = req.body; // 24 hours default
    await mediaService.cleanupOldPreviews(maxAge);
    res.json({ success: true, message: 'Cleanup completed' });
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Media Preview Service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});