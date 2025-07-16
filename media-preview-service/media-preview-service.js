// Media Preview Service - Standalone Container Version
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createClient } = require('redis');

class MediaPreviewService {
  constructor() {
    this.PREVIEW_CACHE_DIR = process.env.PREVIEW_CACHE_DIR || '/tmp/previews';
    this.TEMP_DIR = process.env.TEMP_DIR || '/tmp';
    
    // Initialize Redis client
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://redis:6379'
    });
    
    this.redis.on('error', err => console.log('Redis Client Error', err));
    this.redis.on('connect', () => console.log('Redis Client Connected'));
    
    this.initializeService();
  }
  
  async initializeService() {
    // Connect to Redis
    try {
      await this.redis.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
    }
    
    // Create necessary directories
    [this.PREVIEW_CACHE_DIR, this.TEMP_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  // Generate unique cache key for file
  generateCacheKey(filePath, options = {}) {
    const hash = crypto.createHash('sha256');
    hash.update(filePath);
    hash.update(JSON.stringify(options));
    return hash.digest('hex');
  }
  
  // Check if preview exists in cache
  async getPreviewFromCache(cacheKey) {
    try {
      const cached = await this.redis.get(`preview:${cacheKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Error checking cache:', error);
    }
    return null;
  }
  
  // Store preview in cache
  async storePreviewInCache(cacheKey, previewData, ttl = 3600) {
    try {
      await this.redis.setex(`preview:${cacheKey}`, ttl, JSON.stringify(previewData));
    } catch (error) {
      console.error('Error storing in cache:', error);
    }
  }
  
  // File type detection
  static getSupportedTypes() {
    return {
      video: ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.r3d', '.braw', '.mxf', '.mpg', '.mpeg', '.m4v', '.wmv', '.flv'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.tif', '.tiff', '.bmp', '.heic', '.heif', '.raw', '.exr', '.dpx', '.dng', '.cr2', '.nef', '.orf', '.arw', '.pef'],
      audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma']
    };
  }
  
  static getPreviewType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = MediaPreviewService.getSupportedTypes();
    
    for (const [type, extensions] of Object.entries(types)) {
      if (extensions.includes(ext)) {
        return type;
      }
    }
    
    return 'unsupported';
  }
  
  static isSupportedFormat(filename) {
    return MediaPreviewService.getPreviewType(filename) !== 'unsupported';
  }
  
  // Content type detection
  static getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.m4v': 'video/x-m4v',
      '.mpg': 'video/mpeg',
      '.mpeg': 'video/mpeg',
      '.mxf': 'application/mxf',
      '.r3d': 'application/octet-stream',
      '.braw': 'application/octet-stream',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.flac': 'audio/flac'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
  
  // Web-compatible format detection
  static isWebCompatible(filename) {
    const ext = path.extname(filename).toLowerCase();
    const webCompatible = {
      video: ['.mp4', '.webm', '.ogg'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
      audio: ['.mp3', '.ogg', '.wav', '.m4a']
    };
    
    for (const extensions of Object.values(webCompatible)) {
      if (extensions.includes(ext)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Generate video preview
  async generateVideoPreview(filePath, options = {}) {
    const cacheKey = this.generateCacheKey(filePath, options);
    
    // Check cache first
    const cached = await this.getPreviewFromCache(cacheKey);
    if (cached) {
      return cached;
    }
    
    const outputDir = path.join(this.PREVIEW_CACHE_DIR, cacheKey);
    const previewData = {
      type: 'video',
      cacheKey,
      outputDir,
      status: 'processing',
      progress: 0,
      createdAt: new Date().toISOString()
    };
    
    // Store initial state
    await this.storePreviewInCache(cacheKey, previewData);
    
    try {
      // Start transcoding
      await FFmpegTranscoder.transcodeToHLSProgressive(
        filePath,
        outputDir,
        cacheKey,
        async (progress) => {
          previewData.progress = progress;
          previewData.status = 'processing';
          await this.storePreviewInCache(cacheKey, previewData);
        },
        async (segment) => {
          console.log(`New segment ready: ${segment}`);
        }
      );
      
      previewData.status = 'completed';
      previewData.progress = 100;
      previewData.playlistUrl = `/api/preview/video/${cacheKey}/playlist.m3u8`;
      
      await this.storePreviewInCache(cacheKey, previewData, 86400); // 24 hour cache
      
      return previewData;
    } catch (error) {
      previewData.status = 'failed';
      previewData.error = error.message;
      await this.storePreviewInCache(cacheKey, previewData);
      throw error;
    }
  }
  
  // Generate image preview
  async generateImagePreview(filePath, options = {}) {
    const cacheKey = this.generateCacheKey(filePath, options);
    
    // Check cache first
    const cached = await this.getPreviewFromCache(cacheKey);
    if (cached) {
      return cached;
    }
    
    const outputDir = path.join(this.PREVIEW_CACHE_DIR, cacheKey);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const previewData = {
      type: 'image',
      cacheKey,
      outputDir,
      status: 'processing',
      createdAt: new Date().toISOString()
    };
    
    try {
      // For web-compatible images, just create a reference
      if (MediaPreviewService.isWebCompatible(filePath)) {
        previewData.status = 'completed';
        previewData.directUrl = `/api/preview/image/${cacheKey}/direct`;
        previewData.thumbnailUrl = `/api/preview/image/${cacheKey}/thumbnail`;
      } else {
        // Convert to web-compatible format
        const outputPath = path.join(outputDir, 'preview.jpg');
        await this.convertImageToWebFormat(filePath, outputPath);
        
        previewData.status = 'completed';
        previewData.previewUrl = `/api/preview/image/${cacheKey}/preview.jpg`;
        previewData.thumbnailUrl = `/api/preview/image/${cacheKey}/thumbnail`;
      }
      
      await this.storePreviewInCache(cacheKey, previewData, 86400);
      return previewData;
    } catch (error) {
      previewData.status = 'failed';
      previewData.error = error.message;
      await this.storePreviewInCache(cacheKey, previewData);
      throw error;
    }
  }
  
  // Convert image to web format using ImageMagick
  async convertImageToWebFormat(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const args = [
        inputPath,
        '-resize', '1920x1080>',
        '-quality', '85',
        '-strip',
        outputPath
      ];
      
      const convert = spawn('convert', args);
      let errorOutput = '';
      
      convert.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      convert.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ImageMagick conversion failed: ${errorOutput}`));
        }
      });
      
      convert.on('error', (err) => {
        reject(new Error(`Failed to spawn ImageMagick: ${err.message}`));
      });
    });
  }
  
  // Get preview status
  async getPreviewStatus(cacheKey) {
    return await this.getPreviewFromCache(cacheKey);
  }
  
  // Clean up old previews
  async cleanupOldPreviews(maxAge = 86400000) { // 24 hours
    try {
      const cacheDir = this.PREVIEW_CACHE_DIR;
      if (!fs.existsSync(cacheDir)) return;
      
      const dirs = fs.readdirSync(cacheDir);
      const now = Date.now();
      
      for (const dir of dirs) {
        const dirPath = path.join(cacheDir, dir);
        const stats = fs.statSync(dirPath);
        
        if (now - stats.mtimeMs > maxAge) {
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log(`Cleaned up old preview: ${dir}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up previews:', error);
    }
  }
}

// FFmpeg Transcoder class (simplified for container)
class FFmpegTranscoder {
  static async getVideoInfo(filePath) {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ];

      const ffprobe = spawn('ffprobe', args);
      let output = '';
      let error = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        error += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe exited with code ${code}: ${error}`));
        } else {
          try {
            const info = JSON.parse(output);
            resolve(info);
          } catch (e) {
            reject(new Error('Failed to parse ffprobe output'));
          }
        }
      });
    });
  }

  static async transcodeToHLSProgressive(inputPath, outputDir, videoId, onProgress, onSegmentReady) {
    return new Promise(async (resolve, reject) => {
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // First, check if the file has audio
      let hasAudio = false;
      try {
        const videoInfo = await FFmpegTranscoder.getVideoInfo(inputPath);
        hasAudio = videoInfo.streams.some(s => s.codec_type === 'audio');
        console.log(`Video has audio: ${hasAudio}`);
      } catch (e) {
        console.warn('Could not get video info, assuming video has audio');
        hasAudio = true;
      }

      // Build FFmpeg arguments
      const args = [
        '-i', inputPath,
        '-threads', '0',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-g', '48',
        '-sc_threshold', '0',
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p'
      ];

      if (hasAudio) {
        args.push(
          '-map', '0:v:0', '-map', '0:a:0',
          '-map', '0:v:0', '-map', '0:a:0', 
          '-map', '0:v:0', '-map', '0:a:0'
        );
      } else {
        args.push(
          '-map', '0:v:0',
          '-map', '0:v:0',
          '-map', '0:v:0'
        );
      }

      args.push(
        // 1080p
        '-filter:v:0', 'scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
        '-maxrate:v:0', '5000k',
        '-bufsize:v:0', '10000k',
        '-b:v:0', '4500k',
        
        // 720p
        '-filter:v:1', 'scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
        '-maxrate:v:1', '3000k',
        '-bufsize:v:1', '6000k',
        '-b:v:1', '2800k',
        
        // 480p
        '-filter:v:2', 'scale=w=854:h=480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2',
        '-maxrate:v:2', '1500k',
        '-bufsize:v:2', '3000k',
        '-b:v:2', '1400k'
      );
      
      if (hasAudio) {
        args.push(
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ac', '2',
          '-ar', '48000'
        );
      }
      
      args.push(
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_playlist_type', 'event',
        '-hls_flags', 'independent_segments+append_list+split_by_time',
        '-hls_segment_type', 'mpegts',
        '-hls_segment_filename', path.join(outputDir, 'segment_%v_%03d.ts'),
        '-master_pl_name', 'playlist.m3u8',
        '-var_stream_map', hasAudio ? 'v:0,a:0 v:1,a:1 v:2,a:2' : 'v:0 v:1 v:2',
        path.join(outputDir, 'stream_%v.m3u8'),
        '-progress', 'pipe:1',
        '-nostats'
      );

      console.log('Starting FFmpeg transcoding...');

      const ffmpeg = spawn('ffmpeg', args);
      let duration = 0;
      let lastProgress = 0;
      
      ffmpeg.stdout.on('data', (data) => {
        const output = data.toString();
        const lines = output.split('\n');
        
        lines.forEach(line => {
          if (line.includes('duration=') && !duration) {
            const match = line.match(/duration=(\d+):(\d+):(\d+\.\d+)/);
            if (match) {
              duration = parseFloat(match[1]) * 3600 + 
                        parseFloat(match[2]) * 60 + 
                        parseFloat(match[3]);
            }
          }
          
          if (line.includes('out_time=') && duration) {
            const match = line.match(/out_time=(\d+):(\d+):(\d+\.\d+)/);
            if (match) {
              const currentTime = parseFloat(match[1]) * 3600 + 
                                 parseFloat(match[2]) * 60 + 
                                 parseFloat(match[3]);
              const progress = Math.min((currentTime / duration) * 100, 100);
              
              if (progress - lastProgress > 0.5) {
                lastProgress = progress;
                if (onProgress) {
                  onProgress(progress, currentTime, duration);
                }
              }
            }
          }
        });
      });

      let errorOutput = '';
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
        if (data.toString().toLowerCase().includes('error')) {
          console.error(`FFmpeg error: ${data}`);
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          FFmpegTranscoder.finalizePlaylists(outputDir);
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  static finalizePlaylists(outputDir) {
    try {
      const playlistFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.m3u8'));
      
      playlistFiles.forEach(file => {
        const playlistPath = path.join(outputDir, file);
        let content = fs.readFileSync(playlistPath, 'utf8');
        
        content = content.replace('#EXT-X-PLAYLIST-TYPE:EVENT', '#EXT-X-PLAYLIST-TYPE:VOD');
        
        if (!content.includes('#EXT-X-ENDLIST')) {
          content += '\n#EXT-X-ENDLIST\n';
        }
        
        fs.writeFileSync(playlistPath, content);
      });
      
      console.log('Playlists finalized for VOD playback');
    } catch (error) {
      console.error('Error finalizing playlists:', error);
    }
  }
}

module.exports = {
  MediaPreviewService,
  FFmpegTranscoder
};