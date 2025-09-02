const fetch = require('node-fetch');
const { FileModel } = require('../database');
const { execSync } = require('child_process');

class DirectLinkService {
  constructor() {
    // Multi-filespace configuration
    this.filespaces = [
      {
        mountPoint: (process.env.LUCIDLINK_MOUNT_POINT_1 || '/media/lucidlink-1').replace(/\/$/, ''),
        instance: process.env.LUCIDLINK_INSTANCE_1 || '2001',
        apiPort: process.env.LUCIDLINK_API_PORT_1 || null
      },
      {
        mountPoint: (process.env.LUCIDLINK_MOUNT_POINT_2 || '/media/lucidlink-2').replace(/\/$/, ''),
        instance: process.env.LUCIDLINK_INSTANCE_2 || '2002', 
        apiPort: process.env.LUCIDLINK_API_PORT_2 || null
      }
    ];
    
    // In production, LucidLink daemon runs inside the backend container
    // In development, it runs on the host (use LUCIDLINK_API_HOST)
    this.apiHost = process.env.NODE_ENV === 'production' ? '127.0.0.1' : (process.env.LUCIDLINK_API_HOST || 'host.docker.internal');
    this.lucidCommand = process.env.LUCIDLINK_COMMAND || '/usr/local/bin/lucid';
    
    // Initialize ports for all filespaces
    this.initializePorts();
  }
  
  /**
   * Initialize LucidLink REST API ports for all filespaces
   */
  initializePorts() {
    for (const filespace of this.filespaces) {
      try {
        // Try to get port from lucid list first (most accurate)
        try {
          const command = `${this.lucidCommand} --instance ${filespace.instance} list`;
          const output = execSync(command, { encoding: 'utf8' });
          
          // Parse the output to find the REST port
          // Example output: "2001               production.dmpfs        9779        live"
          // Format: INSTANCE_ID       FILESPACE               PORT        MODE
          const lines = output.split('\n');
          for (const line of lines) {
            if (line.trim().startsWith(filespace.instance.toString())) {
              const columns = line.trim().split(/\s+/);
              if (columns.length >= 3 && /^\d+$/.test(columns[2])) {
                filespace.port = parseInt(columns[2]);
                console.log(`Detected port from lucid list for instance ${filespace.instance}: ${filespace.port}`);
                break;
              }
            }
          }
        } catch (cmdError) {
          console.warn(`Could not detect port from lucid list for instance ${filespace.instance}:`, cmdError.message);
        }
        
        // Fall back to environment variable if detection failed
        if (!filespace.port && filespace.apiPort) {
          filespace.port = parseInt(filespace.apiPort);
          console.log(`Using configured port for instance ${filespace.instance}: ${filespace.port}`);
        }
        
        // Fallback to default ports based on instance
        if (!filespace.port) {
          if (filespace.instance === '2001') {
            filespace.port = process.env.NODE_ENV === 'production' ? 20010 : 9780;
          } else if (filespace.instance === '2002') {
            filespace.port = process.env.NODE_ENV === 'production' ? 20011 : 9781;
          } else {
            filespace.port = process.env.NODE_ENV === 'production' ? 20010 : 9780;
          }
          console.log(`Using default port for instance ${filespace.instance}: ${filespace.port}`);
        }
        
      } catch (error) {
        console.error(`Error initializing port for instance ${filespace.instance}:`, error.message);
        filespace.port = process.env.NODE_ENV === 'production' ? 20010 : 9780;
      }
    }
  }

  /**
   * URL encode a path with proper handling for file paths
   * @param {string} path - The path to encode
   * @returns {string} - URL encoded path
   */
  urlEncodePath(path) {
    // Keep path separators and common filename characters
    const safeChars = "/[](),-_ .";
    return encodeURIComponent(path).replace(/%2F/g, '/');
  }

  /**
   * Determine which filespace a file belongs to
   * @param {string} filePath - Full file path  
   * @returns {object|null} - Filespace configuration or null if not found
   */
  getFilespaceForPath(filePath) {
    // Find the filespace with the longest matching mount point
    let bestMatch = null;
    let longestMatch = 0;
    
    for (const filespace of this.filespaces) {
      if (filePath.startsWith(filespace.mountPoint)) {
        const matchLength = filespace.mountPoint.length;
        if (matchLength > longestMatch) {
          longestMatch = matchLength;
          bestMatch = filespace;
        }
      }
    }
    
    return bestMatch;
  }

  /**
   * Convert absolute path to relative path by stripping mount point
   * @param {string} absolutePath - Full file path
   * @param {object} filespace - Filespace configuration
   * @returns {string} - Relative path from mount point
   */
  getRelativePath(absolutePath, filespace) {
    if (absolutePath.startsWith(filespace.mountPoint)) {
      return absolutePath.slice(filespace.mountPoint.length).replace(/^\/+/, '');
    }
    return absolutePath.replace(/^\/+/, '');
  }

  /**
   * Generate direct link for a file
   * @param {string} filePath - Full path to the file
   * @returns {Promise<string|null>} - Direct link URL or null if failed
   */
  async generateDirectLink(filePath) {
    try {
      // Determine which filespace this file belongs to
      const filespace = this.getFilespaceForPath(filePath);
      if (!filespace) {
        console.error(`No filespace found for path: ${filePath}`);
        return null;
      }
      
      // Ensure port is initialized for this filespace
      if (!filespace.port) {
        console.error(`No port configured for filespace instance ${filespace.instance}`);
        return null;
      }
      
      // Check if we already have a cached direct link
      const existingFile = await FileModel.findByPath(filePath);
      if (existingFile && existingFile.direct_link && existingFile.direct_link_created_at) {
        // Return cached link if it's less than 24 hours old
        const ageInHours = (Date.now() - new Date(existingFile.direct_link_created_at).getTime()) / (1000 * 60 * 60);
        if (ageInHours < 24) {
          console.log(`Using cached direct link for ${filePath}`);
          return existingFile.direct_link;
        }
      }

      // Generate new direct link
      const relativePath = this.getRelativePath(filePath, filespace);
      const encodedPath = this.urlEncodePath(relativePath);
      const apiUrl = `http://${this.apiHost}:${filespace.port}/fsEntry/direct-link?path=${encodedPath}`;

      console.log(`Generating direct link for: ${filePath}`);
      console.log(`Filespace: ${filespace.mountPoint} (instance ${filespace.instance})`);
      console.log(`Relative path: ${relativePath}`);
      console.log(`API URL: ${apiUrl}`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SiteCache-Browser/1.0'
        },
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        console.error(`LucidLink API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      
      if (!data.result) {
        console.error('No result field in LucidLink API response:', data);
        return null;
      }

      const directLink = data.result;
      console.log(`Generated direct link for ${filePath}: ${directLink}`);

      // Store the direct link in database
      await this.storeDirectLink(filePath, directLink);

      return directLink;

    } catch (error) {
      console.error(`Error generating direct link for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Store direct link in database
   * @param {string} filePath - File path
   * @param {string} directLink - Generated direct link
   */
  async storeDirectLink(filePath, directLink) {
    try {
      const { pool } = require('../database');
      await pool.query(
        `UPDATE files 
         SET direct_link = $1, direct_link_created_at = NOW() 
         WHERE path = $2`,
        [directLink, filePath]
      );
      console.log(`Stored direct link for ${filePath}`);
    } catch (error) {
      console.error(`Error storing direct link for ${filePath}:`, error);
    }
  }

  /**
   * Get cached direct link from database
   * @param {string} filePath - File path
   * @returns {Promise<string|null>} - Cached direct link or null
   */
  async getCachedDirectLink(filePath) {
    try {
      const file = await FileModel.findByPath(filePath);
      return file?.direct_link || null;
    } catch (error) {
      console.error(`Error getting cached direct link for ${filePath}:`, error);
      return null;
    }
  }
}

module.exports = DirectLinkService;