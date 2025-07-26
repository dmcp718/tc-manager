const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * RUI (Remote Upload Indicator) API Client
 * 
 * Handles communication with LucidLink's RUI API to check if files
 * are currently being uploaded by remote clients.
 */
class RUIClient {
  constructor() {
    this.filespace = process.env.LUCIDLINK_FILESPACE;
    this.mountPoint = process.env.LUCIDLINK_MOUNT_POINT || '/media/lucidlink-1';
    this.lucidCommand = process.env.LUCIDLINK_COMMAND || '/usr/local/bin/lucid';
    this.apiPort = null;
    this.lastPortCheck = 0;
    this.portCheckInterval = 300000; // 5 minutes
    
    console.log(`RUI Client initialized for filespace: ${this.filespace}`);
  }

  /**
   * Discover LucidLink API port dynamically
   */
  async discoverPort() {
    const now = Date.now();
    
    // Cache port for 5 minutes to avoid frequent `lucid list` calls
    if (this.apiPort && (now - this.lastPortCheck) < this.portCheckInterval) {
      console.log(`Using cached LucidLink API port: ${this.apiPort}`);
      return this.apiPort;
    }

    try {
      console.log('Discovering LucidLink API port...');
      console.log(`NODE_ENV: ${process.env.NODE_ENV}, LUCIDLINK_API_PORT: ${process.env.LUCIDLINK_API_PORT}`);
      
      // In container environment, use container's LucidLink daemon port
      // First try to discover the actual port using lucid list
      const isContainerEnv = process.env.NODE_ENV === 'development';
      if (isContainerEnv) {
        try {
          // Try to discover the actual port using lucid list
          const { stdout } = await execAsync(`${this.lucidCommand} list`);
          const lines = stdout.trim().split('\n');
          
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3 && parts[1] === this.filespace) {
              this.apiPort = parts[2];
              this.lastPortCheck = now;
              console.log(`Container mode: Discovered LucidLink API port: ${this.apiPort} for filespace: ${this.filespace}`);
              return this.apiPort;
            }
          }
        } catch (error) {
          console.warn('Failed to discover port via lucid list:', error.message);
        }
        
        // Fallback to configured port
        const containerPort = process.env.LUCIDLINK_API_PORT || '9780';
        this.apiPort = containerPort;
        this.lastPortCheck = now;
        console.log(`Container mode: Using fallback LucidLink API port: ${this.apiPort} for filespace: ${this.filespace}`);
        return this.apiPort;
      }
      
      const { stdout } = await execAsync(`${this.lucidCommand} list`);
      
      // Parse output to find port for filespace
      // Expected format: "2002    production.dmpfs    9780    live"
      const lines = stdout.trim().split('\n');
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[1] === this.filespace) {
          this.apiPort = parts[2];
          this.lastPortCheck = now;
          console.log(`Found LucidLink API port: ${this.apiPort} for filespace: ${this.filespace}`);
          return this.apiPort;
        }
      }
      
      throw new Error(`No port found for filespace: ${this.filespace}`);
    } catch (error) {
      console.error('Failed to discover LucidLink API port:', error.message);
      throw new Error(`LucidLink port discovery failed: ${error.message}`);
    }
  }

  /**
   * Convert filesystem path to LucidLink API path
   * /media/lucidlink-1/00_Media/file.wav -> /00_Media/file.wav
   */
  convertToLucidPath(filePath) {
    if (!filePath.startsWith(this.mountPoint)) {
      throw new Error(`File path ${filePath} is not within mount point ${this.mountPoint}`);
    }
    
    // Remove mount point prefix
    const lucidPath = filePath.substring(this.mountPoint.length);
    
    // Ensure path starts with /
    return lucidPath.startsWith('/') ? lucidPath : `/${lucidPath}`;
  }

  /**
   * Check RUI status for a single file
   */
  async checkFileStatus(filePath) {
    try {
      const port = await this.discoverPort();
      const lucidPath = this.convertToLucidPath(filePath);
      
      // Use 127.0.0.1 to force IPv4 and avoid IPv6 connection issues
      const apiHost = '127.0.0.1';
      const url = `http://${apiHost}:${port}/v1/${this.filespace}/files`;
      const params = { path: lucidPath };
      
      console.log(`Checking RUI status for: ${filePath} -> ${lucidPath}`);
      
      const response = await axios.get(url, { 
        params,
        timeout: 10000 // 10 second timeout
      });
      
      if (!response.data || !response.data.files || response.data.files.length === 0) {
        throw new Error(`No file data returned for path: ${lucidPath}`);
      }
      
      const fileData = response.data.files[0];
      const isUploading = fileData.remoteUpload === 'yes';
      
      return {
        path: filePath,
        lucidPath: lucidPath,
        lucidId: fileData.id,
        isUploading: isUploading,
        remoteUpload: fileData.remoteUpload,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error(`RUI check failed for ${filePath}:`, error.message);
      
      // Return error status but don't throw - allows batch processing to continue
      return {
        path: filePath,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Check RUI status for multiple files in batch
   * Note: LucidLink API appears to handle single file queries, so we'll
   * process in parallel batches for efficiency
   */
  async checkBatchStatus(filePaths, batchSize = 10) {
    const results = [];
    
    console.log(`Checking RUI status for ${filePaths.length} files in batches of ${batchSize}`);
    
    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(filePath => this.checkFileStatus(filePath));
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Extract successful results and log failures
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`Batch check failed for ${batch[j]}:`, result.reason);
          results.push({
            path: batch[j],
            error: result.reason.message,
            timestamp: new Date()
          });
        }
      }
      
      // Small delay between batches to be respectful to the API
      if (i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`RUI batch check completed: ${results.length} files processed`);
    return results;
  }

  /**
   * Test API connectivity
   */
  async testConnection() {
    try {
      const port = await this.discoverPort();
      // Use 127.0.0.1 to force IPv4 and avoid IPv6 connection issues
      const apiHost = '127.0.0.1';
      const baseUrl = `http://${apiHost}:${port}/v1/${this.filespace}`;
      
      // Test with a simple GET to the base endpoint to verify API is responding
      // We expect this to return some response (even if it's an error about missing params)
      // as long as the LucidLink API service is running
      const response = await axios.get(baseUrl, { 
        timeout: 5000,
        validateStatus: function (status) {
          // Accept any response as long as we get a response from the API
          return status < 500; // Accept 2xx, 3xx, 4xx but not 5xx
        }
      });
      
      console.log(`RUI API connection test successful - API responding on port ${port}`);
      return {
        success: true,
        port: port,
        filespace: this.filespace,
        response: response.status
      };
      
    } catch (error) {
      console.error('RUI API connection test failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get API status and configuration
   */
  getStatus() {
    return {
      filespace: this.filespace,
      mountPoint: this.mountPoint,
      apiPort: this.apiPort,
      lastPortCheck: this.lastPortCheck,
      enabled: process.env.ENABLE_RUI === 'true'
    };
  }
}

module.exports = RUIClient;