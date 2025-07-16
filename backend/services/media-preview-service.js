// Media Preview Service Helper - For backend integration
const path = require('path');

class MediaPreviewService {
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
}

module.exports = {
  MediaPreviewService
};