// Media Preview Service - Standalone Container Version
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createClient } = require('redis');

class MediaPreviewService {
  constructor(broadcastFunction) {
    this.broadcast = broadcastFunction || (() => {}); // Store broadcast function
    this.PREVIEW_CACHE_DIR = process.env.PREVIEW_CACHE_DIR || '/tmp/previews';
    this.TEMP_DIR = process.env.TEMP_DIR || '/tmp';
    
    // Video transcoding settings
    this.VIDEO_BITRATE = process.env.TRANSCODE_VIDEO_BITRATE || '1000k';
    this.VIDEO_MAXRATE = process.env.TRANSCODE_VIDEO_MAXRATE || '1500k';
    this.VIDEO_BUFSIZE = process.env.TRANSCODE_VIDEO_BUFSIZE || '2000k';
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
    
    this.redis.on('error', err => {});
    this.redis.on('connect', () => {});
    
    this.initializeService();
  }
  
  async initializeService() {
    // Connect to Redis
    try {
      await this.redis.connect();
    } catch (error) {
      // Failed to connect to Redis
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
    
    // Only include options that affect the output, not processing flags
    const relevantOptions = {};
    if (options.quality) relevantOptions.quality = options.quality;
    if (options.resolution) relevantOptions.resolution = options.resolution;
    if (options.format) relevantOptions.format = options.format;
    // Exclude: forceTranscode, profileId as they don't affect the output
    
    hash.update(JSON.stringify(relevantOptions));
    return hash.digest('hex');
  }
  
  // Check if preview exists in cache
  async getPreviewFromCache(cacheKey) {
    try {
      // Ensure Redis is connected
      if (!this.redis.isOpen) {
        await this.redis.connect();
      }
      const cached = await this.redis.get(`preview:${cacheKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      // Error checking cache
    }
    return null;
  }
  
  // Store preview in cache
  async storePreviewInCache(cacheKey, previewData, ttl = 604800) { // 7 days default
    try {
      // Ensure Redis is connected
      if (!this.redis.isOpen) {
        await this.redis.connect();
      }
      await this.redis.setEx(`preview:${cacheKey}`, ttl, JSON.stringify(previewData));
    } catch (error) {
      // Error storing in cache
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
    
    // Check if preview exists in files table metadata
    try {
      const { FileModel } = require('../database');
      const file = await FileModel.findByPath(filePath);
      console.log(`[VideoPreview] Checking metadata for ${filePath}, found file:`, file ? 'yes' : 'no');
      if (file && file.metadata) {
        console.log(`[VideoPreview] File metadata:`, JSON.stringify(file.metadata));
        if (file.metadata.videoPreview) {
          const videoPreview = file.metadata.videoPreview;
          console.log(`[VideoPreview] Found videoPreview metadata:`, JSON.stringify(videoPreview));
          console.log(`[VideoPreview] Comparing cacheKeys: metadata=${videoPreview.cacheKey}, requested=${cacheKey}`);
          if (videoPreview.status === 'completed') {
            // Check if the manifest file actually exists
            const manifestPath = path.join(videoPreview.outputDir || path.join(this.PREVIEW_CACHE_DIR, videoPreview.cacheKey), 'manifest.mpd');
            const manifestExists = fs.existsSync(manifestPath);
            console.log(`[VideoPreview] Checking manifest at ${manifestPath}: ${manifestExists ? 'exists' : 'missing'}`);
            
            if (manifestExists) {
              // Use the stored cache key from the database, not the newly generated one
              const previewData = {
                type: 'video',
                cacheKey: videoPreview.cacheKey, // Use the actual cache key from DB
                originalFilePath: filePath,
                outputDir: videoPreview.outputDir,
                status: 'completed',
                alreadyTranscoded: true,
                manifestUrl: `/api/preview/video/${videoPreview.cacheKey}/manifest.mpd`,
                streamType: 'dash',
                createdAt: videoPreview.generatedAt
              };
              
              console.log(`[VideoPreview] Returning existing preview from metadata (using stored cacheKey: ${videoPreview.cacheKey})`);
              // Store back in cache for faster access, using the DB cache key
              await this.storePreviewInCache(videoPreview.cacheKey, previewData, 604800); // 7 days
              
              return previewData;
            } else {
              console.log(`[VideoPreview] Preview metadata exists but manifest file is missing, regenerating preview`);
            }
          } else {
            console.log(`[VideoPreview] Preview metadata exists but not completed: status=${videoPreview.status}`);
          }
        }
      }
    } catch (error) {
      console.error('Error checking file metadata for preview:', error);
      // Continue with normal preview generation if metadata check fails
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
      
      await this.storePreviewInCache(cacheKey, previewData, 604800); // 7 day cache
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
      // For web-compatible videos, serve directly without any processing
      previewData.status = 'completed';
      previewData.streamType = 'direct';
      previewData.isWebCompatible = true;
      previewData.directUrl = `/api/preview/video/${cacheKey}/direct`;
      
      // Store and return immediately for direct playback
      await this.storePreviewInCache(cacheKey, previewData, 604800); // 7 days
      
      return previewData;
    } else {
      // For non-web-compatible videos, set up DASH transcoding
      const outputDir = path.join(this.PREVIEW_CACHE_DIR, cacheKey);
      previewData.outputDir = outputDir;
      previewData.status = 'processing';
      previewData.progress = 0;
      previewData.streamType = 'dash';
      previewData.segmentCount = 0;
      previewData.autoplay = false; // Don't autoplay until fully transcoded
      
      // Store initial processing state
      await this.storePreviewInCache(cacheKey, previewData);
      
      // Start transcoding in background (don't await)
      this.startBackgroundTranscoding(filePath, outputDir, cacheKey, previewData);
      
      // Return immediately with processing status
      return previewData;
    }
    
    await this.storePreviewInCache(cacheKey, previewData, 604800); // 7 days // 24 hour cache
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
    await this.storePreviewInCache(cacheKey, previewData, 604800); // 7 days
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
    await this.storePreviewInCache(cacheKey, previewData, 604800); // 7 days
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
    await this.storePreviewInCache(cacheKey, previewData, 604800); // 7 days
    return previewData;
  }

  // Start background transcoding for progressive streaming
  async startBackgroundTranscoding(filePath, outputDir, cacheKey, previewData) {
    try {
      // Starting background transcoding
      
      // Clean up any existing files in output directory
      if (fs.existsSync(outputDir)) {
        const files = fs.readdirSync(outputDir);
        for (const file of files) {
          fs.unlinkSync(path.join(outputDir, file));
        }
      }
      
      // Start progressive transcoding with segment monitoring
      await FFmpegTranscoder.transcodeToHLSProgressive(
        filePath,
        outputDir,
        cacheKey,
        async (progress, currentTime, duration) => {
          // Get latest data from cache and update
          const currentData = await this.getPreviewFromCache(cacheKey) || previewData;
          currentData.progress = Math.round(progress * 10) / 10; // Ensure 1 decimal place
          currentData.currentTime = currentTime;
          currentData.duration = duration;
          await this.storePreviewInCache(cacheKey, currentData);
        },
        async (segmentInfo, isPlaylist) => {
          if (!isPlaylist) {
            // Get latest data from cache and update segment count
            const currentData = await this.getPreviewFromCache(cacheKey) || previewData;
            currentData.segmentCount = (currentData.segmentCount || 0) + 1;
            
            // Calculate progress based on estimated total segments
            // Assuming average video length and 4-second segments
            const estimatedProgress = Math.min((currentData.segmentCount * 4) / 120 * 100, 95); // Cap at 95% until complete
            currentData.progress = Math.round(estimatedProgress * 10) / 10; // Round to 1 decimal place
            
            await this.storePreviewInCache(cacheKey, currentData);
            
            // Broadcast progress update (no longer triggering progressive playback)
            this.broadcast({
              type: 'preview-update',
              cacheKey: cacheKey,
              status: 'processing',
              progress: estimatedProgress,
              data: currentData
            });
          }
        }
      );
      
      // Mark as completed when transcoding finishes
      const finalData = await this.getPreviewFromCache(cacheKey) || previewData;
      finalData.status = 'completed';
      finalData.progress = 100;
      finalData.manifestUrl = `/api/preview/video/${cacheKey}/manifest.mpd`;
      finalData.streamType = 'dash';
      await this.storePreviewInCache(cacheKey, finalData);
      
      // Background transcoding completed
      
      // Broadcast completion via WebSocket
      this.broadcast({
        type: 'preview-update',
        cacheKey: cacheKey,
        status: 'completed',
        data: finalData
      });
      
    } catch (error) {
      // Background transcoding failed
      const errorData = await this.getPreviewFromCache(cacheKey) || previewData;
      errorData.status = 'failed';
      
      // Check if this is a user-friendly format error (generated by our helper function)
      const ext = path.extname(filePath).toLowerCase();
      const isUnsupportedFormat = ext === '.r3d' || ext === '.braw';
      
      if (isUnsupportedFormat) {
        // Special format detected - storing user-friendly error message
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
      
      // Broadcast failure via WebSocket
      this.broadcast({
        type: 'preview-update',
        cacheKey: cacheKey,
        status: 'failed',
        data: errorData
      });
    }
  }
  
  // Check if enough segments are ready for progressive playback
  async checkProgressivePlaybackReady(cacheKey, outputDir, previewData) {
    // Disabled - we now wait for complete transcoding before playback
    return;
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

  // Generate DASH manifest for web-compatible videos (no transcoding)
  async generateDashManifestDirect(filePath, outputDir, cacheKey, previewData) {
    try {
      // Create output directory
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // First check if file has audio
      let hasAudio = false;
      try {
        const videoInfo = await FFmpegTranscoder.getVideoInfo(filePath);
        hasAudio = videoInfo.streams.some(s => s.codec_type === 'audio');
      } catch (e) {
        hasAudio = true; // Assume has audio if can't determine
      }
      
      // Use FFmpeg to generate DASH manifest without re-encoding
      const args = [
        '-i', filePath,
        '-c:v', 'copy',           // Copy video codec (no re-encoding)
        '-c:a', 'copy',           // Copy audio codec (no re-encoding)
        '-f', 'dash',
        '-seg_duration', '4',
        '-use_template', '1',
        '-use_timeline', '1',
        '-adaptation_sets', hasAudio ? 'id=0,streams=v id=1,streams=a' : 'id=0,streams=v',
        '-init_seg_name', 'init-$RepresentationID$.m4s',
        '-media_seg_name', 'chunk-$RepresentationID$-$Number%05d$.m4s',
        path.join(outputDir, 'manifest.mpd')
      ];
      
      const ffmpeg = spawn('ffmpeg', args);
      let errorOutput = '';
      
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      ffmpeg.on('close', async (code) => {
        if (code === 0) {
          // Update preview data with completed status
          previewData.status = 'completed';
          previewData.manifestUrl = `/api/preview/video/${cacheKey}/manifest.mpd`;
          previewData.streamType = 'dash';
          await this.storePreviewInCache(cacheKey, previewData);
        } else {
          previewData.status = 'failed';
          previewData.error = `Failed to generate DASH manifest: ${errorOutput}`;
          await this.storePreviewInCache(cacheKey, previewData);
        }
      });
      
    } catch (error) {
      previewData.status = 'failed';
      previewData.error = error.message;
      await this.storePreviewInCache(cacheKey, previewData);
    }
  }

  // Clean up old previews
  async cleanupOldPreviews(maxAge = 604800000) { // 7 days
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
          // Cleaned up old preview
        }
      }
    } catch (error) {
      // Error cleaning up previews
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
    // FFmpegTranscoder.transcodeToHLSProgressive called
    
    return new Promise(async (resolve, reject) => {
      // Inside Promise - about to create output directory
      
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // First, check if the file has audio
      // About to check if file has audio
      let hasAudio = false;
      try {
        const videoInfo = await FFmpegTranscoder.getVideoInfo(inputPath);
        hasAudio = videoInfo.streams.some(s => s.codec_type === 'audio');
        // Video has audio check complete
      } catch (e) {
        // Could not get video info, assuming video has audio
        hasAudio = true;
      }

      // Build FFmpeg arguments
      const args = [
        '-i', inputPath,
        '-threads', '0',
        '-c:v', 'libx264',
        '-preset', 'fast',            // Better quality for encoding consistency
        '-crf', '23',
        '-force_key_frames', 'expr:gte(t,n_forced*2)', // Force keyframe every 2 seconds (half of 4s segment)
        '-sc_threshold', '0',         // Disable scene cut detection
        '-profile:v', 'high',
        '-level', '4.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',    // Optimize for streaming
        '-avoid_negative_ts', 'make_zero' // Fix timestamp issues
      ];

      if (hasAudio) {
        args.push(
          '-map', '0:v:0',              // Map first video stream
          '-map', '0:a:0?'              // Map first audio stream if available (? makes it optional)
        );
      } else {
        args.push(
          '-map', '0:v:0'
        );
      }

      args.push(
        // Single 720p quality stream with optimized settings
        '-filter:v:0', 'scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
        '-b:v:0', '2500k',            // Target bitrate
        '-maxrate:v:0', '3000k',      // Maximum bitrate
        '-bufsize:v:0', '5000k'       // Buffer size
      );
      
      if (hasAudio) {
        args.push(
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ac', '2',
          '-ar', '48000'
        );
      }
      
      // Use DASH for better progressive streaming
      args.push(
        '-f', 'dash',
        '-seg_duration', '4',          // 4-second segments
        '-use_template', '1',          // Use SegmentTemplate
        '-use_timeline', '1',          // Use SegmentTimeline for accurate timing
        '-adaptation_sets', hasAudio ? 'id=0,streams=v id=1,streams=a' : 'id=0,streams=v',
        '-init_seg_name', 'init-$RepresentationID$.m4s',
        '-media_seg_name', 'chunk-$RepresentationID$-$Number%05d$.m4s',
        '-single_file', '0',           // Separate files for each segment
        '-remove_at_exit', '0',        // Don't remove segments when done
        '-dash_segment_type', 'mp4',   // Use MP4 segments
        path.join(outputDir, 'manifest.mpd'),
        '-progress', 'pipe:1',
        '-nostats',
        '-loglevel', 'warning'
      );

      // Starting progressive FFmpeg transcoding

      const ffmpeg = spawn('ffmpeg', args);
      let duration = 0;
      let lastProgress = 0;
      let segmentWatcher = null;
      
      // Watch for new segments and manifest updates for progressive playback
      const watchSegments = () => {
        segmentWatcher = fs.watch(outputDir, { persistent: false }, (eventType, filename) => {
          if (filename) {
            // File event detected
            
            if (filename.endsWith('.m4s') && filename.includes('chunk-') && eventType === 'rename') {
              // New DASH segment created
              if (onSegmentReady) {
                onSegmentReady(filename, false); // false indicates segment, not manifest
              }
            }
            
            if (filename === 'manifest.mpd' && (eventType === 'change' || eventType === 'rename')) {
              // DASH manifest updated
              if (onSegmentReady) {
                onSegmentReady(filename, true); // true indicates manifest update
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
              const roundedProgress = Math.round(progress * 10) / 10; // Round to 1 decimal place
              
              if (roundedProgress - lastProgress > 0.5) {
                lastProgress = roundedProgress;
                if (onProgress) {
                  onProgress(roundedProgress, currentTime, duration);
                }
              }
            }
          }
        });
      });

      let errorOutput = '';
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
        const output = data.toString();
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('warning')) {
          console.log('FFmpeg output:', output);
        }
      });

      ffmpeg.on('close', (code) => {
        // Clean up segment watcher
        if (segmentWatcher) {
          segmentWatcher.close();
          segmentWatcher = null;
        }
        
        if (code === 0) {
          // DASH doesn't need finalization like HLS
          resolve();
        } else {
          // Check if manifest file was actually created despite error code
          const manifestPath = path.join(outputDir, 'manifest.mpd');
          if (fs.existsSync(manifestPath)) {
            // Files were created successfully despite FFmpeg error
            console.log(`FFmpeg exited with code ${code} but manifest exists, considering it successful`);
            resolve();
          } else {
            // Check for specific professional format errors with user-friendly messages
            // FFmpeg failed for input
            const userFriendlyError = MediaPreviewService.generateUserFriendlyVideoError(inputPath, errorOutput);
            const finalError = userFriendlyError || `FFmpeg exited with code ${code}: ${errorOutput}`;
            
            // User-friendly error prepared
            // Final error prepared
            
            reject(new Error(finalError));
          }
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
      
      // Playlists finalized for VOD playback
    } catch (error) {
      // Error finalizing playlists
    }
  }
}

module.exports = {
  MediaPreviewService,
  FFmpegTranscoder
};