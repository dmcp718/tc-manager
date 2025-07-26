// Utility functions for file operations and formatting

export const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export const getFileIconType = (file) => {
  if (file.isDirectory) return 'folder';
  const ext = file.extension.toLowerCase();
  if (['.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.json', '.xml', '.yaml'].includes(ext)) return 'code';
  if (['.jpg', '.png', '.gif', '.jpeg', '.webp', '.tif', '.tiff', '.psd', '.dpx', '.exr'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.mxf', '.braw', '.r3d'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.flac', '.aac'].includes(ext)) return 'audio';
  if (['.zip', '.tar', '.gz', '.rar'].includes(ext)) return 'archive';
  if (['.pdf'].includes(ext)) return 'pdf';
  return 'default';
};

export const getRelativePath = (absolutePath) => {
  if (!absolutePath || typeof absolutePath !== 'string') {
    return '/'; // Default to root if path is invalid
  }
  
  const mountPoint = process.env.REACT_APP_LUCIDLINK_MOUNT_POINT || '/media/lucidlink-1';
  
  if (absolutePath === mountPoint) {
    return '/'; // Root of the mount
  }
  
  if (absolutePath.startsWith(mountPoint + '/')) {
    return absolutePath.substring(mountPoint.length); // Remove mount point prefix
  }
  
  return absolutePath; // Return as-is if not under mount point
};

export const isSupportedForPreview = (filename) => {
  const ext = filename.toLowerCase().split('.').pop();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'psd', 'dpx', 'exr', 'mp4', 'mov', 'avi', 'mkv', 'm4v', 'mxf', 'braw', 'r3d', 'mp3', 'wav', 'flac', 'aac'].includes(ext);
};

export const formatFileSize = (file, directorySizes, loadingSizes) => {
  if (file.isDirectory) {
    // First check if we have computed size from the backend
    if (file.fileCount !== undefined) {
      const sizeStr = formatBytes(file.size);
      return `${sizeStr} (${file.fileCount} files)`;
    }
    
    // Then check if we have loaded size from API
    const loadedSize = directorySizes[file.path];
    if (loadedSize && !loadedSize.error) {
      const sizeStr = formatBytes(loadedSize.size);
      return `${sizeStr} (${loadedSize.file_count} files)`;
    }
    
    // Show loading indicator or dash
    if (loadingSizes.has(file.path)) {
      return 'Loading...';
    }
    
    return '-';
  }
  
  return formatBytes(file.size);
};

export const getRUIStatus = (file, ruiStatus) => {
  // Only check RUI status for regular files (not directories)
  if (file.isDirectory) {
    return false;
  }
  
  // Check if file has RUI status in metadata
  if (file.metadata && file.metadata.rui && file.metadata.rui.status === 'uploading') {
    return true;
  }
  
  // Check runtime RUI status
  const status = ruiStatus.get(file.path);
  return status === 'uploading';
};