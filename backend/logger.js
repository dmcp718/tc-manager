const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.level = process.env.LOG_LEVEL || options.level || 'info';
    this.format = process.env.LOG_FORMAT || options.format || 'text';
    this.logDir = process.env.LOG_DIR || options.logDir || './logs';
    this.enableConsole = process.env.LOG_CONSOLE !== 'false';
    this.enableFile = process.env.LOG_FILE !== 'false';
    
    // Log levels with numeric values for comparison
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    // Ensure log directory exists
    if (this.enableFile && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    
    if (this.format === 'json') {
      return JSON.stringify({
        timestamp,
        level: level.toUpperCase(),
        message,
        pid: process.pid,
        ...meta
      });
    } else {
      // Text format
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level.toUpperCase()}] [PID:${process.pid}] ${message}${metaStr}`;
    }
  }

  writeToFile(level, formattedMessage) {
    if (!this.enableFile) return;
    
    try {
      const logFile = path.join(this.logDir, `sitecache-${level}.log`);
      const allLogsFile = path.join(this.logDir, 'sitecache-all.log');
      
      // Write to level-specific file
      fs.appendFileSync(logFile, formattedMessage + '\n');
      
      // Write to combined log file
      fs.appendFileSync(allLogsFile, formattedMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;
    
    const formattedMessage = this.formatMessage(level, message, meta);
    
    // Write to console
    if (this.enableConsole) {
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](formattedMessage);
    }
    
    // Write to file
    this.writeToFile(level, formattedMessage);
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  // Create child logger with additional context
  child(context = {}) {
    const childLogger = new Logger({
      level: this.level,
      format: this.format,
      logDir: this.logDir
    });
    
    childLogger.defaultMeta = { ...this.defaultMeta, ...context };
    
    // Override log method to include default meta
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level, message, meta = {}) => {
      originalLog(level, message, { ...childLogger.defaultMeta, ...meta });
    };
    
    return childLogger;
  }

  // Log rotation helper
  rotateLogs() {
    if (!this.enableFile) return;
    
    try {
      const logFiles = fs.readdirSync(this.logDir)
        .filter(file => file.startsWith('sitecache-') && file.endsWith('.log'));
      
      logFiles.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        const maxSize = 100 * 1024 * 1024; // 100MB
        
        if (stats.size > maxSize) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const archiveName = file.replace('.log', `-${timestamp}.log`);
          const archivePath = path.join(this.logDir, archiveName);
          
          fs.renameSync(filePath, archivePath);
          this.info('Log file rotated', { 
            original: file, 
            archive: archiveName,
            size: stats.size 
          });
        }
      });
    } catch (error) {
      this.error('Failed to rotate logs', { error: error.message });
    }
  }
}

// Create singleton logger instance
const logger = new Logger();

// Set up log rotation interval (every hour)
if (process.env.LOG_ROTATION !== 'false') {
  setInterval(() => {
    logger.rotateLogs();
  }, 60 * 60 * 1000); // 1 hour
}

module.exports = logger;