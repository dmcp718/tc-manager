const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 8095;
const API_KEY = process.env.API_GATEWAY_KEY || 'demo-api-key-2024';

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'teamcache_db',
  user: process.env.DB_USER || 'teamcache_user',
  password: process.env.DB_PASSWORD || 'teamcache_password',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Rate limiting - 10 requests per minute
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many requests, please try again later.'
});

app.use('/api/v1/cache/jobs', limiter);

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API key'
    });
  }
  
  next();
};

// Input validation schemas
const createJobSchema = Joi.object({
  files: Joi.array().items(Joi.string()).optional(),
  directories: Joi.array().items(Joi.string()).optional(),
  recursive: Joi.boolean().default(true)
}).or('files', 'directories');

// Helper function to get all files from directories
async function getFilesFromDirectories(directories, recursive = true) {
  const allFiles = [];
  
  for (const dir of directories) {
    try {
      // For simplicity in dev/demo, we'll just add the directory path
      // In production, this would scan the actual filesystem
      allFiles.push({
        path: dir,
        isDirectory: true
      });
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error);
    }
  }
  
  return allFiles;
}

// Health check endpoint
app.get('/api/v1/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT 1');
    res.json({
      success: true,
      status: 'healthy',
      service: 'api-gateway',
      database: dbCheck.rows.length > 0 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      service: 'api-gateway',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Create cache job endpoint
app.post('/api/v1/cache/jobs', authenticateApiKey, async (req, res) => {
  try {
    // Validate input
    const { error, value } = createJobSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }
    
    const { files = [], directories = [], recursive } = value;
    
    // Map relative paths to container mount point
    const containerMountPoint = process.env.CONTAINER_MOUNT_POINT || '/media/lucidlink-1';
    
    // Helper function to normalize paths
    const normalizePath = (path) => {
      // Remove leading slash if present (making it relative)
      let relativePath = path.startsWith('/') ? path.substring(1) : path;
      
      // If path already starts with the mount point, return as-is
      if (path.startsWith(containerMountPoint)) {
        return path;
      }
      
      // If path starts with common OS mount patterns, extract the relative part
      // Handle Windows paths (e.g., C:\dmpfs\tc-east-1\...)
      if (/^[A-Za-z]:[\\/]/.test(path)) {
        // Extract after the filespace name
        const parts = path.replace(/\\/g, '/').split('/');
        const filespaceIndex = parts.findIndex(p => p.match(/^tc-/i) || p.match(/^lucidlink/i));
        if (filespaceIndex !== -1 && filespaceIndex < parts.length - 1) {
          relativePath = parts.slice(filespaceIndex + 1).join('/');
        } else {
          // If no recognizable filespace, take everything after drive letter and first folder
          relativePath = parts.slice(2).join('/');
        }
      }
      // Handle macOS paths (e.g., /Volumes/dmpfs/tc-east-1/...)
      else if (path.startsWith('/Volumes/')) {
        const parts = path.split('/');
        const filespaceIndex = parts.findIndex(p => p.match(/^tc-/i) || p.match(/^lucidlink/i));
        if (filespaceIndex !== -1 && filespaceIndex < parts.length - 1) {
          relativePath = parts.slice(filespaceIndex + 1).join('/');
        } else {
          // If no recognizable filespace, take everything after /Volumes/xxx/
          relativePath = parts.slice(3).join('/');
        }
      }
      // Handle Linux paths that might have different mount points
      else if (path.startsWith('/mnt/') || path.startsWith('/media/')) {
        const parts = path.split('/');
        const filespaceIndex = parts.findIndex(p => p.match(/^tc-/i) || p.match(/^lucidlink/i));
        if (filespaceIndex !== -1 && filespaceIndex < parts.length - 1) {
          relativePath = parts.slice(filespaceIndex + 1).join('/');
        }
      }
      
      // Combine with container mount point
      return `${containerMountPoint}/${relativePath}`;
    };
    
    // Normalize all paths
    const normalizedFiles = files.map(normalizePath);
    const normalizedDirectories = directories.map(normalizePath);
    
    // Combine files and directory contents
    let allFiles = [...normalizedFiles];
    
    if (normalizedDirectories.length > 0) {
      const dirFiles = await getFilesFromDirectories(normalizedDirectories, recursive);
      allFiles = allFiles.concat(dirFiles.map(f => f.path));
    }
    
    if (allFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files or directories provided'
      });
    }
    
    // Create job in database
    const jobId = uuidv4();
    const result = await pool.query(
      `INSERT INTO cache_jobs (id, file_paths, directory_paths, total_files, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [jobId, normalizedFiles, normalizedDirectories, allFiles.length, 'pending']
    );
    
    const job = result.rows[0];
    
    // Create job items for tracking
    if (allFiles.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);
        const values = batch.map(path => `('${jobId}', '${path.replace(/'/g, "''")}')`).join(',');
        
        await pool.query(
          `INSERT INTO cache_job_items (job_id, file_path) VALUES ${values}`
        );
      }
    }
    
    console.log(`[${new Date().toISOString()}] Job created: ${job.id} with ${job.total_files} files`);
    
    res.status(201).json({
      success: true,
      jobId: job.id,
      status: job.status,
      totalFiles: job.total_files,
      message: 'Cache job created successfully',
      createdAt: job.created_at
    });
    
  } catch (error) {
    console.error('Error creating cache job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create cache job',
      details: error.message
    });
  }
});

// Get job status endpoint
app.get('/api/v1/cache/jobs/:id', authenticateApiKey, async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid job ID format'
      });
    }
    
    // Get job details
    const jobResult = await pool.query(
      'SELECT * FROM cache_jobs WHERE id = $1',
      [jobId]
    );
    
    if (jobResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    const job = jobResult.rows[0];
    
    // Get job progress
    const progressResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
       FROM cache_job_items 
       WHERE job_id = $1`,
      [jobId]
    );
    
    const progress = progressResult.rows[0];
    
    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        totalFiles: job.total_files,
        progress: {
          completed: parseInt(progress.completed) || 0,
          failed: parseInt(progress.failed) || 0,
          total: parseInt(progress.total) || 0,
          percentage: progress.total > 0 
            ? Math.round((progress.completed / progress.total) * 100) 
            : 0
        },
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        error: job.error_message
      }
    });
    
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      details: error.message
    });
  }
});

// List recent jobs endpoint
app.get('/api/v1/cache/jobs', authenticateApiKey, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status;
    
    let query = 'SELECT * FROM cache_jobs';
    const params = [];
    
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      jobs: result.rows.map(job => ({
        id: job.id,
        status: job.status,
        totalFiles: job.total_files,
        createdAt: job.created_at,
        completedAt: job.completed_at
      })),
      pagination: {
        limit,
        offset,
        total: result.rowCount
      }
    });
    
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list jobs',
      details: error.message
    });
  }
});

// Cancel job endpoint
app.delete('/api/v1/cache/jobs/:id', authenticateApiKey, async (req, res) => {
  try {
    const jobId = req.params.id;
    
    // Update job status to cancelled
    const result = await pool.query(
      `UPDATE cache_jobs 
       SET status = 'cancelled', completed_at = NOW() 
       WHERE id = $1 AND status IN ('pending', 'running')
       RETURNING *`,
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found or cannot be cancelled'
      });
    }
    
    res.json({
      success: true,
      message: 'Job cancelled successfully',
      job: {
        id: result.rows[0].id,
        status: result.rows[0].status
      }
    });
    
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel job',
      details: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database: ${process.env.DB_HOST || 'postgres'}:${process.env.DB_PORT || 5432}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api/v1`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing connections...');
  await pool.end();
  process.exit(0);
});