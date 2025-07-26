const fetch = require('node-fetch');
const { FileModel } = require('../database');

class DirectLinkService {
  constructor() {
    // LucidLink daemon runs on port 7778 for RESTful service
    this.port = process.env.LUCIDLINK_FS_1_PORT || 7778;
    this.mountPoint = (process.env.INDEX_ROOT_PATH || '/media/lucidlink-1').replace(/\/$/, '');
    // Since LucidLink daemon runs in the same container, use localhost
    this.apiHost = '127.0.0.1';
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
   * Convert absolute path to relative path by stripping mount point
   * @param {string} absolutePath - Full file path
   * @returns {string} - Relative path from mount point
   */
  getRelativePath(absolutePath) {
    if (absolutePath.startsWith(this.mountPoint)) {
      return absolutePath.slice(this.mountPoint.length).replace(/^\/+/, '');
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
      const relativePath = this.getRelativePath(filePath);
      const encodedPath = this.urlEncodePath(relativePath);
      const apiUrl = `http://${this.apiHost}:${this.port}/fsEntry/direct-link?path=${encodedPath}`;

      console.log(`Generating direct link for: ${filePath}`);
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