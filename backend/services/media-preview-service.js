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
    
    // Video transcoding settings
    this.VIDEO_BITRATE = process.env.TRANSCODE_VIDEO_BITRATE || '2800k';
    this.VIDEO_MAXRATE = process.env.TRANSCODE_VIDEO_MAXRATE || '3000k';
    this.VIDEO_BUFSIZE = process.env.TRANSCODE_VIDEO_BUFSIZE || '6000k';
    this.VIDEO_WIDTH = parseInt(process.env.TRANSCODE_VIDEO_WIDTH || '1280');
    this.VIDEO_HEIGHT = parseInt(process.env.TRANSCODE_VIDEO_HEIGHT || '720');
    
    // Audio transcoding settings
    this.AUDIO_BITRATE = process.env.TRANSCODE_AUDIO_BITRATE || '128k';
    this.AUDIO_CODEC = process.env.TRANSCODE_AUDIO_CODEC || 'aac';
    this.AUDIO_CHANNELS = parseInt(process.env.TRANSCODE_AUDIO_CHANNELS || '2');
    this.AUDIO_SAMPLE_RATE = parseInt(process.env.TRANSCODE_AUDIO_SAMPLE_RATE || '48000');
    
    // HLS streaming settings
    this.HLS_SEGMENT_TIME = parseInt(process.env.TRANSCODE_HLS_SEGMENT_TIME || '2');
    this.CONTAINER_FORMAT = process.env.TRANSCODE_CONTAINER_FORMAT || 'hls';
    
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
      await this.redis.setEx(`preview:${cacheKey}`, ttl, JSON.stringify(previewData));
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
      video: ['.mp4', '.webm', '.ogg', '.m4v'],
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
  
  // Web-compatible video format detection specifically
  static isWebCompatibleVideo(filename) {
    const ext = path.extname(filename).toLowerCase();
    const webVideoFormats = ['.mp4', '.webm', '.ogg', '.m4v'];
    return webVideoFormats.includes(ext);
  }
  
  // Generate video preview
  async generateVideoPreview(filePath, options = {}) {
    const cacheKey = this.generateCacheKey(filePath, options);
    
    // Check cache first
    const cached = await this.getPreviewFromCache(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Check if this is an unsupported format BEFORE attempting to process
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.r3d' || ext === '.braw') {
      const previewData = {
        type: 'video',
        cacheKey,
        originalFilePath: filePath,
        status: 'failed',
        error: 'Media format not supported.',
        userFriendlyError: 'Media format not supported.',
        isUnsupportedFormat: true,
        formatType: ext === '.r3d' ? 'R3D' : 'BRAW',
        createdAt: new Date().toISOString()
      };
      
      await this.storePreviewInCache(cacheKey, previewData, 86400); // 24 hour cache
      return previewData;
    }
    
    // Determine if this is a web-compatible video format
    const isWebCompatible = MediaPreviewService.isWebCompatibleVideo(filePath);
    const filename = path.basename(filePath);
    
    const previewData = {
      type: 'video',
      cacheKey,
      originalFilePath: filePath,
      isWebCompatible,
      status: 'completed',
      createdAt: new Date().toISOString()
    };
    
    if (isWebCompatible) {
      // For web-compatible videos, provide direct streaming URL
      previewData.directStreamUrl = `/api/video/stream/${cacheKey}`;
      previewData.streamType = 'direct';
      previewData.autoplay = true;
      console.log(`✅ Direct streaming for web-compatible video: ${filename}`);
    } else {
      // For non-web-compatible videos, set up progressive HLS transcoding
      const outputDir = path.join(this.PREVIEW_CACHE_DIR, cacheKey);
      previewData.outputDir = outputDir;
      previewData.status = 'processing';
      previewData.progress = 0;
      previewData.streamType = 'hls';
      previewData.segmentCount = 0;
      previewData.autoplay = true;
      
      console.log(`🔄 Progressive HLS transcoding for non-web video: ${filename}`);
      
      // Store initial processing state and return immediately for progressive streaming
      await this.storePreviewInCache(cacheKey, previewData);
      
      // Start transcoding in background (don't await)
      this.startBackgroundTranscoding(filePath, outputDir, cacheKey, previewData);
      
      // Return immediately with processing status
      return previewData;
    }
    
    await this.storePreviewInCache(cacheKey, previewData, 86400); // 24 hour cache
    return previewData;
  }
  
  // Generate audio preview
  async generateAudioPreview(filePath, options = {}) {
    const cacheKey = this.generateCacheKey(filePath, options);
    
    // For audio files, we provide direct streaming for web-compatible formats
    const previewData = {
      type: 'audio',
      cacheKey,
      originalFilePath: filePath,
      status: 'completed',
      createdAt: new Date().toISOString()
    };
    
    // For web-compatible audio files, serve directly
    if (MediaPreviewService.isWebCompatible(filePath)) {
      previewData.directUrl = `/api/preview/audio/${cacheKey}/direct`;
    } else {
      // For non-web-compatible audio, we'll convert on-demand
      previewData.previewUrl = `/api/preview/audio/${cacheKey}/preview.mp3`;
    }
    
    // Store the file path mapping in Redis for direct serving
    await this.storePreviewInCache(cacheKey, previewData, 86400);
    return previewData;
  }
  
  // Generate image preview - simplified approach like staging
  async generateImagePreview(filePath, options = {}) {
    const cacheKey = this.generateCacheKey(filePath, options);
    
    // For images, we don't need complex caching - just return the info immediately
    const previewData = {
      type: 'image',
      cacheKey,
      originalFilePath: filePath,
      status: 'completed',
      createdAt: new Date().toISOString()
    };
    
    // For web-compatible images, serve directly
    if (MediaPreviewService.isWebCompatible(filePath)) {
      previewData.directUrl = `/api/preview/image/${cacheKey}/direct`;
    } else {
      // For non-web-compatible images, we'll convert on-demand
      previewData.previewUrl = `/api/preview/image/${cacheKey}/preview.jpg`;
    }
    
    // Store the file path mapping in Redis for direct serving
    await this.storePreviewInCache(cacheKey, previewData, 86400);
    return previewData;
  }
  
  // Convert image to web format using FFmpeg (for more format support)
  async convertImageToWebFormat(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      const ext = path.extname(inputPath).toLowerCase();
      
      // Use FFmpeg for better format support (especially EXR, DPX, etc.)
      const args = [
        '-i', inputPath,
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease',
        '-q:v', '2', // High quality (1-31, lower is better)
        '-y', // Overwrite output file
        outputPath
      ];
      
      const ffmpeg = spawn('ffmpeg', args);
      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg conversion failed: ${errorOutput}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
      });
    });
  }
  
  // Start background transcoding for progressive streaming
  async startBackgroundTranscoding(filePath, outputDir, cacheKey, previewData) {
    try {
      // Start progressive transcoding with segment monitoring
      await FFmpegTranscoder.transcodeToHLSProgressive(
        filePath,
        outputDir,
        cacheKey,
        async (progress, currentTime, duration) => {
          // Get latest data from cache and update
          const currentData = await this.getPreviewFromCache(cacheKey) || previewData;
          currentData.progress = progress;
          currentData.currentTime = currentTime;
          currentData.duration = duration;
          await this.storePreviewInCache(cacheKey, currentData);
        },
        async (segmentInfo, isPlaylist) => {
          if (!isPlaylist) {
            // Get latest data from cache and update segment count
            const currentData = await this.getPreviewFromCache(cacheKey) || previewData;
            currentData.segmentCount = (currentData.segmentCount || 0) + 1;
            await this.storePreviewInCache(cacheKey, currentData);
            console.log(`New segment ready: ${segmentInfo} (total: ${currentData.segmentCount})`);
            
            // Check if ready for progressive playback
            await this.checkProgressivePlaybackReady(cacheKey, outputDir, currentData);
          }
        }
      );
      
      // Mark as completed when transcoding finishes
      const finalData = await this.getPreviewFromCache(cacheKey) || previewData;
      finalData.status = 'completed';
      finalData.progress = 100;
      finalData.playlistUrl = `/api/preview/video/${cacheKey}/playlist.m3u8`;
      await this.storePreviewInCache(cacheKey, finalData);
      
      console.log(`✅ Background transcoding completed for ${cacheKey}`);
      
    } catch (error) {
      console.error(`❌ Background transcoding failed for ${cacheKey}:`, error);
      const errorData = await this.getPreviewFromCache(cacheKey) || previewData;
      errorData.status = 'failed';
      
      // Check if this is a user-friendly format error (generated by our helper function)
      const ext = path.extname(filePath).toLowerCase();
      const isUnsupportedFormat = ext === '.r3d' || ext === '.braw';
      
      if (isUnsupportedFormat) {
        console.log(`${ext.toUpperCase()} format detected - storing user-friendly error message`);
        // For unsupported formats, only store the simple message
        errorData.error = 'Media format not supported.';
        errorData.userFriendlyError = 'Media format not supported.';
        errorData.isUnsupportedFormat = true;
        errorData.formatType = ext === '.r3d' ? 'R3D' : 'BRAW';
      } else {
        // For other errors, store the full error message
        errorData.error = error.message;
      }
      
      await this.storePreviewInCache(cacheKey, errorData);
    }
  }
  
  // Check if enough segments are ready for progressive playback
  async checkProgressivePlaybackReady(cacheKey, outputDir, previewData) {
    try {
      // Only proceed if still processing
      if (previewData.status !== 'processing') {
        return;
      }
      
      const masterPlaylistPath = path.join(outputDir, 'playlist.m3u8');
      const segmentCount = previewData.segmentCount || 0;
      
      // Count actual segments on disk as backup
      let actualSegmentCount = 0;
      try {
        const files = fs.readdirSync(outputDir);
        actualSegmentCount = files.filter(f => f.endsWith('.ts')).length;
      } catch (e) {
        actualSegmentCount = 0;
      }
      
      // Check if we have quality playlists (now only one stream)
      const qualityPlaylists = ['stream_0.m3u8']
        .map(name => path.join(outputDir, name))
        .filter(playlistPath => {
          try {
            return fs.existsSync(playlistPath) && fs.statSync(playlistPath).size > 0;
          } catch (e) {
            return false;
          }
        });
      
      console.log(`Checking progressive readiness for ${cacheKey}:`);
      console.log(`  - Master playlist exists: ${fs.existsSync(masterPlaylistPath)}`);
      console.log(`  - Tracked segment count: ${segmentCount}`);
      console.log(`  - Actual segment count: ${actualSegmentCount}`);
      console.log(`  - Quality playlists found: ${qualityPlaylists.length}`);
      
      // Use the higher of the two segment counts
      const totalSegments = Math.max(segmentCount, actualSegmentCount);
      
      // If we have at least 1 segment and at least one quality playlist, enable progressive playback
      if (qualityPlaylists.length > 0 && totalSegments >= 1) {
        previewData.status = 'progressive_ready';
        previewData.playlistUrl = `/api/preview/video/${cacheKey}/playlist.m3u8`;
        await this.storePreviewInCache(cacheKey, previewData);
        console.log(`✅ Progressive playback ready for ${cacheKey} (${totalSegments} segments, ${qualityPlaylists.length} qualities)`);
      }
    } catch (error) {
      console.error(`Error checking progressive readiness for ${cacheKey}:`, error);
    }
  }
  
  // Get preview status
  async getPreviewStatus(cacheKey) {
    return await this.getPreviewFromCache(cacheKey);
  }
  
  // Generate user-friendly error message for video format issues
  static generateUserFriendlyVideoError(filePath, errorOutput) {
    const ext = path.extname(filePath).toLowerCase();
    
    // For R3D and BRAW files, simply return "Media format not supported"
    if (ext === '.r3d' || ext === '.braw') {
      return 'Media format not supported.';
    }
    
    return null; // No user-friendly message available
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
          '-map', '0:v:0', '-map', '0:a:0'
        );
      } else {
        args.push(
          '-map', '0:v:0'
        );
      }

      args.push(
        // Configurable quality stream for transcoding
        '-filter:v:0', `scale=w=${this.VIDEO_WIDTH}:h=${this.VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${this.VIDEO_WIDTH}:${this.VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
        '-maxrate:v:0', this.VIDEO_MAXRATE,
        '-bufsize:v:0', this.VIDEO_BUFSIZE,
        '-b:v:0', this.VIDEO_BITRATE
      );
      
      if (hasAudio) {
        args.push(
          '-c:a', this.AUDIO_CODEC,
          '-b:a', this.AUDIO_BITRATE,
          '-ac', this.AUDIO_CHANNELS.toString(),
          '-ar', this.AUDIO_SAMPLE_RATE.toString()
        );
      }
      
      args.push(
        '-f', this.CONTAINER_FORMAT,
        '-hls_time', this.HLS_SEGMENT_TIME.toString(),
        '-hls_playlist_type', 'event',
        '-hls_flags', 'independent_segments+append_list+split_by_time',
        '-hls_segment_type', 'mpegts',
        '-hls_segment_filename', path.join(outputDir, 'segment_%v_%03d.ts'),
        '-master_pl_name', 'playlist.m3u8',
        '-var_stream_map', hasAudio ? 'v:0,a:0' : 'v:0',
        path.join(outputDir, 'stream_%v.m3u8'),
        '-progress', 'pipe:1',
        '-nostats'
      );

      console.log('Starting progressive FFmpeg transcoding...');

      const ffmpeg = spawn('ffmpeg', args);
      let duration = 0;
      let lastProgress = 0;
      let segmentWatcher = null;
      
      // Watch for new segments and playlist updates for progressive playback
      const watchSegments = () => {
        segmentWatcher = fs.watch(outputDir, { persistent: false }, (eventType, filename) => {
          if (filename) {
            console.log(`File event: ${eventType} - ${filename}`);
            
            if (filename.endsWith('.ts') && eventType === 'rename') {
              console.log(`New segment created: ${filename}`);
              if (onSegmentReady) {
                onSegmentReady(filename, false); // false indicates segment, not playlist
              }
            }
            
            if (filename.endsWith('.m3u8') && (eventType === 'change' || eventType === 'rename')) {
              console.log(`Playlist updated: ${filename}`);
              if (onSegmentReady) {
                onSegmentReady(filename, true); // true indicates playlist update
              }
            }
          }
        });
      };
      
      // Start watching after a short delay to ensure directory exists
      setTimeout(watchSegments, 1000);
      
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
        // Clean up segment watcher
        if (segmentWatcher) {
          segmentWatcher.close();
          segmentWatcher = null;
        }
        
        if (code === 0) {
          FFmpegTranscoder.finalizePlaylists(outputDir);
          resolve();
        } else {
          // Check for specific professional format errors with user-friendly messages
          console.log(`FFmpeg failed for input: ${inputPath}`);
          const userFriendlyError = MediaPreviewService.generateUserFriendlyVideoError(inputPath, errorOutput);
          const finalError = userFriendlyError || `FFmpeg exited with code ${code}: ${errorOutput}`;
          
          console.log(`User-friendly error: ${userFriendlyError}`);
          console.log(`Final error: ${finalError}`);
          
          reject(new Error(finalError));
        }
      });

      ffmpeg.on('error', (err) => {
        // Clean up segment watcher on error
        if (segmentWatcher) {
          segmentWatcher.close();
          segmentWatcher = null;
        }
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