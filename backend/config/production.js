// Production configuration for TeamCache Manager v1.8.0
// Performance and security optimized settings

module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3001,
    wsPort: process.env.WEBSOCKET_PORT || 3002,
    host: '0.0.0.0',
    trustProxy: true,
    
    // Request limits
    requestTimeout: 300000, // 5 minutes for large operations
    keepAliveTimeout: 65000,
    headersTimeout: 70000,
    
    // Body parser limits
    bodyLimit: '50mb',
    parameterLimit: 10000,
  },
  
  // Database configuration
  database: {
    // Connection pool settings optimized for production
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    min: parseInt(process.env.DB_POOL_MIN || '5'),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    
    // Query optimization
    statement_timeout: 300000, // 5 minutes
    query_timeout: 300000,
    
    // Connection retry
    retries: 3,
    retryDelay: 1000,
  },
  
  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    
    // Connection pool
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    connectTimeout: 10000,
    
    // Performance settings
    enableReadyCheck: true,
    lazyConnect: true,
  },
  
  // Elasticsearch configuration
  elasticsearch: {
    node: `http://${process.env.ELASTICSEARCH_HOST || 'elasticsearch'}:${process.env.ELASTICSEARCH_PORT || '9200'}`,
    
    // Connection pool
    maxRetries: 3,
    requestTimeout: 30000,
    sniffOnStart: false,
    sniffInterval: false,
    
    // Performance settings
    compression: 'gzip',
    resurrectStrategy: 'optimistic',
    
    // Bulk operation settings
    bulkSize: 1000,
    bulkFlushInterval: 5000,
  },
  
  // Cache worker configuration
  cacheWorker: {
    count: parseInt(process.env.CACHE_WORKER_COUNT || '4'),
    maxConcurrentFiles: parseInt(process.env.MAX_CONCURRENT_FILES || '5'),
    pollInterval: parseInt(process.env.WORKER_POLL_INTERVAL || '2000'),
    
    // Memory management
    maxMemoryPerWorker: 512 * 1024 * 1024, // 512MB
    gcInterval: 60000, // Run GC every minute
    
    // Retry configuration
    maxRetries: 3,
    retryDelay: 5000,
    backoffMultiplier: 2,
  },
  
  // File indexing configuration
  indexing: {
    batchSize: 1000,
    maxConcurrentScans: 4,
    scanInterval: 100, // ms between directory scans
    
    // Memory optimization
    streamHighWaterMark: 16384,
    maxPathLength: 4096,
    
    // Performance flags
    useNativeRecursion: true,
    skipHiddenFiles: true,
    followSymlinks: false,
  },
  
  // Media preview configuration
  mediaPreview: {
    // Cache settings
    cacheEnabled: true,
    cacheTTL: 604800, // 7 days
    maxCacheSize: 10 * 1024 * 1024 * 1024, // 10GB
    
    // Transcoding limits
    maxConcurrentTranscodes: 4,
    transcodeTimeout: 600000, // 10 minutes
    
    // Quality settings
    videoQuality: process.env.TRANSCODE_VIDEO_QUALITY || 'medium',
    thumbnailSize: 320,
    previewDuration: 10, // seconds
  },
  
  // WebSocket configuration
  websocket: {
    // Connection settings
    pingInterval: 30000,
    pingTimeout: 60000,
    
    // Performance
    perMessageDeflate: {
      zlibDeflateOptions: {
        level: 3,
      },
      threshold: 1024,
    },
    
    // Limits
    maxPayload: 1048576, // 1MB
    maxConnections: 1000,
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    
    // File rotation
    maxFiles: 10,
    maxSize: '100m',
    
    // Performance
    bufferSize: 8192,
    flushInterval: 5000,
  },
  
  // Security configuration
  security: {
    // Rate limiting
    rateLimit: {
      windowMs: 60000, // 1 minute
      max: 100, // requests per window
      standardHeaders: true,
      legacyHeaders: false,
    },
    
    // CORS
    cors: {
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
      maxAge: 86400,
    },
    
    // Session
    session: {
      secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 86400000, // 24 hours
        sameSite: 'strict',
      },
    },
  },
  
  // Performance monitoring
  monitoring: {
    enabled: process.env.ENABLE_MONITORING !== 'false',
    
    // Metrics collection
    metricsInterval: 60000, // 1 minute
    
    // Health check
    healthCheck: {
      interval: 30000,
      timeout: 5000,
      unhealthyThreshold: 3,
    },
  },
  
  // Cleanup and maintenance
  maintenance: {
    // Old file cleanup
    cleanupInterval: 86400000, // 24 hours
    maxFileAge: 2592000000, // 30 days
    
    // Database maintenance
    vacuumInterval: 604800000, // 7 days
    analyzeInterval: 86400000, // 24 hours
    
    // Cache cleanup
    cacheCleanupInterval: 3600000, // 1 hour
    maxCacheAge: 604800000, // 7 days
  },
};