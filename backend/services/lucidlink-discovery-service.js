const { execSync } = require('child_process');

/**
 * LucidLink Discovery Service
 * 
 * Handles detection and mapping of LucidLink filespaces to instance IDs,
 * mount points, and human-readable names. Provides centralized filespace
 * information for the entire application.
 */
class LucidLinkDiscoveryService {
  constructor() {
    this.lucidCommand = process.env.LUCIDLINK_COMMAND || '/usr/local/bin/lucid';
    this.filespaceCache = new Map();
    this.lastDiscovery = 0;
    this.discoveryInterval = 300000; // 5 minutes cache
    
    // Initialize filespace configuration from environment
    this.filespaceConfigs = [
      {
        instanceId: process.env.LUCIDLINK_INSTANCE_1 || '2001',
        mountPoint: (process.env.LUCIDLINK_MOUNT_POINT_1 || '/media/lucidlink-1').replace(/\/$/, ''),
        envFilespace: process.env.LUCIDLINK_FILESPACE_1,
        displayName: null // Will be discovered from lucid list
      },
      {
        instanceId: process.env.LUCIDLINK_INSTANCE_2 || '2002',
        mountPoint: (process.env.LUCIDLINK_MOUNT_POINT_2 || '/media/lucidlink-2').replace(/\/$/, ''),
        envFilespace: process.env.LUCIDLINK_FILESPACE_2,
        displayName: null // Will be discovered from lucid list
      }
    ];
    
    console.log('LucidLink Discovery Service initialized with configurations:', 
      this.filespaceConfigs.map(config => ({ 
        instance: config.instanceId, 
        mountPoint: config.mountPoint,
        envFilespace: config.envFilespace 
      }))
    );
  }

  /**
   * Discover all active LucidLink filespaces
   * @returns {Promise<Array>} Array of filespace information
   */
  async discoverFilespaces() {
    const now = Date.now();
    
    // Return cached results if recent
    if (this.filespaceCache.size > 0 && (now - this.lastDiscovery) < this.discoveryInterval) {
      return Array.from(this.filespaceCache.values());
    }

    try {
      console.log('Discovering LucidLink filespaces...');
      const output = execSync(`${this.lucidCommand} list`, { encoding: 'utf8' });
      
      // Parse the output to extract filespace information
      // Example output format:
      // 2001               tc-east-1.dmpfs        9779        live
      // 2002               tc-mngr-demo.dmpfs     9780        live
      const lines = output.split('\n');
      const discoveredFilespaces = [];
      
      for (const line of lines) {
        if (line.trim() && !line.includes('INSTANCE') && !line.includes('---')) {
          const columns = line.trim().split(/\s+/);
          if (columns.length >= 4) {
            const [instanceId, filespace, port, status] = columns;
            
            // Find matching configuration
            const config = this.filespaceConfigs.find(c => c.instanceId === instanceId);
            if (config && status === 'live') {
              const filespaceInfo = {
                instanceId: instanceId,
                filespace: filespace,
                displayName: filespace,
                port: parseInt(port),
                status: status,
                mountPoint: config.mountPoint,
                envFilespace: config.envFilespace,
                isActive: true,
                discoveredAt: new Date()
              };
              
              discoveredFilespaces.push(filespaceInfo);
              this.filespaceCache.set(config.mountPoint, filespaceInfo);
              
              console.log(`Discovered filespace: ${filespace} on ${config.mountPoint}`);
            }
          }
        }
      }
      
      this.lastDiscovery = now;
      console.log(`Discovery completed: Found ${discoveredFilespaces.length} active filespaces`);
      return discoveredFilespaces;
      
    } catch (error) {
      console.error('Error discovering LucidLink filespaces:', error.message);
      return [];
    }
  }

  /**
   * Get technical filespace name (returns the actual filespace name)
   * @param {string} filespace - Technical filespace name (e.g., tc-east-1.dmpfs)
   * @returns {string} Technical filespace name (unchanged)
   */
  getDisplayName(filespace) {
    // Return the actual technical filespace name
    return filespace;
  }

  /**
   * Get filespace information for a given file path
   * @param {string} filePath - Full file path
   * @returns {Promise<object|null>} Filespace information or null
   */
  async getFilespaceForPath(filePath) {
    // Ensure we have fresh filespace data
    await this.discoverFilespaces();
    
    // Find the filespace with the longest matching mount point
    let bestMatch = null;
    let longestMatch = 0;
    
    for (const filespace of this.filespaceCache.values()) {
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
   * Get filespace display name for a file path
   * @param {string} filePath - Full file path
   * @returns {Promise<string>} Display name or 'unknown'
   */
  async getFilespaceDisplayName(filePath) {
    try {
      const filespace = await this.getFilespaceForPath(filePath);
      return filespace ? filespace.displayName : 'unknown';
    } catch (error) {
      console.error(`Error getting filespace display name for ${filePath}:`, error.message);
      return 'unknown';
    }
  }

  /**
   * Get all discovered filespaces
   * @returns {Promise<Array>} All filespace information
   */
  async getAllFilespaces() {
    return await this.discoverFilespaces();
  }

  /**
   * Get filespace by mount point
   * @param {string} mountPoint - Mount point path
   * @returns {Promise<object|null>} Filespace information
   */
  async getFilespaceByMountPoint(mountPoint) {
    await this.discoverFilespaces();
    return this.filespaceCache.get(mountPoint) || null;
  }

  /**
   * Get filespace by instance ID
   * @param {string} instanceId - LucidLink instance ID
   * @returns {Promise<object|null>} Filespace information
   */
  async getFilespaceByInstance(instanceId) {
    await this.discoverFilespaces();
    
    for (const filespace of this.filespaceCache.values()) {
      if (filespace.instanceId === instanceId) {
        return filespace;
      }
    }
    
    return null;
  }

  /**
   * Force refresh of filespace discovery
   * @returns {Promise<Array>} Fresh filespace information
   */
  async refresh() {
    this.filespaceCache.clear();
    this.lastDiscovery = 0;
    return await this.discoverFilespaces();
  }

  /**
   * Get discovery status and cached information
   * @returns {object} Status information
   */
  getStatus() {
    return {
      cacheSize: this.filespaceCache.size,
      lastDiscovery: new Date(this.lastDiscovery),
      configurations: this.filespaceConfigs.length,
      filespaces: Array.from(this.filespaceCache.values()).map(fs => ({
        instanceId: fs.instanceId,
        displayName: fs.displayName,
        mountPoint: fs.mountPoint,
        status: fs.status
      }))
    };
  }
}

// Create singleton instance
const lucidLinkDiscoveryService = new LucidLinkDiscoveryService();

module.exports = lucidLinkDiscoveryService;