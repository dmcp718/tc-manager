const { pool } = require('./pool');
require('dotenv').config();

// Database Models
class FileModel {
  static async findByPath(path) {
    const result = await pool.query(
      'SELECT * FROM files WHERE path = $1',
      [path]
    );
    return result.rows[0];
  }

  static async findChildren(parentPath) {
    const result = await pool.query(
      `SELECT * FROM files 
       WHERE parent_path = $1 
       ORDER BY is_directory DESC, name ASC`,
      [parentPath]
    );
    return result.rows;
  }
  
  static async findSubdirectories(parentPath) {
    // Find all subdirectories recursively under the given path
    const result = await pool.query(`
      WITH RECURSIVE subdirs AS (
        -- Direct children directories
        SELECT path, name, parent_path, is_directory, 1 as depth
        FROM files
        WHERE parent_path = $1 AND is_directory = true
        
        UNION ALL
        
        -- Recursive subdirectories
        SELECT f.path, f.name, f.parent_path, f.is_directory, s.depth + 1
        FROM files f
        INNER JOIN subdirs s ON f.parent_path = s.path
        WHERE f.is_directory = true
      )
      SELECT path, name, parent_path FROM subdirs
      ORDER BY depth DESC, name ASC
    `, [parentPath]);
    
    return result.rows;
  }

  static async findFilesRecursively(directoryPath) {
    // Recursively find all files (not directories) under a given directory
    const result = await pool.query(
      `WITH RECURSIVE file_tree AS (
        -- Base case: the directory itself
        SELECT path, is_directory
        FROM files
        WHERE path = $1
        
        UNION ALL
        
        -- Recursive case: all children
        SELECT f.path, f.is_directory
        FROM files f
        INNER JOIN file_tree ft ON f.parent_path = ft.path
        WHERE ft.is_directory = true
      )
      SELECT path FROM file_tree
      WHERE is_directory = false
      ORDER BY path`,
      [directoryPath]
    );
    return result.rows;
  }

  static async findRoots() {
    const result = await pool.query(
      `SELECT * FROM files 
       WHERE parent_path IS NULL OR parent_path = '/' 
       ORDER BY name ASC`
    );
    return result.rows;
  }

  static async upsert(fileData, sessionId = null) {
    const {
      path,
      name,
      parent_path,
      is_directory,
      size,
      modified_at,
      permissions,
      metadata = {}
    } = fileData;

    // Get filespace information using LucidLink Discovery Service
    let filespace = 'unknown';
    try {
      const lucidLinkDiscoveryService = require('./services/lucidlink-discovery-service');
      filespace = await lucidLinkDiscoveryService.getFilespaceDisplayName(path);
    } catch (error) {
      console.warn(`Failed to detect filespace for ${path}:`, error.message);
    }

    const result = await pool.query(
      `INSERT INTO files (path, name, parent_path, is_directory, size, modified_at, permissions, metadata, last_seen_session_id, filespace)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (path) 
       DO UPDATE SET 
         name = EXCLUDED.name,
         parent_path = EXCLUDED.parent_path,
         is_directory = EXCLUDED.is_directory,
         size = EXCLUDED.size,
         modified_at = EXCLUDED.modified_at,
         permissions = EXCLUDED.permissions,
         metadata = EXCLUDED.metadata,
         last_seen_session_id = EXCLUDED.last_seen_session_id,
         filespace = EXCLUDED.filespace,
         updated_at = NOW()
       RETURNING *`,
      [path, name, parent_path, is_directory, size, modified_at, permissions, JSON.stringify(metadata), sessionId, filespace]
    );
    return result.rows[0];
  }

  static async updateCacheStatus(path, cached, cacheJobId = null) {
    const result = await pool.query(
      `UPDATE files 
       SET cached = $2, cached_at = $3, cache_job_id = $4, updated_at = NOW()
       WHERE path = $1
       RETURNING *`,
      [path, cached, cached ? new Date() : null, cacheJobId]
    );
    return result.rows[0];
  }

  static async batchUpdateCacheStatus(updates) {
    // Batch update cache status for multiple files to reduce database queries
    if (!updates || updates.length === 0) return [];
    
    const values = [];
    const params = [];
    let paramIndex = 1;
    
    updates.forEach((update) => {
      values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
      params.push(update.path, update.cached, update.cached ? new Date() : null, update.cacheJobId);
      paramIndex += 4;
    });
    
    const query = `
      UPDATE files AS f
      SET cached = u.cached::boolean,
          cached_at = u.cached_at::timestamp,
          cache_job_id = u.cache_job_id::uuid,
          updated_at = NOW()
      FROM (VALUES ${values.join(', ')}) AS u(path, cached, cached_at, cache_job_id)
      WHERE f.path = u.path
      RETURNING f.*
    `;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async findCachedFiles(limit = 100, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM cached_files 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  // Validate if all children of a directory are cached
  static async validateDirectoryCacheStatus(dirPath) {
    try {
      const result = await pool.query(`
        WITH RECURSIVE dir_tree AS (
          -- Start with the directory itself
          SELECT path, is_directory, cached, 0 as level
          FROM files
          WHERE path = $1
          
          UNION ALL
          
          -- Recursively get all children
          SELECT f.path, f.is_directory, f.cached, dt.level + 1
          FROM files f
          INNER JOIN dir_tree dt ON f.parent_path = dt.path
          WHERE dt.is_directory = true AND dt.level < 20
        ),
        cache_stats AS (
          SELECT 
            COUNT(*) FILTER (WHERE is_directory = false) as total_files,
            COUNT(*) FILTER (WHERE is_directory = false AND cached = true) as cached_files,
            COUNT(*) FILTER (WHERE is_directory = true AND path != $1) as subdirs,
            COUNT(*) FILTER (WHERE is_directory = true AND path != $1 AND cached = true) as cached_subdirs
          FROM dir_tree
          WHERE level > 0  -- Exclude the root directory from counts
        )
        SELECT 
          total_files,
          cached_files,
          subdirs,
          cached_subdirs,
          (cached_files = total_files AND total_files > 0) as all_files_cached,
          (cached_subdirs = subdirs) as all_subdirs_cached,
          (
            (cached_files = total_files AND cached_subdirs = subdirs AND (total_files > 0 OR subdirs > 0)) OR
            (total_files = 0 AND subdirs = 0)
          ) as should_be_cached
        FROM cache_stats
      `, [dirPath]);
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error validating directory cache status for ${dirPath}:`, error);
      throw error;
    }
  }

  // Update directory cache status based on validation
  static async updateDirectoryCacheIfValid(dirPath, cacheJobId = null) {
    try {
      const validation = await this.validateDirectoryCacheStatus(dirPath);
      
      console.log(`Directory validation for ${dirPath}:`, validation);
      
      if (validation.should_be_cached) {
        await this.updateCacheStatus(dirPath, true, cacheJobId);
        console.log(`Directory validated and marked as cached: ${dirPath}`);
        return true;
      } else {
        await this.updateCacheStatus(dirPath, false, null);
        console.log(`Directory validation failed, marked as not cached: ${dirPath} (${validation.cached_files}/${validation.total_files} files, ${validation.cached_subdirs}/${validation.subdirs} subdirs)`);
        return false;
      }
    } catch (error) {
      console.error(`Error updating directory cache status for ${dirPath}:`, error);
      throw error;
    }
  }

  static async search(query, limit = 100, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM files 
       WHERE to_tsvector('english', path) @@ plainto_tsquery('english', $1)
       OR name ILIKE $2
       ORDER BY is_directory DESC, name ASC
       LIMIT $3 OFFSET $4`,
      [query, `%${query}%`, limit, offset]
    );
    return result.rows;
  }

  // Check if file needs indexing (new or modified)
  static async needsIndexing(filePath, modifiedAt) {
    const result = await pool.query(
      'SELECT modified_at FROM files WHERE path = $1',
      [filePath]
    );
    
    if (result.rows.length === 0) {
      // File doesn't exist in database, needs indexing
      return true;
    }
    
    const dbModifiedAt = new Date(result.rows[0].modified_at);
    const fsModifiedAt = new Date(modifiedAt);
    
    // File needs indexing if filesystem version is newer
    return fsModifiedAt > dbModifiedAt;
  }

  // Batch check for files that need indexing
  static async batchNeedsIndexing(filesData) {
    if (filesData.length === 0) return [];
    
    // Build query to check all files at once - include size for enhanced change detection
    const paths = filesData.map(f => f.path);
    const placeholders = paths.map((_, i) => `$${i + 1}`).join(',');
    
    const result = await pool.query(
      `SELECT path, modified_at, size FROM files WHERE path IN (${placeholders})`,
      paths
    );
    
    // Create a map of existing files with modification time and size
    const existingFiles = new Map(
      result.rows.map(row => [row.path, {
        modified_at: new Date(row.modified_at),
        size: parseInt(row.size) || 0
      }])
    );
    
    // Filter files that need indexing with enhanced change detection
    return filesData.filter(fileData => {
      const existing = existingFiles.get(fileData.path);
      if (!existing) {
        // File doesn't exist, needs indexing
        return true;
      }
      
      // Enhanced change detection: check both modification time AND size with tolerance
      const fsModified = new Date(fileData.modified_at);
      const fsSize = parseInt(fileData.size) || 0;
      
      // Add tolerance for timestamp precision differences (1 second)
      // Filesystem timestamps can have different precision than database timestamps
      const timeDiff = Math.abs(fsModified.getTime() - existing.modified_at.getTime());
      const TIMESTAMP_TOLERANCE_MS = 1000; // 1 second tolerance
      
      // File needs indexing if:
      // 1. Modified time difference exceeds tolerance (indicating real change), OR
      // 2. Size has changed (could indicate content change even with same mtime)
      const timeChanged = timeDiff > TIMESTAMP_TOLERANCE_MS && fsModified > existing.modified_at;
      const sizeChanged = fsSize !== existing.size;
      
      // Log files that are considered changed for debugging
      if (timeChanged || sizeChanged) {
        console.log(`File changed: ${fileData.path} - Time: ${timeChanged ? `${timeDiff}ms diff` : 'same'}, Size: ${sizeChanged ? `${existing.size} -> ${fsSize}` : 'same'}`);
      }
      
      return timeChanged || sizeChanged;
    });
  }

  // Update metadata for a file
  static async updateMetadata(path, metadataUpdate) {
    try {
      // Merge the new metadata with existing metadata
      const result = await pool.query(
        `UPDATE files 
         SET metadata = COALESCE(metadata, '{}') || $2::jsonb,
             updated_at = NOW()
         WHERE path = $1
         RETURNING *`,
        [path, JSON.stringify(metadataUpdate)]
      );
      
      if (result.rows.length === 0) {
        console.warn(`No file found to update metadata for path: ${path}`);
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error updating file metadata:', error);
      throw error;
    }
  }

  // RUI (Remote Upload Indicator) Methods
  static async updateRUIStatus(path, ruiData) {
    try {
      const metadata = {
        rui: {
          status: ruiData.isUploading ? 'uploading' : 'complete',
          lastChecked: ruiData.timestamp,
          lucidId: ruiData.lucidId,
          remoteUpload: ruiData.remoteUpload
        }
      };

      const result = await pool.query(
        `UPDATE files 
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}'),
           '{rui}',
           $2::jsonb
         ),
         updated_at = NOW()
         WHERE path = $1
         RETURNING *`,
        [path, JSON.stringify(metadata.rui)]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error updating RUI status for ${path}:`, error);
      throw error;
    }
  }

  static async getRUIStatus(path) {
    try {
      const result = await pool.query(
        `SELECT metadata->'rui' as rui_data FROM files WHERE path = $1`,
        [path]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0].rui_data;
    } catch (error) {
      console.error(`Error getting RUI status for ${path}:`, error);
      throw error;
    }
  }

  static async findFilesWithRUIStatus(status = 'uploading', limit = 100) {
    try {
      const result = await pool.query(
        `SELECT path, name, size, cached, metadata, metadata->'rui' as rui_data 
         FROM files 
         WHERE metadata->'rui'->>'status' = $1
         AND is_directory = false
         ORDER BY (metadata->'rui'->>'lastChecked')::timestamp DESC
         LIMIT $2`,
        [status, limit]
      );
      
      return result.rows;
    } catch (error) {
      console.error(`Error finding files with RUI status ${status}:`, error);
      throw error;
    }
  }

  static async findAllRegularFiles(limit = 1000, offset = 0) {
    try {
      const result = await pool.query(
        `SELECT path, name, metadata->'rui' as rui_data
         FROM files 
         WHERE is_directory = false
         ORDER BY path ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error finding regular files for RUI scan:', error);
      throw error;
    }
  }

  static async createMinimalRUIEntry(filePath, ruiData) {
    try {
      const fileName = filePath.split('/').pop();
      const parentPath = filePath.substring(0, filePath.lastIndexOf('/'));
      
      await pool.query(
        `INSERT INTO files (path, name, parent_path, is_directory, size, metadata) 
         VALUES ($1, $2, $3, false, 0, $4)
         ON CONFLICT (path) DO UPDATE SET 
         metadata = jsonb_set(COALESCE(files.metadata, '{}'::jsonb), '{rui}', $4::jsonb)`,
        [
          filePath, 
          fileName, 
          parentPath, 
          JSON.stringify({ rui: ruiData })
        ]
      );
      
      console.log(`Created minimal RUI entry for: ${filePath}`);
    } catch (error) {
      console.error(`Error creating minimal RUI entry for ${filePath}:`, error);
      throw error;
    }
  }

  static async getRegularFileCount() {
    try {
      const result = await pool.query(
        'SELECT COUNT(*) as count FROM files WHERE is_directory = false'
      );
      
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Error getting regular file count:', error);
      throw error;
    }
  }

  static async clearStaleRUIStatus(maxAge = 300000) { // Default 5 minutes
    try {
      const cutoffTime = new Date(Date.now() - maxAge);
      
      const result = await pool.query(
        `UPDATE files 
         SET metadata = metadata - 'rui',
         updated_at = NOW()
         WHERE metadata->'rui'->>'status' = 'uploading'
         AND (metadata->'rui'->>'lastChecked')::timestamp < $1
         RETURNING path`,
        [cutoffTime]
      );
      
      console.log(`Cleared stale RUI status for ${result.rows.length} files`);
      return result.rows.map(row => row.path);
    } catch (error) {
      console.error('Error clearing stale RUI status:', error);
      throw error;
    }
  }

  static async getStats() {
    const result = await pool.query('SELECT * FROM get_cache_stats()');
    return result.rows[0];
  }

  // Calculate and cache directory size
  static async updateDirectorySize(dirPath) {
    try {
      const result = await pool.query(
        'SELECT * FROM get_directory_size($1)',
        [dirPath]
      );
      
      const { total_size, file_count, directory_count } = result.rows[0];
      
      // Store computed size in metadata
      const computedSize = {
        size: parseInt(total_size) || 0,
        file_count: parseInt(file_count) || 0,
        directory_count: parseInt(directory_count) || 0,
        calculated_at: new Date()
      };
      
      // Update the directory's metadata
      await pool.query(`
        UPDATE files 
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'),
          '{computed_size}',
          $2::jsonb
        ),
        updated_at = NOW()
        WHERE path = $1 AND is_directory = true
      `, [dirPath, JSON.stringify(computedSize)]);
      
      return computedSize;
    } catch (error) {
      console.error(`Error calculating directory size for ${dirPath}:`, error);
      throw error;
    }
  }

  // Get directory size from cache or calculate if not cached
  static async getDirectorySize(dirPath, maxAge = 3600000) { // Default 1 hour cache
    try {
      const result = await pool.query(
        'SELECT metadata FROM files WHERE path = $1 AND is_directory = true',
        [dirPath]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Directory not found: ${dirPath}`);
      }
      
      const metadata = result.rows[0].metadata || {};
      const computedSize = metadata.computed_size;
      
      // Check if we have cached data and if it's fresh enough
      if (computedSize && computedSize.calculated_at) {
        const calculatedAt = new Date(computedSize.calculated_at);
        const age = Date.now() - calculatedAt.getTime();
        
        if (age < maxAge) {
          return computedSize;
        }
      }
      
      // Calculate fresh size
      return await this.updateDirectorySize(dirPath);
    } catch (error) {
      console.error(`Error getting directory size for ${dirPath}:`, error);
      throw error;
    }
  }

  // Batch update directory sizes
  static async batchUpdateDirectorySizes(dirPaths) {
    const results = {};
    
    for (const dirPath of dirPaths) {
      try {
        results[dirPath] = await this.updateDirectorySize(dirPath);
      } catch (error) {
        console.error(`Failed to update size for ${dirPath}:`, error);
        results[dirPath] = { error: error.message };
      }
    }
    
    return results;
  }

  static async batchUpsert(filesData, sessionId = null) {
    // Always use bulk upsert for maximum speed with large batches
    return await this.bulkUpsert(filesData, sessionId);
  }

  // Optimized bulk upsert using VALUES clause for better performance
  static async bulkUpsert(filesData, sessionId = null) {
    const client = await pool.connect();
    try {
      // Use transaction for better performance with large batches
      await client.query('BEGIN');
      
      // Get LucidLink Discovery Service for filespace detection
      const lucidLinkDiscoveryService = require('./services/lucidlink-discovery-service');
      
      // Larger chunk size for maximum speed
      const chunkSize = 1000;
      const results = [];
      
      for (let i = 0; i < filesData.length; i += chunkSize) {
        const chunk = filesData.slice(i, i + chunkSize);
        
        // Build VALUES clause for bulk insert
        const values = [];
        const params = [];
        let paramIndex = 1;
        
        for (const fileData of chunk) {
          const {
            path,
            name,
            parent_path,
            is_directory,
            size,
            modified_at,
            permissions,
            metadata = {}
          } = fileData;
          
          // Get filespace information for each file
          let filespace = 'unknown';
          try {
            filespace = await lucidLinkDiscoveryService.getFilespaceDisplayName(path);
          } catch (error) {
            console.warn(`Failed to detect filespace for ${path}:`, error.message);
          }
          
          values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
          params.push(path, name, parent_path, is_directory, size, modified_at, permissions, JSON.stringify(metadata), sessionId, filespace);
        }
        
        const query = `
          INSERT INTO files (path, name, parent_path, is_directory, size, modified_at, permissions, metadata, last_seen_session_id, filespace)
          VALUES ${values.join(', ')}
          ON CONFLICT (path) 
          DO UPDATE SET 
            name = EXCLUDED.name,
            parent_path = EXCLUDED.parent_path,
            is_directory = EXCLUDED.is_directory,
            size = EXCLUDED.size,
            modified_at = EXCLUDED.modified_at,
            permissions = EXCLUDED.permissions,
            metadata = EXCLUDED.metadata,
            last_seen_session_id = EXCLUDED.last_seen_session_id,
            filespace = EXCLUDED.filespace,
            updated_at = NOW()
          RETURNING *
        `;
        
        const result = await client.query(query, params);
        results.push(...result.rows);
      }
      
      // Commit transaction for consistency
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Bulk upsert error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Regular batch upsert for smaller batches
  static async regularBatchUpsert(filesData, sessionId = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get LucidLink Discovery Service for filespace detection
      const lucidLinkDiscoveryService = require('./services/lucidlink-discovery-service');
      
      const results = [];
      for (const fileData of filesData) {
        const {
          path,
          name,
          parent_path,
          is_directory,
          size,
          modified_at,
          permissions,
          metadata = {}
        } = fileData;

        // Get filespace information
        let filespace = 'unknown';
        try {
          filespace = await lucidLinkDiscoveryService.getFilespaceDisplayName(path);
        } catch (error) {
          console.warn(`Failed to detect filespace for ${path}:`, error.message);
        }

        const result = await client.query(
          `INSERT INTO files (path, name, parent_path, is_directory, size, modified_at, permissions, metadata, last_seen_session_id, filespace)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (path) 
           DO UPDATE SET 
             name = EXCLUDED.name,
             parent_path = EXCLUDED.parent_path,
             is_directory = EXCLUDED.is_directory,
             size = EXCLUDED.size,
             modified_at = EXCLUDED.modified_at,
             permissions = EXCLUDED.permissions,
             metadata = EXCLUDED.metadata,
             last_seen_session_id = EXCLUDED.last_seen_session_id,
             filespace = EXCLUDED.filespace,
             updated_at = NOW()
           RETURNING *`,
          [path, name, parent_path, is_directory, size, modified_at, permissions, JSON.stringify(metadata), sessionId, filespace]
        );
        results.push(result.rows[0]);
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

class CacheJobModel {
  static async create(filePaths, directories = [], profileId = null) {
    const result = await pool.query(
      `INSERT INTO cache_jobs (file_paths, directory_paths, total_files, profile_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [filePaths, directories, filePaths.length, profileId]
    );
    
    const job = result.rows[0];
    
    // Create individual job items in batches to avoid query size limits
    const batchSize = 1000; // Process 1000 items at a time
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const items = batch.map(path => [job.id, path]);
      const placeholders = items.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(',');
      const values = items.flat();
      
      await pool.query(
        `INSERT INTO cache_job_items (job_id, file_path) VALUES ${placeholders}`,
        values
      );
    }
    
    return job;
  }

  static async findById(jobId) {
    const result = await pool.query(
      'SELECT * FROM cache_jobs WHERE id = $1',
      [jobId]
    );
    return result.rows[0];
  }

  static async findAll(limit = 50) {
    const result = await pool.query(
      `SELECT * FROM cache_jobs 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  static async findPending() {
    const result = await pool.query(
      "SELECT * FROM pending_cache_jobs"
    );
    return result.rows;
  }

  static async updateStatus(jobId, status, workerId = null) {
    console.log(`CacheJobModel.updateStatus called with jobId=${jobId}, status=${status}, workerId=${workerId}`);
    
    const fields = ['status = $2'];
    const values = [jobId, status];
    let paramCount = 2;

    if (workerId) {
      fields.push(`worker_id = $${++paramCount}`);
      values.push(workerId);
    }

    if (status === 'running') {
      fields.push(`started_at = NOW()`);
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      fields.push(`completed_at = NOW()`);
    }

    const query = `UPDATE cache_jobs SET ${fields.join(', ')} WHERE id = $1 RETURNING *`;
    console.log(`Executing query: ${query} with values:`, values);

    try {
      const result = await pool.query(query, values);
      console.log(`Status update successful for job ${jobId}: ${status}`);
      return result.rows[0];
    } catch (error) {
      console.error(`Database error updating job ${jobId} status to ${status}:`, error);
      throw error;
    }
  }

  static async updateProgress(jobId) {
    const result = await pool.query(
      `UPDATE cache_jobs 
       SET 
         completed_files = (
           SELECT COUNT(*) FROM cache_job_items 
           WHERE job_id = $1 AND status = 'completed'
         ),
         failed_files = (
           SELECT COUNT(*) FROM cache_job_items 
           WHERE job_id = $1 AND status = 'failed'
         ),
         completed_size_bytes = (
           SELECT COALESCE(SUM(file_size_bytes), 0) 
           FROM cache_job_items 
           WHERE job_id = $1 AND status = 'completed'
         )
       WHERE id = $1
       RETURNING *`,
      [jobId]
    );
    return result.rows[0];
  }

  // New method for incremental progress updates - more efficient
  static async updateProgressIncremental(jobId, completedFileSize, failed = false) {
    const result = await pool.query(
      `UPDATE cache_jobs 
       SET 
         completed_files = CASE WHEN $3 = false THEN completed_files + 1 ELSE completed_files END,
         failed_files = CASE WHEN $3 = true THEN failed_files + 1 ELSE failed_files END,
         completed_size_bytes = CASE WHEN $3 = false THEN completed_size_bytes + $2 ELSE completed_size_bytes END
       WHERE id = $1
       RETURNING *`,
      [jobId, completedFileSize || 0, failed]
    );
    return result.rows[0];
  }
}

class CacheJobItemModel {
  static async updateStatus(jobId, filePath, status, workerId = null, errorMessage = null) {
    const fields = ['status = $3'];
    const values = [jobId, filePath, status];
    let paramCount = 3;

    if (workerId) {
      fields.push(`worker_id = $${++paramCount}`);
      values.push(workerId);
    }

    if (errorMessage) {
      fields.push(`error_message = $${++paramCount}`);
      values.push(errorMessage);
    }

    if (status === 'running') {
      fields.push(`started_at = NOW()`);
    } else if (status === 'completed' || status === 'failed') {
      fields.push(`completed_at = NOW()`);
    }

    const result = await pool.query(
      `UPDATE cache_job_items 
       SET ${fields.join(', ')}
       WHERE job_id = $1 AND file_path = $2
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async findByJob(jobId) {
    const result = await pool.query(
      `SELECT * FROM cache_job_items 
       WHERE job_id = $1 
       ORDER BY started_at ASC`,
      [jobId]
    );
    return result.rows;
  }

  static async findPendingByJob(jobId, limit = 10) {
    const result = await pool.query(
      `SELECT * FROM cache_job_items 
       WHERE job_id = $1 AND status = 'pending'
       ORDER BY id ASC
       LIMIT $2`,
      [jobId, limit]
    );
    return result.rows;
  }

  // Atomically claim items for a worker to prevent race conditions
  static async claimPendingItems(jobId, workerId, limit = 10) {
    const result = await pool.query(
      `UPDATE cache_job_items 
       SET status = 'running', worker_id = $3, started_at = NOW()
       WHERE id IN (
         SELECT id FROM cache_job_items 
         WHERE job_id = $1 AND status = 'pending'
         ORDER BY id ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [jobId, limit, workerId]
    );
    return result.rows;
  }

  static async getCompletedCount(jobId) {
    const result = await pool.query(
      `SELECT COUNT(*) FROM cache_job_items 
       WHERE job_id = $1 AND status = 'completed'`,
      [jobId]
    );
    return parseInt(result.rows[0].count);
  }
}

class IndexProgressModel {
  static async create(rootPath) {
    const result = await pool.query(
      `INSERT INTO index_progress (root_path, status)
       VALUES ($1, 'pending')
       RETURNING *`,
      [rootPath]
    );
    return result.rows[0];
  }

  static async updateProgress(id, processedFiles, currentPath = null) {
    const result = await pool.query(
      `UPDATE index_progress 
       SET processed_files = $2, current_path = $3
       WHERE id = $1
       RETURNING *`,
      [id, processedFiles, currentPath]
    );
    return result.rows[0];
  }

  static async updateStatus(id, status, totalFiles = null, errorMessage = null) {
    const fields = ['status = $2'];
    const values = [id, status];
    let paramCount = 2;

    if (totalFiles !== null) {
      fields.push(`total_files = $${++paramCount}`);
      values.push(totalFiles);
    }

    if (errorMessage) {
      fields.push(`error_message = $${++paramCount}`);
      values.push(errorMessage);
    }

    if (status === 'completed' || status === 'failed' || status === 'stopped') {
      fields.push(`completed_at = NOW()`);
    }

    const result = await pool.query(
      `UPDATE index_progress 
       SET ${fields.join(', ')}
       WHERE id = $1
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async findActive() {
    const result = await pool.query(
      `SELECT * FROM index_progress 
       WHERE status IN ('pending', 'running')
       ORDER BY started_at DESC
       LIMIT 1`
    );
    return result.rows[0];
  }

  static async findAll(limit = 10) {
    const result = await pool.query(
      `SELECT * FROM index_progress 
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  static async isPathIndexed(rootPath) {
    const result = await pool.query(
      `SELECT * FROM index_progress 
       WHERE root_path = $1 AND status = 'completed'
       ORDER BY completed_at DESC
       LIMIT 1`,
      [rootPath]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }
}

// Test database connection
async function testConnection() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Database connection successful');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
}

class CacheJobProfileModel {
  static async findAll() {
    const result = await pool.query(
      'SELECT * FROM cache_job_profiles ORDER BY priority DESC, name ASC'
    );
    return result.rows;
  }

  static async findByName(name) {
    const result = await pool.query(
      'SELECT * FROM cache_job_profiles WHERE name = $1',
      [name]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM cache_job_profiles WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findDefault() {
    const result = await pool.query(
      'SELECT * FROM cache_job_profiles WHERE is_default = true LIMIT 1'
    );
    return result.rows[0];
  }

  static async findBestMatch(filePaths) {
    // Fast analysis with timeout fallback
    const startTime = Date.now();
    const MAX_ANALYSIS_TIME = 500; // 500ms max
    
    try {
      // Quick pattern matching without heavy database queries
      const quickAnalysis = this.quickAnalyzeFiles(filePaths);
      
      console.log('Profile analysis:', {
        fileCount: quickAnalysis.fileCount,
        dominantExt: quickAnalysis.dominantExtension,
        isLikelyImageSequence: quickAnalysis.isLikelyImageSequence,
        hasImageSequenceExtensions: quickAnalysis.hasImageSequenceExtensions
      });
      
      // Priority 1: Image sequences (high volume, need max performance)
      if (quickAnalysis.isLikelyImageSequence && quickAnalysis.fileCount > 100) {
        console.log(`Detected image sequence: ${quickAnalysis.fileCount} files, ${quickAnalysis.dominantExtension}`);
        // Use dedicated image-sequences profile for maximum performance
        return await this.findByName('image-sequences');
      }
      
      // Priority 2: Large video files
      if (quickAnalysis.hasVideoExtensions) {
        return await this.findByName('large-videos');
      }
      
      // Priority 3: Mixed proxy media
      if (quickAnalysis.hasProxyExtensions) {
        return await this.findByName('proxy-media');
      }
      
      // Priority 4: Many small files (but not image sequences)
      if (quickAnalysis.fileCount > 100 && quickAnalysis.avgPathLength < 100) {
        return await this.findByName('small-files');
      }
      
      // Check if analysis is taking too long
      if (Date.now() - startTime > MAX_ANALYSIS_TIME) {
        console.log('Profile analysis timeout, using default');
        return await this.findDefault();
      }
      
      // Default for mixed content
      return await this.findByName('general');
      
    } catch (error) {
      console.error('Profile analysis error:', error);
      return await this.findDefault();
    }
  }

  static quickAnalyzeFiles(filePaths) {
    // Ultra-fast analysis using only file paths (no database calls)
    const extensions = filePaths.map(path => {
      const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
      return ext;
    });
    
    const videoExts = ['.mov', '.mp4', '.mxf', '.avi', '.mkv'];
    const proxyExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const imageSequenceExts = ['.tif', '.tiff', '.dpx', '.exr'];
    
    // Count occurrences of each extension
    const extCounts = {};
    extensions.forEach(ext => {
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    });
    
    // Check if this looks like an image sequence (many files of same type)
    const dominantExt = Object.keys(extCounts).reduce((a, b) => 
      extCounts[a] > extCounts[b] ? a : b, '');
    const dominantExtPercentage = (extCounts[dominantExt] || 0) / filePaths.length;
    
    return {
      fileCount: filePaths.length,
      avgPathLength: filePaths.reduce((sum, path) => sum + path.length, 0) / filePaths.length,
      hasVideoExtensions: extensions.some(ext => videoExts.includes(ext)),
      hasProxyExtensions: extensions.some(ext => proxyExts.includes(ext)),
      hasImageSequenceExtensions: extensions.some(ext => imageSequenceExts.includes(ext)),
      isLikelyImageSequence: dominantExtPercentage > 0.8 && imageSequenceExts.includes(dominantExt),
      dominantExtension: dominantExt,
      uniqueExtensions: [...new Set(extensions)].length
    };
  }
}

// Prepared statement manager for optimized query performance
class PreparedStatements {
  static statements = new Map();
  
  // Initialize commonly used prepared statements
  static async initialize(client) {
    const commonStatements = {
      'find_file_by_path': 'SELECT * FROM files WHERE path = $1',
      'check_file_exists': 'SELECT path, modified_at, size FROM files WHERE path = $1',
      'update_file_metadata': `
        UPDATE files 
        SET metadata = jsonb_set(COALESCE(metadata, '{}'), $2, $3::jsonb), updated_at = NOW()
        WHERE path = $1
      `,
      'get_directory_files': 'SELECT * FROM files WHERE parent_path = $1 ORDER BY is_directory DESC, name ASC',
      'get_cached_files': 'SELECT * FROM files WHERE cached = true ORDER BY cached_at DESC LIMIT $1'
    };
    
    for (const [name, query] of Object.entries(commonStatements)) {
      try {
        await client.query(`PREPARE ${name} AS ${query}`);
        this.statements.set(name, query);
      } catch (error) {
        console.warn(`Failed to prepare statement ${name}:`, error.message);
      }
    }
  }
  
  static async prepare(client, name, query) {
    if (!this.statements.has(name)) {
      try {
        await client.query(`PREPARE ${name} AS ${query}`);
        this.statements.set(name, query);
      } catch (error) {
        console.warn(`Failed to prepare statement ${name}:`, error.message);
        throw error;
      }
    }
  }
  
  static async execute(client, name, params = []) {
    try {
      const paramPlaceholders = params.map((_, i) => `$${i + 1}`).join(',');
      if (params.length > 0) {
        return await client.query(`EXECUTE ${name}(${paramPlaceholders})`, params);
      } else {
        return await client.query(`EXECUTE ${name}`);
      }
    } catch (error) {
      console.warn(`Failed to execute prepared statement ${name}:`, error.message);
      throw error;
    }
  }
  
  static async clear(client) {
    for (const name of this.statements.keys()) {
      try {
        await client.query(`DEALLOCATE ${name}`);
      } catch (error) {
        // Ignore errors for statements that don't exist
      }
    }
    this.statements.clear();
  }
  
  static isInitialized() {
    return this.statements.size > 0;
  }
}

class IndexingSessionModel {
  static async create(rootPath) {
    const result = await pool.query(
      `INSERT INTO indexing_sessions (root_path, status)
       VALUES ($1, 'running')
       RETURNING *`,
      [rootPath]
    );
    return result.rows[0];
  }

  static async updateStatus(sessionId, status) {
    const result = await pool.query(
      `UPDATE indexing_sessions 
       SET status = $2, completed_at = $3
       WHERE id = $1
       RETURNING *`,
      [sessionId, status, status === 'completed' ? new Date() : null]
    );
    return result.rows[0];
  }

  static async findById(sessionId) {
    const result = await pool.query(
      'SELECT * FROM indexing_sessions WHERE id = $1',
      [sessionId]
    );
    return result.rows[0];
  }
}

// Import video preview models
const {
  VideoPreviewJobModel,
  VideoPreviewJobItemModel,
  VideoPreviewProfileModel
} = require('./models/video-preview-job');

module.exports = {
  pool,
  testConnection,
  FileModel,
  CacheJobModel,
  CacheJobItemModel,
  IndexProgressModel,
  CacheJobProfileModel,
  IndexingSessionModel,
  PreparedStatements,
  VideoPreviewJobModel,
  VideoPreviewJobItemModel,
  VideoPreviewProfileModel
};