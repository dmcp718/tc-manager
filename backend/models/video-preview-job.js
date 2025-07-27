const { pool } = require('../pool');

class VideoPreviewJobModel {
  static async create(jobData) {
    const { filePaths, directoryPaths = [], profileId } = jobData;
    
    const query = `
      INSERT INTO video_preview_jobs 
        (file_paths, directory_paths, total_files, profile_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const values = [
      filePaths,
      directoryPaths,
      filePaths.length,
      profileId || null
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }
  
  static async findById(id) {
    const query = 'SELECT * FROM video_preview_jobs WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
  
  static async findAll(limit = 50) {
    const query = `
      SELECT j.*, p.name as profile_name 
      FROM video_preview_jobs j
      LEFT JOIN video_preview_profiles p ON j.profile_id = p.id
      ORDER BY j.created_at DESC 
      LIMIT $1
    `;
    const result = await pool.query(query, [limit]);
    return result.rows;
  }
  
  static async findPending() {
    const query = `
      SELECT 
        j.id as job_id,
        j.status,
        j.file_paths,
        j.directory_paths,
        j.total_files,
        j.completed_files,
        j.failed_files,
        j.skipped_files,
        j.worker_id,
        j.profile_id,
        j.created_at,
        j.started_at,
        j.completed_at,
        j.error_message,
        p.id as profile_id,
        p.name as profile_name,
        p.max_concurrent_files,
        p.worker_count,
        p.worker_poll_interval,
        p.video_bitrate,
        p.video_maxrate,
        p.video_width,
        p.video_height,
        p.segment_duration
      FROM video_preview_jobs j
      LEFT JOIN video_preview_profiles p ON j.profile_id = p.id
      WHERE j.status = 'pending'
      ORDER BY j.created_at ASC
      LIMIT 1
    `;
    const result = await pool.query(query);
    if (result.rows.length === 0) {
      return null;
    }
    
    // Transform the result to match expected structure
    const row = result.rows[0];
    return {
      id: row.job_id,
      status: row.status,
      file_paths: row.file_paths,
      directory_paths: row.directory_paths,
      total_files: row.total_files,
      completed_files: row.completed_files,
      failed_files: row.failed_files,
      skipped_files: row.skipped_files,
      worker_id: row.worker_id,
      profile_id: row.profile_id,
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      error_message: row.error_message,
      profile: row.profile_name ? {
        id: row.profile_id,
        name: row.profile_name,
        max_concurrent_files: row.max_concurrent_files,
        worker_count: row.worker_count,
        worker_poll_interval: row.worker_poll_interval,
        video_bitrate: row.video_bitrate,
        video_maxrate: row.video_maxrate,
        video_width: row.video_width,
        video_height: row.video_height,
        segment_duration: row.segment_duration
      } : null
    };
  }
  
  static async updateStatus(id, status, workerId = null) {
    let query;
    let values;
    
    if (status === 'running') {
      query = `
        UPDATE video_preview_jobs 
        SET status = $1, worker_id = $2, started_at = NOW()
        WHERE id = $3
        RETURNING *
      `;
      values = [status, workerId, id];
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      query = `
        UPDATE video_preview_jobs 
        SET status = $1, completed_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      values = [status, id];
    } else {
      query = `
        UPDATE video_preview_jobs 
        SET status = $1
        WHERE id = $2
        RETURNING *
      `;
      values = [status, id];
    }
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }
  
  static async updateProgress(id, completed, failed = 0, skipped = 0) {
    const query = `
      UPDATE video_preview_jobs 
      SET completed_files = $1, failed_files = $2, skipped_files = $3
      WHERE id = $4
      RETURNING *
    `;
    const result = await pool.query(query, [completed, failed, skipped, id]);
    return result.rows[0];
  }
  
  static async setError(id, errorMessage) {
    const query = `
      UPDATE video_preview_jobs 
      SET status = 'failed', error_message = $1, completed_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [errorMessage, id]);
    return result.rows[0];
  }
  
  static async getStats() {
    const query = 'SELECT * FROM get_video_preview_stats()';
    const result = await pool.query(query);
    return result.rows[0];
  }
}

class VideoPreviewJobItemModel {
  static async create(itemData) {
    const { jobId, filePath, fileName, fileSize } = itemData;
    
    const query = `
      INSERT INTO video_preview_job_items 
        (job_id, file_path, file_name, file_size)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const values = [jobId, filePath, fileName, fileSize || null];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }
  
  static async findByJob(jobId, status = null) {
    let query = 'SELECT * FROM video_preview_job_items WHERE job_id = $1';
    const values = [jobId];
    
    if (status) {
      query += ' AND status = $2';
      values.push(status);
    }
    
    query += ' ORDER BY id';
    
    const result = await pool.query(query, values);
    return result.rows;
  }
  
  static async findPendingByJob(jobId, limit = 1) {
    const query = `
      SELECT * FROM video_preview_job_items 
      WHERE job_id = $1 AND status = 'pending'
      ORDER BY id
      LIMIT $2
    `;
    const result = await pool.query(query, [jobId, limit]);
    return result.rows;
  }
  
  static async updateStatus(id, status, workerId = null) {
    let query;
    let values;
    
    if (status === 'running') {
      query = `
        UPDATE video_preview_job_items 
        SET status = $1, worker_id = $2, started_at = NOW()
        WHERE id = $3
        RETURNING *
      `;
      values = [status, workerId, id];
    } else if (status === 'completed') {
      query = `
        UPDATE video_preview_job_items 
        SET status = $1, completed_at = NOW(), 
            duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
        WHERE id = $2
        RETURNING *
      `;
      values = [status, id];
    } else {
      query = `
        UPDATE video_preview_job_items 
        SET status = $1, completed_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      values = [status, id];
    }
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }
  
  static async setCompleted(id, cacheKey, previewPath) {
    const query = `
      UPDATE video_preview_job_items 
      SET status = 'completed', 
          cache_key = $1, 
          preview_path = $2,
          completed_at = NOW(),
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
      WHERE id = $3
      RETURNING *
    `;
    const result = await pool.query(query, [cacheKey, previewPath, id]);
    return result.rows[0];
  }
  
  static async setSkipped(id, reason) {
    const query = `
      UPDATE video_preview_job_items 
      SET status = 'skipped', 
          skip_reason = $1,
          completed_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [reason, id]);
    return result.rows[0];
  }
  
  static async setError(id, errorMessage) {
    const query = `
      UPDATE video_preview_job_items 
      SET status = 'failed', 
          error_message = $1,
          completed_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [errorMessage, id]);
    return result.rows[0];
  }
}

class VideoPreviewProfileModel {
  static async findAll() {
    const query = 'SELECT * FROM video_preview_profiles ORDER BY priority DESC, name';
    const result = await pool.query(query);
    return result.rows;
  }
  
  static async findById(id) {
    const query = 'SELECT * FROM video_preview_profiles WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
  
  static async findByName(name) {
    const query = 'SELECT * FROM video_preview_profiles WHERE name = $1';
    const result = await pool.query(query, [name]);
    return result.rows[0];
  }
  
  static async findDefault() {
    const query = 'SELECT * FROM video_preview_profiles WHERE is_default = true LIMIT 1';
    const result = await pool.query(query);
    return result.rows[0];
  }
}

module.exports = {
  VideoPreviewJobModel,
  VideoPreviewJobItemModel,
  VideoPreviewProfileModel
};