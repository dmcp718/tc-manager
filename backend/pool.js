const { Pool } = require('pg');
require('dotenv').config();

// Calculate optimal pool size based on worker configuration
const workerCount = parseInt(process.env.CACHE_WORKER_COUNT) || 2;
const maxConcurrentFiles = parseInt(process.env.MAX_CONCURRENT_FILES) || 3;
const baseConnections = 20; // Base connections for API, WebSocket, etc.
const workerConnections = workerCount * maxConcurrentFiles * 2; // 2 connections per file operation
const totalConnections = Math.min(baseConnections + workerConnections, 200); // PostgreSQL default max

console.log(`Database pool configuration: ${totalConnections} connections (${workerCount} workers × ${maxConcurrentFiles} files × 2 + ${baseConnections} base)`);

// Database connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.POSTGRES_DB || process.env.DB_NAME || 'teamcache_db',
  user: process.env.POSTGRES_USER || process.env.DB_USER || 'teamcache_user',
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD || '',
  max: totalConnections,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Increased timeout
  // Connection pool optimization
  statement_timeout: 30000, // 30 second statement timeout
  query_timeout: 30000,
  allowExitOnIdle: true,
});

// Database connection test
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
});

module.exports = { pool };