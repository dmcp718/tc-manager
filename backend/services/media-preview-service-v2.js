const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const redis = require('redis');

class MediaPreviewService {
  constructor(config = {}) {
    this.cacheDir = config.cacheDir || '/app/preview-cache';
    this.mountPoint = config.mountPoint || '/media/lucidlink-1';
    this.redisUrl = config.redisUrl || process.env.REDIS_URL;
    
    // Video transcoding settings from environment
    this.VIDEO_WIDTH = parseInt(process.env.TRANSCODE_VIDEO_WIDTH || '1280');
    this.VIDEO_HEIGHT = parseInt(process.env.TRANSCODE_VIDEO_HEIGHT || '720');
    this.VIDEO_BITRATE = process.env.TRANSCODE_VIDEO_BITRATE || '1000k';
    this.VIDEO_MAXRATE = process.env.TRANSCODE_VIDEO_MAXRATE || '1500k';
    this.VIDEO_BUFSIZE = process.env.TRANSCODE_VIDEO_BUFSIZE || '2000k';
    
    // Audio settings
    this.AUDIO_BITRATE = process.env.TRANSCODE_AUDIO_BITRATE || '128k';
    this.AUDIO_CODEC = process.env.TRANSCODE_AUDIO_CODEC || 'aac';
    this.AUDIO_CHANNELS = parseInt(process.env.TRANSCODE_AUDIO_CHANNELS || '2');
    this.AUDIO_SAMPLE_RATE = parseInt(process.env.TRANSCODE_AUDIO_SAMPLE_RATE || '48000');
    
    // HLS streaming settings
    this.HLS_SEGMENT_TIME = parseInt(process.env.TRANSCODE_HLS_SEGMENT_TIME || '2');
    this.CONTAINER_FORMAT = process.env.TRANSCODE_CONTAINER_FORMAT || 'hls';
    
    // Initialize Redis client
    this.initRedis();
  }
  
  async initRedis() {
    if (this.redisUrl) {
      this.redisClient = redis.createClient({ url: this.redisUrl });
      this.redisClient.on('error', (err) => console.error('Redis Client Error', err));
      this.redisClient.on('connect', () => console.log('Redis Client Connected'));
      await this.redisClient.connect().catch(console.error);
    }
  }
  
  generateCacheKey(filePath) {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }
  
  // Simple direct video streaming for web-compatible formats
  async generateVideoPreview(filePath, options = {}) {
    const cacheKey = this.generateCacheKey(filePath);
    const filename = path.basename(filePath);
    
    // Check cache first
    if (this.redisClient) {
      const cached = await this.redisClient.get(`preview:${cacheKey}`);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.status === 'completed') {
          return data;
        }
      }
    }
    
    // For web-compatible videos, stream directly
    if (this.isWebCompatibleVideo(filename)) {
      const previewData = {
        type: 'video',
        cacheKey,
        originalFilePath: filePath,
        isWebCompatible: true,
        status: 'completed',
        createdAt: new Date().toISOString(),
        directStreamUrl: `/api/video/stream/${cacheKey}`,
        streamType: 'direct',
        autoplay: true
      };
      
      // Cache the result
      if (this.redisClient) {
        await this.redisClient.set(
          `preview:${cacheKey}`,
          JSON.stringify(previewData),
          { EX: 3600 * 24 }
        );
      }
      
      return previewData;
    }
    
    // For non-web videos, transcode to HLS
    const outputDir = path.join(this.cacheDir, cacheKey);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    
    // Check if already transcoded
    if (fs.existsSync(playlistPath)) {
      const previewData = {
        type: 'video',
        cacheKey,
        originalFilePath: filePath,
        isWebCompatible: false,
        status: 'completed',
        createdAt: new Date().toISOString(),
        playlistUrl: `/api/preview/video/${cacheKey}/playlist.m3u8`,
        streamType: 'hls',
        isHLS: true,
        autoplay: true
      };
      
      if (this.redisClient) {
        await this.redisClient.set(
          `preview:${cacheKey}`,
          JSON.stringify(previewData),
          { EX: 3600 * 24 }
        );
      }
      
      return previewData;
    }
    
    // Start transcoding
    await this.transcodeToHLS(filePath, outputDir, playlistPath);
    
    const previewData = {
      type: 'video',
      cacheKey,
      originalFilePath: filePath,
      isWebCompatible: false,
      status: 'completed',
      createdAt: new Date().toISOString(),
      playlistUrl: `/api/preview/video/${cacheKey}/playlist.m3u8`,
      streamType: 'hls',
      isHLS: true,
      autoplay: true
    };
    
    if (this.redisClient) {
      await this.redisClient.set(
        `preview:${cacheKey}`,
        JSON.stringify(previewData),
        { EX: 3600 * 24 }
      );
    }
    
    return previewData;
  }
  
  isWebCompatibleVideo(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.mp4', '.webm', '.ogg'].includes(ext);
  }
  
  async transcodeToHLS(inputPath, outputDir, playlistPath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-vf', `scale=${this.VIDEO_WIDTH}:${this.VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${this.VIDEO_WIDTH}:${this.VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
        '-b:v', this.VIDEO_BITRATE,
        '-maxrate', this.VIDEO_MAXRATE,
        '-bufsize', this.VIDEO_BUFSIZE,
        '-c:a', this.AUDIO_CODEC,
        '-b:a', this.AUDIO_BITRATE,
        '-ac', this.AUDIO_CHANNELS.toString(),
        '-ar', this.AUDIO_SAMPLE_RATE.toString(),
        '-f', 'hls',
        '-hls_time', this.HLS_SEGMENT_TIME.toString(),
        '-hls_list_size', '0',
        '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts'),
        playlistPath
      ];
      
      const ffmpeg = spawn('ffmpeg', args);
      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
        // Log progress
        const match = data.toString().match(/time=(\d+:\d+:\d+.\d+)/);
        if (match) {
          console.log(`Transcoding progress: ${match[1]}`);
        }
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Transcoded successfully: ${path.basename(inputPath)}`);
          resolve();
        } else {
          console.error(`❌ Transcoding failed: ${errorOutput}`);
          reject(new Error(`FFmpeg failed with code ${code}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  async getPreviewStatus(cacheKey) {
    if (this.redisClient) {
      const cached = await this.redisClient.get(`preview:${cacheKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }
    return null;
  }
  
  // Cleanup old cache entries
  static cleanupOldCache(cacheDir, maxAgeMs = 24 * 60 * 60 * 1000) {
    try {
      if (!fs.existsSync(cacheDir)) return;
      
      const now = Date.now();
      const dirs = fs.readdirSync(cacheDir);
      
      for (const dir of dirs) {
        const dirPath = path.join(cacheDir, dir);
        const stats = fs.statSync(dirPath);
        
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log(`Cleaned up old cache: ${dir}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning cache:', error);
    }
  }
}

module.exports = { MediaPreviewService };