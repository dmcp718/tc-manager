// Performance monitoring for TeamCache Manager v1.8.0
const os = require('os');
const { performance } = require('perf_hooks');
const logger = require('./logger');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requests: new Map(),
      database: new Map(),
      cache: new Map(),
      system: {},
    };
    
    this.intervals = new Map();
    this.isRunning = false;
  }
  
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // System metrics collection (every 60s)
    this.intervals.set('system', setInterval(() => {
      this.collectSystemMetrics();
    }, 60000));
    
    // Request metrics aggregation (every 5m)
    this.intervals.set('requests', setInterval(() => {
      this.aggregateRequestMetrics();
    }, 300000));
    
    // Database metrics aggregation (every 5m)
    this.intervals.set('database', setInterval(() => {
      this.aggregateDatabaseMetrics();
    }, 300000));
    
    logger.info('Performance monitoring started');
  }
  
  stop() {
    this.isRunning = false;
    
    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    
    logger.info('Performance monitoring stopped');
  }
  
  // Track HTTP request performance
  trackRequest(method, path, duration, statusCode) {
    const key = `${method}:${path}`;
    
    if (!this.metrics.requests.has(key)) {
      this.metrics.requests.set(key, {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errors: 0,
      });
    }
    
    const metric = this.metrics.requests.get(key);
    metric.count++;
    metric.totalDuration += duration;
    metric.minDuration = Math.min(metric.minDuration, duration);
    metric.maxDuration = Math.max(metric.maxDuration, duration);
    
    if (statusCode >= 400) {
      metric.errors++;
    }
  }
  
  // Track database query performance
  trackDatabaseQuery(query, duration, error = false) {
    const queryType = this.getQueryType(query);
    
    if (!this.metrics.database.has(queryType)) {
      this.metrics.database.set(queryType, {
        count: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        errors: 0,
      });
    }
    
    const metric = this.metrics.database.get(queryType);
    metric.count++;
    metric.totalDuration += duration;
    metric.minDuration = Math.min(metric.minDuration, duration);
    metric.maxDuration = Math.max(metric.maxDuration, duration);
    
    if (error) {
      metric.errors++;
    }
  }
  
  // Track cache operations
  trackCacheOperation(operation, duration, hit = true) {
    if (!this.metrics.cache.has(operation)) {
      this.metrics.cache.set(operation, {
        count: 0,
        hits: 0,
        misses: 0,
        totalDuration: 0,
        avgDuration: 0,
      });
    }
    
    const metric = this.metrics.cache.get(operation);
    metric.count++;
    metric.totalDuration += duration;
    metric.avgDuration = metric.totalDuration / metric.count;
    
    if (hit) {
      metric.hits++;
    } else {
      metric.misses++;
    }
  }
  
  // Collect system metrics
  collectSystemMetrics() {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const loadAverage = os.loadavg();
    
    // Calculate CPU usage
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;
    
    this.metrics.system = {
      timestamp: new Date().toISOString(),
      cpu: {
        usage: cpuUsage.toFixed(2),
        cores: cpus.length,
        loadAverage: {
          '1m': loadAverage[0].toFixed(2),
          '5m': loadAverage[1].toFixed(2),
          '15m': loadAverage[2].toFixed(2),
        },
      },
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: totalMemory - freeMemory,
        usagePercent: ((totalMemory - freeMemory) / totalMemory * 100).toFixed(2),
      },
      process: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        pid: process.pid,
      },
    };
    
    // Log if memory usage is high
    if (this.metrics.system.memory.usagePercent > 80) {
      logger.warn('High memory usage detected', this.metrics.system.memory);
    }
  }
  
  // Aggregate and log request metrics
  aggregateRequestMetrics() {
    const aggregated = {};
    
    this.metrics.requests.forEach((metric, key) => {
      if (metric.count > 0) {
        aggregated[key] = {
          count: metric.count,
          avgDuration: (metric.totalDuration / metric.count).toFixed(2),
          minDuration: metric.minDuration.toFixed(2),
          maxDuration: metric.maxDuration.toFixed(2),
          errorRate: ((metric.errors / metric.count) * 100).toFixed(2),
        };
      }
    });
    
    if (Object.keys(aggregated).length > 0) {
      logger.info('Request metrics', {
        event: 'performance_requests',
        metrics: aggregated,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Reset metrics
    this.metrics.requests.clear();
  }
  
  // Aggregate and log database metrics
  aggregateDatabaseMetrics() {
    const aggregated = {};
    
    this.metrics.database.forEach((metric, queryType) => {
      if (metric.count > 0) {
        aggregated[queryType] = {
          count: metric.count,
          avgDuration: (metric.totalDuration / metric.count).toFixed(2),
          minDuration: metric.minDuration.toFixed(2),
          maxDuration: metric.maxDuration.toFixed(2),
          errorRate: ((metric.errors / metric.count) * 100).toFixed(2),
        };
      }
    });
    
    if (Object.keys(aggregated).length > 0) {
      logger.info('Database metrics', {
        event: 'performance_database',
        metrics: aggregated,
        timestamp: new Date().toISOString(),
      });
    }
    
    // Reset metrics
    this.metrics.database.clear();
  }
  
  // Express middleware for request tracking
  middleware() {
    return (req, res, next) => {
      const start = performance.now();
      
      // Override res.end to capture response
      const originalEnd = res.end;
      res.end = (...args) => {
        const duration = performance.now() - start;
        this.trackRequest(req.method, req.path, duration, res.statusCode);
        originalEnd.apply(res, args);
      };
      
      next();
    };
  }
  
  // Helper to determine query type
  getQueryType(query) {
    const normalized = query.toLowerCase().trim();
    
    if (normalized.startsWith('select')) return 'SELECT';
    if (normalized.startsWith('insert')) return 'INSERT';
    if (normalized.startsWith('update')) return 'UPDATE';
    if (normalized.startsWith('delete')) return 'DELETE';
    if (normalized.startsWith('create')) return 'CREATE';
    if (normalized.startsWith('drop')) return 'DROP';
    if (normalized.startsWith('alter')) return 'ALTER';
    
    return 'OTHER';
  }
  
  // Get current metrics snapshot
  getMetrics() {
    return {
      system: this.metrics.system,
      requests: Array.from(this.metrics.requests.entries()).map(([key, value]) => ({
        endpoint: key,
        ...value,
        avgDuration: value.count > 0 ? value.totalDuration / value.count : 0,
      })),
      database: Array.from(this.metrics.database.entries()).map(([key, value]) => ({
        queryType: key,
        ...value,
        avgDuration: value.count > 0 ? value.totalDuration / value.count : 0,
      })),
      cache: Array.from(this.metrics.cache.entries()).map(([key, value]) => ({
        operation: key,
        ...value,
        hitRate: value.count > 0 ? (value.hits / value.count * 100).toFixed(2) : 0,
      })),
    };
  }
}

// Singleton instance
const monitor = new PerformanceMonitor();

module.exports = monitor;