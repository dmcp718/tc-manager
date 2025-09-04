import React, { useState, useEffect, useRef } from 'react';
import { Tree } from 'react-arborist';
import Hls from 'hls.js';
import dashjs from 'dashjs';
import TabNavigation from '../components/TabNavigation';
import FileSystemAPI from '../services/FileSystemAPI';
import { 
  formatBytes, 
  formatDate, 
  getFileIconType, 
  getRelativePath, 
  isSupportedForPreview,
  formatFileSize,
  getRUIStatus 
} from '../utils/fileUtils';

// Modern file manager styles inspired by contemporary design
const styles = {
  container: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1a1a1a',
    color: '#e4e4e7',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: {
    borderBottom: '1px solid #2a2a2a',
    backgroundColor: '#111111',
    display: 'flex',
    alignItems: 'center',
    height: '60px',
  },
  headerLeft: {
    width: '320px',
    padding: '0 20px',
    display: 'flex',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    padding: '0 20px 0 1px',
    display: 'flex',
    alignItems: 'center',
  },
  headerRight: {
    padding: '0 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: 0,
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  titleVersion: {
    fontSize: '14px',
    fontWeight: 'normal',
    color: '#a1a1aa',
    marginLeft: '8px',
  },
  headerActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  searchContainer: {
    width: '360px',
    maxWidth: '360px',
    position: 'relative',
  },
  statusArea: {
    fontSize: '13px',
    color: '#a1a1aa',
    whiteSpace: 'nowrap',
    marginRight: '12px',
  },
  searchInput: {
    width: '100%',
    padding: '6px 32px 6px 12px',
    borderRadius: '6px',
    border: '1px solid #3a3a3a',
    backgroundColor: '#1a1a1a',
    color: '#e4e4e7',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  searchIcon: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#71717a',
    pointerEvents: 'none',
  },
  clearSearchButton: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#71717a',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '320px',
    minWidth: '320px',
    borderRight: '1px solid #2a2a2a',
    backgroundColor: '#111111',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  sidebarSection: {
    padding: '16px',
    borderBottom: '1px solid #2a2a2a',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    margin: 0,
  },
  treeContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '8px 0',
  },
  treeNode: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 16px',
    cursor: 'pointer',
    fontSize: '13px',
    userSelect: 'none',
    transition: 'background-color 0.15s ease',
  },
  treeNodeSelected: {
    backgroundColor: '#2a2a2a',
    color: '#ffffff',
  },
  nodeIcon: {
    marginRight: '8px',
    display: 'flex',
    alignItems: 'center',
  },
  nodeText: {
    flex: 1,
    fontWeight: '500',
    color: 'inherit',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  contentArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  breadcrumb: {
    padding: '16px 20px',
    fontSize: '14px',
    color: '#e4e4e7',
    borderBottom: '1px solid #2a2a2a',
    display: 'flex',
    alignItems: 'center',
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid #2a2a2a',
    backgroundColor: '#111111',
    gap: '6px',
    flexWrap: 'wrap',
  },
  filterButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #3a3a3a',
    backgroundColor: 'transparent',
    color: '#a1a1aa',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  filterButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#ffffff',
  },
  tableContainer: {
    flex: 1,
    overflow: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  tableHeader: {
    position: 'sticky',
    top: 0,
    backgroundColor: '#111111',
    zIndex: 1,
  },
  tableHeaderCell: {
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#a1a1aa',
    borderBottom: '1px solid #2a2a2a',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
  },
  tableRow: {
    borderBottom: '1px solid #2a2a2a',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  tableRowHover: {
    backgroundColor: '#1f1f1f',
  },
  tableRowSelected: {
    backgroundColor: '#2a2a2a',
  },
  tableCell: {
    padding: '12px 16px',
    borderBottom: '1px solid #2a2a2a',
    color: '#e4e4e7',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '300px',
  },
  fileName: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  fileIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionBar: {
    padding: '16px 20px',
    borderTop: '1px solid #2a2a2a',
    backgroundColor: '#111111',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid #3a3a3a',
    backgroundColor: '#2a2a2a',
    color: '#e4e4e7',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#ffffff',
  },
  jobPanel: {
    position: 'fixed',
    top: 0,
    right: '-400px',
    width: '400px',
    height: '100vh',
    backgroundColor: '#111111',
    borderLeft: '1px solid #2a2a2a',
    zIndex: 1000,
    transition: 'right 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
  },
  jobPanelOpen: {
    right: 0,
  },
};

// Custom Folder Icon Component
const FolderIcon = ({ isOpen, size = 16, color = '#22c55e' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

// Custom File Icon Component
const FileIcon = ({ type, size = 16, color = '#a1a1aa' }) => {
  switch (type) {
    case 'code':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <polyline points="16,18 22,12 16,6"/>
          <polyline points="8,6 2,12 8,18"/>
        </svg>
      );
    case 'image':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21,15 16,10 5,21"/>
        </svg>
      );
    case 'video':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <polygon points="23,7 16,12 23,17"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
      );
    case 'audio':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/>
          <circle cx="18" cy="16" r="3"/>
        </svg>
      );
    case 'archive':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <polyline points="21,8 21,21 3,21 3,8"/>
          <rect x="1" y="3" width="22" height="5"/>
          <line x1="10" y1="12" x2="14" y2="12"/>
        </svg>
      );
    case 'pdf':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10,9 9,9 8,9"/>
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
          <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2Z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
      );
  }
};

// Tree Node Component
const FileTreeNode = ({ node, style, dragHandle }) => {
  const { data } = node;
  const isSelected = node.isSelected;
  
  // Calculate level manually based on path depth
  const calculateLevel = (path) => {
    if (!path || typeof path !== 'string') return 0;
    const parts = path.split('/').filter(part => part.length > 0);
    if (parts.length <= 2) return 0; // Root level (/media/lucidlink-1)
    return parts.length - 2; // Subtract 2 to make /media/lucidlink-1 level 0
  };
  
  const level = calculateLevel(data.path);
  const indentAmount = level * 20; // 20px per level
  
  return (
    <div
      ref={dragHandle}
      style={{
        ...style,
        ...styles.treeNode,
        ...(isSelected ? styles.treeNodeSelected : {}),
      }}
      onClick={() => node.toggle()}
    >
      {/* Indentation spacer */}
      <div style={{ width: `${indentAmount}px`, flexShrink: 0 }} />
      
      <span style={styles.nodeIcon}>
        <FolderIcon isOpen={node.isOpen} size={14} />
      </span>
      <span style={styles.nodeText}>
        {data.name}
      </span>
      {data.indexed && level === 0 && (
        <span style={{
          marginLeft: '8px',
          fontSize: '11px',
          color: '#22c55e',
          fontWeight: 'bold',
          backgroundColor: '#0f2e1e',
          padding: '2px 6px',
          borderRadius: '4px',
          border: '1px solid #22c55e'
        }}>
          INDEXED
        </span>
      )}
    </div>
  );
};

// Job Panel Component
const JobPanel = ({ isOpen, onClose, jobs, onClearJobs, onCancelJob }) => {
  return (
    <div style={{
      ...styles.jobPanel,
      ...(isOpen ? styles.jobPanelOpen : {}),
    }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #2a2a2a' }}>
        <h3 style={{ margin: 0, fontSize: '20px' }}>Running Jobs</h3>
        <div style={{ position: 'absolute', right: '20px', top: '20px', display: 'flex', gap: '8px' }}>
          <button
            onClick={onClearJobs}
            style={{ 
              ...styles.button, 
              fontSize: '12px',
              padding: '4px 8px',
              backgroundColor: '#991b1b',
              borderColor: '#991b1b'
            }}
          >
            Clear Jobs
          </button>
          <button
            onClick={onClose}
            style={{ ...styles.button, fontSize: '12px', padding: '4px 8px' }}
          >
            ✕
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        {jobs.map(job => (
          <div key={job.id} style={{
            padding: '15px',
            marginBottom: '10px',
            backgroundColor: '#141414',
            borderRadius: '8px',
            border: '1px solid #2a2a2a',
          }}>
            <div style={{ fontSize: '14px', marginBottom: '5px' }}>
              {job.type === 'script' ? job.scriptPath.split('/').pop() : 
               job.type === 'index' ? `Index Files: ${job.rootPath || '/media/lucidlink-1'}` :
               job.type === 'video-preview' ? `Video Preview (${job.totalFiles} files)` :
               `Cache Job (${job.totalFiles} files)`}
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '3px' }}>
              ID: {job.id.substring(0, 8)}...
              {job.startTime && (
                <span style={{ marginLeft: '10px' }}>
                  Started: {new Date(job.startTime).toLocaleTimeString()}
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: '#888' }}>
              Status: <span style={{ 
                color: job.status === 'completed' ? '#22c55e' : 
                       job.status === 'failed' ? '#ef4444' : '#3b82f6',
                fontWeight: '500'
              }}>
                {job.status.toUpperCase()}
              </span>
              {job.endTime && job.startTime && job.status === 'completed' && (() => {
                const durationSeconds = Math.round((new Date(job.endTime) - new Date(job.startTime)) / 1000);
                if (durationSeconds >= 60) {
                  const minutes = Math.floor(durationSeconds / 60);
                  const seconds = durationSeconds % 60;
                  return (
                    <span style={{ marginLeft: '10px', color: '#666' }}>
                      ({minutes}m {seconds}s)
                    </span>
                  );
                } else {
                  return (
                    <span style={{ marginLeft: '10px', color: '#666' }}>
                      ({durationSeconds}s)
                    </span>
                  );
                }
              })()}
            </div>
            {(job.type === 'cache' || job.type === 'video-preview') && ['pending', 'running', 'paused'].includes(job.status) && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                  Progress: {Math.round((job.completedFiles / job.totalFiles) * 100)}% 
                  ({job.completedFiles}/{job.totalFiles} files)
                  {job.type === 'video-preview' && job.skippedFiles > 0 && (
                    <span style={{ marginLeft: '8px', color: '#f59e0b' }}>
                      ({job.skippedFiles} skipped)
                    </span>
                  )}
                </div>
                <div style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: '#2a2a2a',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(job.completedFiles / job.totalFiles) * 100}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <button
                  onClick={() => onCancelJob(job.id)}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                  }}
                >
                  Stop Job
                </button>
              </div>
            )}
            {job.type === 'index' && job.status === 'running' && (
              <div style={{ marginTop: '10px' }}>
                {job.currentPath && (
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                    Current: {job.currentPath.length > 60 ? 
                      `...${job.currentPath.substring(job.currentPath.length - 60)}` : 
                      job.currentPath}
                  </div>
                )}
                {job.processedItems !== undefined && job.totalItems !== undefined && (
                  <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                    Progress: {job.processedItems}/{job.totalItems} items
                  </div>
                )}
                <button
                  onClick={() => onCancelJob(job.id)}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                  }}
                >
                  Stop Job
                </button>
              </div>
            )}
          </div>
        ))}
        {jobs.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            color: '#71717a', 
            fontSize: '14px',
            marginTop: '40px'
          }}>
            No active jobs
          </div>
        )}
      </div>
    </div>
  );
};

// Video Player Component
function VideoPlayer({ preview }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Helper to ensure URLs have the correct base path and auth token for video
    const ensureFullUrl = (url) => {
      if (url && !url.startsWith('http')) {
        const fullUrl = `${FileSystemAPI.baseURL.replace('/api', '')}${url}`;
        // Add auth token for video URLs (needed for authentication)
        if (url.includes('/api/preview/video/') || url.includes('/api/video/stream/')) {
          const token = localStorage.getItem('authToken');
          if (token) {
            const separator = fullUrl.includes('?') ? '&' : '?';
            return `${fullUrl}${separator}token=${token}`;
          }
        }
        return fullUrl;
      }
      return url;
    };

    const streamUrl = ensureFullUrl(preview?.manifestUrl || preview?.playlistUrl || preview?.directStreamUrl || preview?.directUrl);
    
    // Use direct playback for web-compatible videos
    if (preview?.streamType === 'direct' && streamUrl) {
      // Direct playback - just set the video source
      video.src = streamUrl;
      return;
    } else if (streamUrl && (streamUrl.includes('.mpd') || preview?.streamType === 'dash')) {
      const player = dashjs.MediaPlayer().create();
      const token = localStorage.getItem('authToken');
      
      // Configure DASH player with minimal settings
      player.updateSettings({
        streaming: {
          buffer: {
            stableBufferTime: 12,
            bufferToKeep: 30,
            initialBufferLevel: 8
          },
          abr: {
            autoSwitchBitrate: { video: false, audio: false } // Disable ABR for single quality
          }
        },
        debug: {
          logLevel: dashjs.Debug.LOG_LEVEL_WARNING
        }
      });
      
      // Add authentication to requests
      player.extend("RequestModifier", function () {
        return {
          modifyRequestHeader: function (xhr, { url }) {
            if (token) {
              xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
            return xhr;
          },
          modifyRequestURL: function (url) {
            if (token && !url.includes('token=')) {
              return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
            }
            return url;
          }
        };
      });
      
      // Initialize player
      player.initialize(video, streamUrl, true);
      
      // Set up error handling
      player.on(dashjs.MediaPlayer.events.ERROR, function (e) {
        console.error('DASH playback error:', e);
      });
      
      // Cleanup on unmount
      return () => {
        player.destroy();
      };
    } else if (streamUrl && (streamUrl.includes('.m3u8') || preview?.streamType === 'hls')) {
      if (Hls.isSupported()) {
        const token = localStorage.getItem('authToken');
        const hls = new Hls({
          xhrSetup: function (xhr, url) {
            // Add Bearer token to headers
            if (token) {
              xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
          },
          // Also append token to all URLs as query parameter for HLS segments
          loader: class extends Hls.DefaultConfig.loader {
            load(context, config, callbacks) {
              const { url } = context;
              if (token && url && !url.includes('token=')) {
                context.url = `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
              }
              return super.load(context, config, callbacks);
            }
          },
          // Optimize based on analysis recommendations
          maxBufferLength: 15,           // Recommended buffer length
          maxMaxBufferLength: 60,        // Recommended max buffer
          maxBufferSize: 60 * 1000 * 1000, // 60MB buffer size
          maxBufferHole: 0.5,           // Allow small gaps to prevent stalls
          lowBufferWatchdogPeriod: 0.5, // Check buffer every 0.5s
          highBufferWatchdogPeriod: 3,  // Less frequent checks when healthy
          nudgeMaxRetry: 3,             // Limited nudging for stalls
          nudgeOffset: 0.1,             // Small nudge offset
          maxFragLookUpTolerance: 0.25, // 250ms tolerance
          startFragPrefetch: true,      // Prefetch start fragment
          testBandwidth: false,         // Disable bandwidth test
          progressive: false,           // Standard mode
          lowLatencyMode: false,        // Better stability
          backBufferLength: 60,         // Longer back buffer
          liveSyncDurationCount: 4,     // 4 segments for better sync
          manifestLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 3,
          manifestLoadingRetryDelay: 500,
          fragLoadingTimeOut: 20000,    // 20s timeout for segments
          fragLoadingMaxRetry: 6,       // More retries for segments
          fragLoadingRetryDelay: 1000,  // 1s between retries
          levelLoadingTimeOut: 10000,
          levelLoadingMaxRetry: 4,
          levelLoadingRetryDelay: 1000
        });
        
        hls.on(Hls.Events.ERROR, function (event, data) {
          console.error('HLS Error:', event, data);
        });
        
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        
        return () => {
          hls.destroy();
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS support - note: Safari can't add headers to video src requests
        const token = localStorage.getItem('authToken');
        const streamUrlWithToken = token ? 
          `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : 
          streamUrl;
        video.src = streamUrlWithToken;
      }
    } else if (streamUrl) {
      // Direct video streaming (MP4, etc.) with auth token
      video.src = streamUrl;
    }
  }, [preview]);

  return (
    <div style={{
      width: '100%',
      maxWidth: '1200px',
      aspectRatio: '16/9',
      backgroundColor: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <video
        ref={videoRef}
        controls
        autoPlay
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}

// Preview Modal Component
function PreviewModal({ filePath, preview, type, onClose }) {
  const [isLoading, setIsLoading] = useState(preview?.status === 'processing' || !preview);
  const [currentPreview, setCurrentPreview] = useState(preview);
  
  // Update currentPreview when preview prop changes (from WebSocket updates)
  useEffect(() => {
    setCurrentPreview(preview);
    // Only show loading if actually processing - ignore error field if status is completed
    if (preview?.status && preview.status !== 'processing') {
      setIsLoading(false);
    }
  }, [preview]);
  
  // Fallback polling only if WebSocket is not connected
  useEffect(() => {
    // Only start polling if status is still processing after 5 seconds (fallback for WebSocket failure)
    if (preview?.status === 'processing') {
      const fallbackTimer = setTimeout(() => {
        if (currentPreview?.status === 'processing') {
          console.log('Starting fallback polling for preview status');
          const interval = setInterval(async () => {
            try {
              const response = await fetch(`${FileSystemAPI.baseURL}/preview/status/${preview?.cacheKey}`, {
                headers: FileSystemAPI.getAuthHeaders()
              });
              const result = await response.json();
              
              // Update current preview data with latest status and progress
              setCurrentPreview(result);
              
              if (result.status && result.status !== 'processing' && result.status !== 'progressive_ready') {
                setIsLoading(false);
                clearInterval(interval);
              } else if (result.status === 'progressive_ready') {
                // Keep polling for progress updates while progressive_ready
                setIsLoading(false);
              }
            } catch (error) {
              console.error('Error checking preview status:', error);
            }
          }, 2000);
          return () => clearInterval(interval);
        }
      }, 5000);
      
      return () => clearTimeout(fallbackTimer);
    }
  }, [preview?.cacheKey, preview?.status]);

  const renderPreviewContent = () => {
    if (!preview) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '400px',
          color: '#ef4444'
        }}>
          <div style={{ fontSize: '18px' }}>Preview data not available</div>
        </div>
      );
    }

    // Only show processing if truly processing, not if completed with errors
    if ((isLoading && currentPreview?.status !== 'completed') || currentPreview?.status === 'processing') {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '400px',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #3b82f6',
            borderTop: '3px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <div style={{ color: '#e4e4e7', fontSize: '16px' }}>
            Processing {type} preview...
          </div>
          <div style={{ color: '#a1a1aa', fontSize: '14px' }}>
            Progress: {currentPreview?.progress || 0}%
          </div>
        </div>
      );
    }

    if (currentPreview?.status === 'failed') {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '400px',
          flexDirection: 'column',
          gap: '16px',
          color: '#ef4444'
        }}>
          <div style={{ fontSize: '48px' }}>⚠️</div>
          <div style={{ fontSize: '18px' }}>Preview generation failed</div>
          <div style={{ fontSize: '14px', color: '#a1a1aa' }}>
            {currentPreview?.error || 'Unknown error occurred'}
          </div>
        </div>
      );
    }

    // Render video preview based on status
    if (type === 'video') {
      if (currentPreview?.status === 'processing') {
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '400px',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <div style={{ 
              fontSize: '48px',
              animation: 'spin 2s linear infinite'
            }}>
              🎬
            </div>
            <div style={{ fontSize: '18px', color: '#e4e4e7' }}>
              Transcoding video preview...
            </div>
            {currentPreview?.progress && (
              <div style={{ width: '300px' }}>
                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#3a3a3a',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${currentPreview.progress}%`,
                    height: '100%',
                    backgroundColor: '#3b82f6',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <div style={{
                  marginTop: '8px',
                  fontSize: '14px',
                  color: '#a1a1aa',
                  textAlign: 'center'
                }}>
                  {Math.round(currentPreview.progress)}% complete
                </div>
              </div>
            )}
            <div style={{ 
              fontSize: '14px', 
              color: '#a1a1aa',
              textAlign: 'center',
              maxWidth: '400px'
            }}>
              Please wait while we prepare your video for optimal streaming...
            </div>
          </div>
        );
      }
      
      if (currentPreview?.status === 'completed') {
        return <VideoPlayer preview={currentPreview} />;
      }
    }

    if (type === 'image') {
      console.log('Rendering image preview:', preview);
      let imageUrl = preview?.previewUrl || preview?.directUrl;
      
      // Ensure URL has the correct base path and add auth token
      if (imageUrl && !imageUrl.startsWith('http')) {
        const fullUrl = `${FileSystemAPI.baseURL.replace('/api', '')}${imageUrl}`;
        // Add auth token for image preview URLs
        const token = localStorage.getItem('authToken');
        if (token) {
          const separator = fullUrl.includes('?') ? '&' : '?';
          imageUrl = `${fullUrl}${separator}token=${token}`;
        } else {
          imageUrl = fullUrl;
        }
      }
      
      console.log('Image URL:', imageUrl);
      
      return (
        <img
          src={imageUrl}
          alt="Preview"
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: '80vh',
            objectFit: 'contain'
          }}
          onError={(e) => {
            console.error('Image failed to load:', e.target.src);
          }}
        />
      );
    }

    if (type === 'audio') {
      let audioUrl = preview?.previewUrl || preview?.directUrl;
      
      // Check for error conditions
      if (currentPreview?.error || !audioUrl) {
        return (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '400px',
            flexDirection: 'column',
            gap: '16px',
            color: '#ef4444'
          }}>
            <div style={{ fontSize: '48px' }}>🔊</div>
            <div style={{ fontSize: '18px' }}>Audio preview unavailable</div>
            <div style={{ fontSize: '14px', color: '#a1a1aa' }}>
              {currentPreview?.error || 'Audio URL not found'}
            </div>
          </div>
        );
      }
      
      // Add auth token for audio preview URLs
      if (audioUrl && !audioUrl.startsWith('http')) {
        const token = localStorage.getItem('authToken');
        if (token) {
          const separator = audioUrl.includes('?') ? '&' : '?';
          audioUrl = `${audioUrl}${separator}token=${token}`;
        }
      }
      
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          flexDirection: 'column',
          gap: '20px',
          padding: '20px',
          width: '100%'
        }}>
          <div style={{
            fontSize: '18px',
            color: '#e4e4e7',
            marginBottom: '10px'
          }}>
            Audio Preview
          </div>
          <audio
            controls
            autoPlay
            muted={/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)}
            style={{
              width: '100%',
              maxWidth: '800px',
              minWidth: '600px',
              height: '54px'
            }}
            onError={(e) => {
              console.error('Audio failed to load:', e.target.src);
            }}
            onLoadedData={(e) => {
              // For Safari, try to play and unmute after user interaction
              if (/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)) {
                e.target.muted = false;
              }
            }}
          >
            <source src={audioUrl} type="audio/mpeg" />
            <source src={audioUrl} type="audio/wav" />
            <source src={audioUrl} type="audio/ogg" />
            <source src={audioUrl} type="audio/flac" />
            <source src={audioUrl} type="audio/aac" />
            Your browser does not support the audio element.
          </audio>
        </div>
      );
    }

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        color: '#a1a1aa'
      }}>
        Preview not available for this file type
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: '#1a1a1a',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: type === 'audio' ? '900px' : type === 'video' ? '1250px' : '90vw',
        minWidth: type === 'audio' ? '800px' : type === 'video' ? '800px' : 'auto',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid #2a2a2a'
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '12px',
          borderBottom: '1px solid #2a2a2a'
        }}>
          <div>
            <h3 style={{
              margin: 0,
              color: '#e4e4e7',
              fontSize: '18px',
              fontWeight: '600'
            }}>
              {filePath.split('/').pop()}
            </h3>
            <p style={{
              margin: '4px 0 0 0',
              color: '#a1a1aa',
              fontSize: '14px'
            }}>
              {type.charAt(0).toUpperCase() + type.slice(1)} Preview
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        {renderPreviewContent()}
      </div>
    </div>
  );
}

const BrowserView = ({ user, onLogout }) => {
  const [treeData, setTreeData] = useState([]);
  const [currentPath, setCurrentPath] = useState(process.env.REACT_APP_LUCIDLINK_MOUNT_POINT || '/media/lucidlink-1');
  const [currentFilespace, setCurrentFilespace] = useState(null);
  const [currentFilespaceMount, setCurrentFilespaceMount] = useState(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [showJobPanel, setShowJobPanel] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [hoveredRow, setHoveredRow] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [elasticsearchAvailable, setElasticsearchAvailable] = useState(false);
  const [showSearchTooltip, setShowSearchTooltip] = useState(false);
  const [directorySizes, setDirectorySizes] = useState({});
  const [loadingSizes, setLoadingSizes] = useState(new Set());
  const [networkStats, setNetworkStats] = useState(null);
  const [cacheUsage, setCacheUsage] = useState({ 
    used: 0, 
    total: 100,
    bytesUsed: 0,
    totalSpace: 0,
    loading: true 
  }); // Real Varnish cache stats
  const [directLinkLoading, setDirectLinkLoading] = useState(new Set());
  const [previewLoading, setPreviewLoading] = useState(new Set());
  const [ruiStatus, setRuiStatus] = useState(new Map()); // Map file paths to RUI status
  const [previewModal, setPreviewModal] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const treeRef = useRef();
  const searchTimeoutRef = useRef(null);
  const currentPathRef = useRef(currentPath);
  
  // Update the ref whenever currentPath changes
  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  // Add CSS keyframes for spinner animation
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Load root directories and setup WebSocket
  useEffect(() => {
    loadRoots();
    loadJobs();
    loadCacheStats();
    checkElasticsearchStatus();
    
    // Enhanced WebSocket connection with auto-reconnect and fallback polling
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3002';
    // Handle relative WebSocket URLs
    const getWebSocketUrl = () => {
      if (wsUrl.startsWith('/')) {
        // Convert relative path to absolute WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}${wsUrl}`;
      }
      return wsUrl;
    };

    let ws = null;
    let reconnectTimer = null;
    let fallbackPollingTimer = null;
    let isConnected = false;

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(getWebSocketUrl());
        
        ws.onopen = () => {
          console.log('WebSocket connected');
          isConnected = true;
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          if (fallbackPollingTimer) {
            clearInterval(fallbackPollingTimer);
            fallbackPollingTimer = null;
          }
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data.type, data);
            
            if (data.type === 'job-update' || data.type === 'job-created' || 
                data.type === 'cache-job-started' || data.type === 'cache-job-progress' || 
                data.type === 'cache-job-completed') {
              
              // For job-created and job-update, the job is in data.job
              // For cache-job-* events, we need to fetch the updated job
              if (data.job) {
                setJobs(prevJobs => {
                  const jobIndex = prevJobs.findIndex(j => j.id === data.job.id);
                  if (jobIndex >= 0) {
                    const updatedJobs = [...prevJobs];
                    updatedJobs[jobIndex] = data.job;
                    return updatedJobs;
                  } else {
                    return [...prevJobs, data.job];
                  }
                });
              } else if (data.jobId) {
                // For cache-job-* events, refresh the job list
                loadJobs();
              }
              
              // When a cache job completes, refresh the current directory to update CACHED status
              if (data.type === 'cache-job-completed') {
                console.log('Cache job completed, refreshing current directory:', currentPathRef.current);
                loadDirectory(currentPathRef.current);
                // Also refresh cache stats to update usage
                loadCacheStats();
              }
            } else if (data.type === 'index-progress') {
              setJobs(prevJobs => {
                const jobIndex = prevJobs.findIndex(j => j.id === data.jobId);
                if (jobIndex >= 0) {
                  const updatedJobs = [...prevJobs];
                  updatedJobs[jobIndex] = {
                    ...updatedJobs[jobIndex],
                    processedItems: data.processedItems,
                    totalItems: data.totalItems,
                    currentPath: data.currentPath
                  };
                  return updatedJobs;
                }
                return prevJobs;
              });
            } else if (data.type === 'index-complete') {
              console.log('Index complete event received:', data);
              loadRoots(); // Reload tree to show indexed status
              loadJobs(); // Reload jobs to get final status
              
              // Show completion toast with summary and duration
              const totalFiles = data.totalFiles || 0;
              const indexedFiles = data.indexedFiles || 0;
              const skippedFiles = data.skippedFiles || 0;
              const deletedFiles = data.deletedFiles || 0;
              const duration = data.duration || 5000;
              
              // Format duration
              const formatDuration = (ms) => {
                const seconds = Math.floor(ms / 1000);
                const minutes = Math.floor(seconds / 60);
                const hours = Math.floor(minutes / 60);
                
                if (hours > 0) {
                  return `${hours}h ${minutes % 60}m`;
                } else if (minutes > 0) {
                  return `${minutes}m ${seconds % 60}s`;
                } else {
                  return `${seconds}s`;
                }
              };
              
              // Build message with deletion info if applicable
              let message = `Indexing complete: ${indexedFiles.toLocaleString()} files indexed, ${skippedFiles.toLocaleString()} skipped`;
              if (deletedFiles > 0) {
                message += `, ${deletedFiles.toLocaleString()} deleted`;
              }
              message += `. Duration: ${formatDuration(duration)}`;
              
              showToast(message, 'success', 5000); // 5 seconds for stats readability
              
              // Refresh the current directory to show updated data
              if (currentPath && currentPath !== '/') {
                loadDirectory(currentPath);
              }
            } else if (data.type === 'lucidlink-stats') {
              // The stats are in the data object directly, not in data.stats
              setNetworkStats(data);
            } else if (data.type === 'varnish-stats') {
              // Stats are sent directly in the data object, not in data.stats
              setCacheUsage({
                used: data.usagePercentage || 0,
                total: 100,
                bytesUsed: data.bytesUsed || 0,
                totalSpace: data.totalSpace || 0,
                loading: false
              });
            } else if (data.type === 'preview-update') {
              // Handle preview status updates via WebSocket
              if (data.cacheKey && previewModal?.preview?.cacheKey === data.cacheKey) {
                setPreviewModal(prev => ({
                  ...prev,
                  preview: data.data
                }));
              }
            } else if (data.type === 'rui-update') {
              setRuiStatus(prevStatus => {
                const newStatus = new Map(prevStatus);
                if (data.status === 'uploading') {
                  newStatus.set(data.filePath, 'uploading');
                } else {
                  newStatus.delete(data.filePath);
                }
                return newStatus;
              });
            } else if (data.type === 'video-preview-job-started' || 
                       data.type === 'video-preview-job-progress' || 
                       data.type === 'video-preview-job-completed' ||
                       data.type === 'video-preview-job-failed') {
              // Handle video preview job updates
              console.log('Video preview job event:', data.type, data);
              if (data.jobId) {
                // Refresh the job list to get updated status
                loadJobs();
              }
              
              // Show toast for completion/failure
              if (data.type === 'video-preview-job-completed') {
                showToast(`Video preview job completed`, 'success');
              } else if (data.type === 'video-preview-job-failed') {
                showToast(`Video preview job failed: ${data.error || 'Unknown error'}`, 'error');
              }
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        ws.onclose = () => {
          console.log('WebSocket disconnected');
          isConnected = false;
          if (!reconnectTimer) {
            reconnectTimer = setTimeout(connectWebSocket, 3000);
          }
          
          // Start fallback polling after WebSocket disconnects
          if (!fallbackPollingTimer) {
            fallbackPollingTimer = setInterval(() => {
              console.log('Fallback polling for job updates');
              loadJobs();
              loadCacheStats();
            }, 5000);
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(connectWebSocket, 5000);
        }
      }
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (fallbackPollingTimer) {
        clearInterval(fallbackPollingTimer);
      }
    };
  }, []);

  window._formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  // Utility function to get authorization headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const loadRoots = async () => {
    try {
      const roots = await FileSystemAPI.getRoots();
      const treeNodes = roots.map(root => ({
        ...root,
        id: root.path,
        children: null, // Lazy load children
        data: {
          ...root,
          isFilespaceRoot: true,
          filespace_id: root.filespace_id,
          filespace_name: root.filespace_name
        }
      }));
      setTreeData(treeNodes);
      
      // Load the first accessible root as the default
      const accessibleRoot = roots.find(root => root.isDirectory);
      if (accessibleRoot && (currentPath === '/' || currentPath === (process.env.REACT_APP_LUCIDLINK_MOUNT_POINT || '/media/lucidlink-1'))) {
        loadDirectory(accessibleRoot.path, accessibleRoot.filespace_id);
      }
    } catch (error) {
      console.error('Failed to load roots:', error);
    }
  };

  const loadChildren = async (node) => {
    if (!node || !node.data) {
      console.error('loadChildren called with invalid node:', node);
      return [];
    }
    
    try {
      const files = await FileSystemAPI.getFiles(node.data.path, node.data.filespace_id);
      const children = files
        .filter(file => file.isDirectory)
        .map(file => ({
          ...file,
          id: file.path,
          children: null, // Lazy load children
          data: {
            ...file,
            filespace_id: node.data.filespace_id || file.filespace_id,
            filespace_name: node.data.filespace_name || file.filespace_name
          }
        }));
      return children;
    } catch (error) {
      console.error('Failed to load children for path:', node.data.path, error);
      return [];
    }
  };

  const handleNodeClick = async (node) => { 
    if (node && node.data) {
      // Auto-detect filespace from selected tree node
      if (node.data.filespace_id) {
        setCurrentFilespace(node.data.filespace_id);
        setCurrentFilespaceMount(node.data.isFilespaceRoot ? 
          node.data.path : 
          getFilespaceMount(node.data.filespace_id));
      }
      
      await loadDirectory(node.data.path, node.data.filespace_id);
    } else {
      console.warn('handleNodeClick called with invalid node:', node);
    }
  };

  // Helper function to get filespace mount point by ID
  const getFilespaceMount = (filespaceId) => {
    const root = treeData.find(node => 
      node.data && node.data.filespace_id === filespaceId && node.data.isFilespaceRoot
    );
    return root ? root.path : null;
  };

  const loadDirectory = async (path, filespaceId = null) => {
    if (!path || typeof path !== 'string') {
      console.error('loadDirectory called with invalid path:', path);
      return;
    }
    
    try {
      setCurrentPath(path);
      setSearchResults(null); // Clear search when navigating
      setSearchQuery(''); // Clear search query
      clearSearch();
      
      const files = await FileSystemAPI.getFiles(path, filespaceId);
      setFiles(files);
      
      // Load directory sizes for visible directories in the current view
      loadDirectorySizes(files);
    } catch (error) {
      console.error('Failed to load directory:', error);
    }
  };

  const loadJobs = async () => {
    try {
      const jobs = await FileSystemAPI.getJobs();
      setJobs(jobs);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  const loadCacheStats = async () => {
    console.log('Loading cache stats...');
    setCacheUsage(prev => ({ ...prev, loading: true }));
    try {
      const stats = await FileSystemAPI.getCacheStats();
      console.log('Cache stats received:', stats);
      setCacheUsage({
        used: stats.usagePercentage || stats.used_percent || 0,
        total: 100,
        bytesUsed: stats.bytesUsed || stats.bytes_used || 0,
        totalSpace: stats.totalSpace || stats.total_space || 0,
        loading: false
      });
    } catch (error) {
      console.error('Failed to load cache stats:', error);
      setCacheUsage(prev => ({ ...prev, loading: false }));
    }
  };

  const handleItemSelection = (path, checked) => {
    const newSelection = new Set(selectedItems);
    if (checked) {
      newSelection.add(path);
    } else {
      newSelection.delete(path);
    }
    setSelectedItems(newSelection);
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const allPaths = getFilteredFiles().map(file => file.path);
      setSelectedItems(new Set(allPaths));
    } else {
      setSelectedItems(new Set());
    }
  };

  const executeAction = async (action) => {
    if (!selectedFile) return;
    
    try {
      const result = await FileSystemAPI.executeScript(selectedFile.path, [action]);
      console.log('Script executed:', result);
    } catch (error) {
      console.error('Failed to execute script:', error);
    }
  };

  const addToJobQueue = async () => {
    if (selectedItems.size === 0) return;
    
    try {
      const selectedPaths = Array.from(selectedItems);
      
      // Flatten files: if a directory is selected, get all files within it
      const allFilePaths = [];
      let allDirectories = [];
      
      const collectFiles = async (filePath) => {
        const currentFile = getFilteredFiles().find(f => f.path === filePath);
        if (!currentFile) return;
        
        if (currentFile.isDirectory) {
          allDirectories.push(filePath);
          try {
            const dirFiles = await FileSystemAPI.getFiles(filePath);
            for (const file of dirFiles) {
              if (file.isDirectory) {
                await collectFiles(file.path);
              } else {
                allFilePaths.push(file.path);
              }
            }
          } catch (error) {
            console.error(`Failed to load directory ${filePath}:`, error);
          }
        } else {
          allFilePaths.push(filePath);
        }
      };
      
      for (const path of selectedPaths) {
        await collectFiles(path);
      }
      
      // Remove duplicates from directories
      allDirectories = [...new Set(allDirectories)];
      
      console.log('Adding to job queue:', allFilePaths);
      console.log('All directories to mark as cached:', allDirectories);
      
      // Send to backend cache job endpoint
      const response = await fetch(`${FileSystemAPI.baseURL}/jobs/cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...FileSystemAPI.getAuthHeaders()
        },
        body: JSON.stringify({
          filePaths: allFilePaths,
          directories: allDirectories
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Cache job created:', result);
        loadJobs(); // Refresh jobs list
        showToast(`Cache job created with ${result.totalFiles || allFilePaths.length} files`);
      } else {
        const errorData = await response.json();
        console.error('Failed to create cache job:', errorData);
        alert(`Failed to create cache job: ${errorData.error || 'Unknown error'}`);
      }
      
      // Clear selection
      setSelectedItems(new Set());
      
    } catch (error) {
      console.error('Failed to add to job queue:', error);
    }
  };

  // Helper functions for video preview queue
  const isVideoFile = (file) => {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.r3d', '.braw', '.mxf', '.mpg', '.mpeg', '.m4v', '.wmv', '.flv'];
    const ext = file.extension?.toLowerCase() || '';
    return videoExtensions.includes(ext);
  };

  const hasSelectedVideos = () => {
    return Array.from(selectedItems).some(path => {
      const file = getFilteredFiles().find(f => f.path === path);
      // Check if it's a video file OR a directory (which might contain videos)
      return file && (file.isDirectory || isVideoFile(file));
    });
  };

  const countSelectedVideos = () => {
    // Count individual video files and directories
    const items = Array.from(selectedItems);
    let videoCount = 0;
    let dirCount = 0;
    
    items.forEach(path => {
      const file = getFilteredFiles().find(f => f.path === path);
      if (file) {
        if (file.isDirectory) {
          dirCount++;
        } else if (isVideoFile(file)) {
          videoCount++;
        }
      }
    });
    
    // If we have directories, show directory count instead
    if (dirCount > 0) {
      return `${dirCount} dir${dirCount > 1 ? 's' : ''}`;
    }
    return videoCount;
  };

  const addToVideoPreviewQueue = async () => {
    if (!hasSelectedVideos()) return;
    
    try {
      const selectedPaths = Array.from(selectedItems);
      
      // Collect video files
      const videoFilePaths = [];
      let directories = [];
      
      const collectVideoFiles = async (filePath) => {
        const currentFile = getFilteredFiles().find(f => f.path === filePath);
        if (!currentFile) return;
        
        if (currentFile.isDirectory) {
          directories.push(filePath);
          try {
            const dirFiles = await FileSystemAPI.getFiles(filePath);
            for (const file of dirFiles) {
              if (file.isDirectory) {
                await collectVideoFiles(file.path);
              } else if (isVideoFile(file)) {
                videoFilePaths.push(file.path);
              }
            }
          } catch (error) {
            console.error(`Failed to load directory ${filePath}:`, error);
          }
        } else if (isVideoFile(currentFile)) {
          videoFilePaths.push(filePath);
        }
      };
      
      for (const path of selectedPaths) {
        await collectVideoFiles(path);
      }
      
      if (videoFilePaths.length === 0) {
        alert('No video files selected');
        return;
      }
      
      // Remove duplicates
      directories = [...new Set(directories)];
      
      console.log('Adding to video preview queue:', videoFilePaths);
      
      // Send to backend video preview job endpoint
      const response = await fetch(`${FileSystemAPI.baseURL}/jobs/video-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...FileSystemAPI.getAuthHeaders()
        },
        body: JSON.stringify({
          filePaths: videoFilePaths,
          directories: directories
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Video preview job created:', result);
        
        // Clear selection
        setSelectedItems(new Set());
        
        // Refresh jobs to show the new video preview job
        loadJobs();
        
        // Show success message
        showToast(`Added ${result.fileCount} video${result.fileCount !== 1 ? 's' : ''} to preview queue`);
      } else {
        const errorText = await response.text();
        console.error('Failed to create video preview job:', errorText);
        alert(`Failed to create video preview job: ${errorText}`);
      }
    } catch (error) {
      console.error('Failed to add to video preview queue:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Clear completed jobs
  const clearJobs = async () => {
    try {
      const response = await fetch(`${FileSystemAPI.baseURL}/jobs/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...FileSystemAPI.getAuthHeaders()
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Jobs cleared successfully:', result);
        loadJobs(); // Refresh the jobs list
        showToast(`${result.deletedCount} completed jobs cleared`);
      } else {
        const errorData = await response.json();
        console.error('Failed to clear jobs:', errorData);
        alert(`Failed to clear jobs: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error clearing jobs:', error);
      alert(`Error clearing jobs: ${error.message}`);
    }
  };

  const generateDirectLink = async (filePath) => {
    if (directLinkLoading.has(filePath)) {
      return; // Already processing this file
    }

    try {
      // Mark as loading
      setDirectLinkLoading(prev => new Set(prev).add(filePath));

      const response = await fetch(`${FileSystemAPI.baseURL.replace('/api', '')}/api/direct-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...FileSystemAPI.getAuthHeaders()
        },
        body: JSON.stringify({ filePath })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.directLink || result.directUrl) {
        const url = result.directLink || result.directUrl;
        
        // Open the direct link in a new tab
        window.open(url, '_blank');
        showToast('Opening Direct Link');
        
        console.log('Direct link generated and opened:', url);
      } else {
        throw new Error('No direct URL received from server');
      }
    } catch (error) {
      console.error('Error generating direct link:', error);
      showToast('Failed to generate direct link', 'error');
    } finally {
      // Remove loading state
      setDirectLinkLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  };

  const openPreview = async (filePath) => {
    if (previewLoading.has(filePath)) {
      return; // Already processing this file
    }

    try {
      // Mark as loading
      setPreviewLoading(prev => new Set(prev).add(filePath));

      const response = await fetch(`${FileSystemAPI.baseURL}/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...FileSystemAPI.getAuthHeaders()
        },
        body: JSON.stringify({ filePath })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      // Determine preview type based on file extension
      const ext = filePath.toLowerCase().split('.').pop();
      let previewType = 'unknown';
      
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'psd', 'dpx', 'exr'].includes(ext)) {
        previewType = 'image';
      } else if (['mp4', 'mov', 'avi', 'mkv', 'm4v', 'mxf', 'braw', 'r3d'].includes(ext)) {
        previewType = 'video';
      } else if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) {
        previewType = 'audio';
      }
      
      // Open preview modal
      setPreviewModal({
        filePath,
        preview: result,
        type: previewType
      });
      
      console.log('Preview opened:', result);
    } catch (error) {
      console.error('Error opening preview:', error);
      showToast(`Error: ${error.message}`, 'error');
    } finally {
      // Remove loading state
      setPreviewLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(filePath);
        return newSet;
      });
    }
  };

  const showToast = (message, type = 'success', duration = 3000) => {
    setToastMessage({ text: message, type });
    setTimeout(() => setToastMessage(null), duration);
  };

  const cancelJob = async (jobId) => {
    try {
      const response = await fetch(`${FileSystemAPI.baseURL}/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...FileSystemAPI.getAuthHeaders()
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Job cancelled successfully:', result);
        loadJobs(); // Refresh the jobs list
        showToast('Job cancelled successfully');
      } else {
        const errorData = await response.json();
        console.error('Failed to cancel job:', errorData);
        alert(`Failed to cancel job: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
      alert(`Error cancelling job: ${error.message}`);
    }
  };

  // Check Elasticsearch availability
  const checkElasticsearchStatus = async () => {
    try {
      const response = await fetch(`${FileSystemAPI.baseURL}/search/elasticsearch/availability`, {
        headers: FileSystemAPI.getAuthHeaders()
      });
      if (response.ok) {
        const status = await response.json();
        setElasticsearchAvailable(status.available);
      } else {
        setElasticsearchAvailable(false);
      }
    } catch (error) {
      console.error('Error checking Elasticsearch status:', error);
      setElasticsearchAvailable(false);
    }
  };

  // Handle filter click - special handling for uploading filter
  const handleFilterClick = async (filterKey) => {
    if (filterKey === 'uploading') {
      // Fetch all uploading files from the backend
      setIsSearching(true);
      setActiveFilter(filterKey);
      
      try {
        const response = await fetch(`${FileSystemAPI.baseURL}/rui/uploading`, {
          headers: FileSystemAPI.getAuthHeaders()
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch uploading files');
        }
        
        const uploadingFiles = await response.json();
        
        // Transform the data to match the expected file format
        const transformedFiles = uploadingFiles.map(file => ({
          ...file,
          name: file.path.split('/').pop(),
          isDirectory: false,
          extension: '.' + (file.path.split('.').pop() || ''),
          cached: false
        }));
        
        setSearchResults(transformedFiles);
        setSearchQuery('All Uploading Files');
        console.log('Loaded uploading files:', transformedFiles);
      } catch (error) {
        console.error('Error fetching uploading files:', error);
        setSearchError('Failed to fetch uploading files');
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
      return;
    }
    
    // Regular filter handling
    setActiveFilter(filterKey);
    // Don't clear search results - let filters work on them
  };

  // Search functionality
  const performSearch = async (query, offset = 0, append = false) => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    
    try {
      const limit = 50; // Fixed page size
      const endpoint = elasticsearchAvailable ? '/search/elasticsearch' : '/search';
      const response = await fetch(`${FileSystemAPI.baseURL}${endpoint}?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`, {
        headers: FileSystemAPI.getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Both endpoints now return {results: [...], verification: {...}} format
        const results = data.results || data; // Fallback for backward compatibility
        
        // Log verification info if available
        if (data.verification && data.verification.staleCount > 0) {
          console.log(`Search verification: ${data.verification.staleCount} stale entries removed, ${data.verification.verifiedCount} results verified`);
        }
        
        if (append && searchResults) {
          setSearchResults([...searchResults, ...results]);
        } else {
          setSearchResults(results);
        }
        
        setHasMoreResults(results.length === limit);
        setSearchOffset(offset + results.length);
      } else {
        const errorText = await response.text();
        setSearchError(`Search failed: ${errorText}`);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchError(`Search error: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInputChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Clear any existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set a new timeout for search
    searchTimeoutRef.current = setTimeout(() => {
      if (query.trim()) {
        setActiveFilter('all'); // Reset filter when searching
        performSearch(query);
      } else {
        setSearchResults(null);
        setSearchError(null);
      }
    }, 300); // 300ms debounce
  };

  const handleLoadMore = () => {
    if (searchQuery && !isSearching) {
      performSearch(searchQuery, searchOffset, true);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
  };

  // Indexing functions
  const startIndexing = async () => {
    try {
      const response = await fetch(`${FileSystemAPI.baseURL}/index/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...FileSystemAPI.getAuthHeaders()
        },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Indexing started:', result);
        // Refresh jobs to show the new index job
        loadJobs();
      } else {
        const errorData = await response.text();
        console.error('Failed to start indexing:', response.status, errorData);
        alert(`Failed to start indexing: ${errorData}`);
      }
    } catch (error) {
      console.error('Error starting indexing:', error);
      alert(`Error starting indexing: ${error.message}`);
    }
  };

  // Load directory sizes for visible directories
  const loadDirectorySizes = async (directories) => {
    if (!Array.isArray(directories)) {
      console.warn('loadDirectorySizes called with non-array:', directories);
      return;
    }
    
    const directoriesToLoad = directories.filter(dir => 
      dir.isDirectory && 
      !directorySizes[dir.path] && 
      !loadingSizes.has(dir.path)
    );

    if (directoriesToLoad.length === 0) return;

    const paths = directoriesToLoad.map(d => d.path);
    
    // Mark as loading
    setLoadingSizes(prev => {
      const newSet = new Set(prev);
      paths.forEach(path => newSet.add(path));
      return newSet;
    });

    try {
      const response = await fetch(`${FileSystemAPI.baseURL}/directory-sizes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...FileSystemAPI.getAuthHeaders()
        },
        body: JSON.stringify({ paths })
      });

      if (response.ok) {
        const results = await response.json();
        
        // Update directory sizes
        setDirectorySizes(prev => ({ ...prev, ...results }));
        
        // Mark as no longer loading
        setLoadingSizes(prev => {
          const newSet = new Set(prev);
          paths.forEach(path => newSet.delete(path));
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error loading directory sizes:', error);
      
      // Mark as no longer loading even on error
      setLoadingSizes(prev => {
        const newSet = new Set(prev);
        paths.forEach(path => newSet.delete(path));
        return newSet;
      });
    }
  };

  const renderFileIcon = (file, size = 16) => {
    if (file.isDirectory) {
      return <FolderIcon isOpen={false} size={size} />;
    }
    const type = getFileIconType(file);
    return <FileIcon type={type} size={size} />;
  };

  const getFilteredFiles = () => {
    // Determine the source file list (search results or current directory)
    let fileList;
    if (searchResults !== null) {
      fileList = Array.isArray(searchResults) ? searchResults : [];
    } else {
      fileList = Array.isArray(files) ? files : [];
    }
    
    // Apply filters to the file list
    if (activeFilter === 'all') return fileList;
    
    // Special handling for uploading filter - show search results
    if (activeFilter === 'uploading') return fileList;
    
    // Helper function to safely get lowercase extension
    const getExtension = (file) => {
      if (!file.extension) return null;
      return typeof file.extension === 'string' ? file.extension.toLowerCase() : null;
    };
    
    if (activeFilter === 'images') return fileList.filter(f => {
      const ext = getExtension(f);
      return ext && ['.jpg', '.png', '.gif', '.jpeg', '.webp', '.tif', '.tiff', '.psd', '.dpx', '.exr'].includes(ext);
    });
    if (activeFilter === 'videos') return fileList.filter(f => {
      const ext = getExtension(f);
      return ext && ['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.mxf', '.braw', '.r3d'].includes(ext);
    });
    if (activeFilter === 'audio') return fileList.filter(f => {
      const ext = getExtension(f);
      return ext && ['.mp3', '.wav', '.flac', '.aac'].includes(ext);
    });
    if (activeFilter === 'documents') return fileList.filter(f => {
      const ext = getExtension(f);
      return ext && ['.pdf', '.doc', '.docx', '.txt', '.md'].includes(ext);
    });
    if (activeFilter === 'cached') return fileList.filter(f => f.cached === true);
    if (activeFilter === 'other') return fileList.filter(f => {
      const ext = getExtension(f);
      return !f.isDirectory && ext && !['.jpg', '.png', '.gif', '.jpeg', '.webp', '.tif', '.tiff', '.psd', '.dpx', '.exr', '.mp4', '.mov', '.avi', '.mkv', '.m4v', '.mxf', '.braw', '.r3d', '.mp3', '.wav', '.flac', '.aac', '.pdf', '.doc', '.docx', '.txt', '.md'].includes(ext);
    });
    return fileList;
  };


  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="m3 5 0 14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>
              <path d="m3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>
            </svg>
            <span>
              TeamCache Manager
              <span style={styles.titleVersion}>v1.8.0</span>
            </span>
          </h1>
        </div>
        
        <div style={styles.headerCenter}>
          <div style={{...styles.searchContainer, position: 'relative'}}>
            <input
              type="text"
              placeholder={elasticsearchAvailable ? 
                "Search files... (supports AND, OR, NOT) - ES ON" : 
                "Search files... - ES OFF"
              }
              value={searchQuery}
              onChange={handleSearchInputChange}
              style={styles.searchInput}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6';
                if (elasticsearchAvailable) setShowSearchTooltip(true);
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#3a3a3a';
                setTimeout(() => setShowSearchTooltip(false), 200);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setShowSearchTooltip(false);
                  // Blur the input to remove focus, which also helps with mobile keyboards
                  e.target.blur();
                }
              }}
            />
            
            {/* Custom tooltip for search examples */}
            {elasticsearchAvailable && showSearchTooltip && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                right: '0',
                backgroundColor: '#2a2a2a',
                color: '#e4e4e7',
                padding: '12px',
                borderRadius: '0 0 8px 8px',
                fontSize: '12px',
                zIndex: 1000,
                border: '1px solid #3a3a3a',
                borderTop: 'none',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                lineHeight: '1.4'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#ffffff' }}>
                  Search Examples:
                </div>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, 1fr)', 
                  gap: '4px 12px', 
                  fontSize: '11px',
                  alignItems: 'start'
                }}>
                  <div>• <span style={{ color: '#9ca3af' }}>Farm</span></div>
                  <div>• <span style={{ color: '#9ca3af' }}>proxy</span></div>
                  <div>• <span style={{ color: '#9ca3af' }}>Farm AND Proxy</span></div>
                  <div>• <span style={{ color: '#9ca3af' }}>mp4 OR mov</span></div>
                  <div>• <span style={{ color: '#9ca3af' }}>NOT temp</span></div>
                  <div>• <span style={{ color: '#9ca3af' }}>Farm*</span></div>
                  <div>• <span style={{ color: '#9ca3af' }}>*.jpg</span></div>
                  <div>• <span style={{ color: '#9ca3af' }}>/media/videos</span></div>
                </div>
              </div>
            )}
            {searchQuery ? (
              <button
                onClick={clearSearch}
                style={styles.clearSearchButton}
                title="Clear search"
              >
                ✕
              </button>
            ) : (
              <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 21L16.5 16.5M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            
            {/* Search error message */}
            {searchError && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: '0',
                right: '0',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: '0 0 6px 6px',
                fontSize: '12px',
                zIndex: 1000,
                border: '1px solid #dc2626',
                borderTop: 'none'
              }}>
                {searchError}
              </div>
            )}
          </div>
        </div>
        
        <div style={styles.headerRight}>
          <div style={styles.statusArea}>
          </div>
          
          {/* Network Stats */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: '12px',
            color: '#a1a1aa',
            marginRight: '12px',
            marginLeft: '30px',
            padding: '4px 8px',
            border: '1px solid #3a3a3a',
            borderRadius: '6px',
            backgroundColor: 'rgba(26, 26, 26, 0.5)'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}>
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="m12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span style={{
              display: 'inline-block',
              width: '275px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              position: 'relative'
            }}>
              GET speed:
              <span style={{
                position: 'absolute',
                right: '0',
                top: '0',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#ffffff',
                fontWeight: '500'
              }}>
                <span style={{
                  textAlign: 'right',
                  minWidth: '95px'
                }}>
                  {networkStats ? (
                    networkStats.getMibps !== undefined ? 
                      `${networkStats.getMibps.toFixed(2)} MiB/s` :
                      `${networkStats.rxMbps.toFixed(1)}↓ ${networkStats.txMbps.toFixed(1)}↑ MB/s`
                  ) : '00.00 MiB/s'}
                </span>
                {networkStats && networkStats.getTimeMs !== undefined && (
                  <span style={{
                    textAlign: 'right',
                    minWidth: '85px',
                    color: '#a1a1aa',
                    fontSize: '11px'
                  }}>
                    {networkStats.getTimeMs.toFixed(1)}ms
                  </span>
                )}
              </span>
            </span>
          </div>
          
          {/* Cache Usage Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginRight: '16px'
          }}>
            <span style={{
              fontSize: '12px',
              color: '#a1a1aa',
              whiteSpace: 'nowrap'
            }}>
              Cached data:
            </span>
            <span style={{
              fontSize: '12px',
              color: '#a1a1aa',
              whiteSpace: 'nowrap'
            }}>
              {cacheUsage.loading ? '...' : formatBytes(cacheUsage.bytesUsed)}
            </span>
            <div style={{
              width: '120px',
              height: '14px',
              backgroundColor: '#2a2a2a',
              borderRadius: '7px',
              position: 'relative'
            }}>
              <div style={{
                width: `${cacheUsage.used}%`,
                height: '100%',
                backgroundColor: cacheUsage.used > 80 ? '#ef4444' : cacheUsage.used > 60 ? '#f59e0b' : '#22c55e',
                borderRadius: '7px',
                transition: 'width 0.3s ease, background-color 0.3s ease'
              }} />
            </div>
            <span style={{
              fontSize: '11px',
              color: '#71717a',
              minWidth: '30px'
            }}>
              {cacheUsage.loading ? '...' : `${cacheUsage.used.toFixed(1)}%`}
            </span>
          </div>
          
          <button
            style={{
              ...styles.button,
              padding: '6px 8px',
              minWidth: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={loadCacheStats}
            title="Refresh cache stats"
          >
            <img 
              src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' /%3E%3C/svg%3E"
              alt="Refresh"
              style={{
                width: '16px',
                height: '16px',
                filter: 'brightness(0.9)',
                display: 'block'
              }}
            />
          </button>
          
          <button
            style={{
              ...styles.button,
              minWidth: '110px',
              justifyContent: 'center'
            }}
            onClick={async () => {
              await startIndexing();
              setShowJobPanel(true); // Open jobs panel to show progress
            }}
          >
            Index Files
          </button>
          
          <button
            style={{
              ...styles.button,
              minWidth: 'auto',
              padding: '5px 8px 6px 8px',
              lineHeight: 0,
              fontSize: 0
            }}
            onClick={() => {
              const grafanaUrl = process.env.REACT_APP_GRAFANA_URL || 
                `${window.location.protocol}//${window.location.hostname}:3000`;
              window.open(grafanaUrl, '_blank');
            }}
            title="Open Grafana Dashboard"
          >
            <img 
              src="/Grafana_icon.svg" 
              alt="Grafana" 
              style={{
                width: '16px',
                height: '16px',
                filter: 'brightness(0.9)',
                display: 'block'
              }}
            />
          </button>
          
          <button
            style={{
              ...styles.button,
              ...(jobs.some(j => j.status === 'running') ? styles.primaryButton : {}),
            }}
            onClick={() => setShowJobPanel(!showJobPanel)}
          >
            ⟲ Jobs ({jobs.filter(j => j.status === 'running').length})
          </button>
          
          {/* User status and logout */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginLeft: '16px',
            gap: '12px'
          }}>
            <div style={{
              fontSize: '12px',
              color: '#a1a1aa',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {user?.username || 'admin'}
            </div>
            <button
              style={{
                padding: '6px 12px',
                borderRadius: '4px',
                border: '1px solid #3a3a3a',
                backgroundColor: '#2a2a2a',
                color: '#e4e4e7',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
              onClick={onLogout}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#3a3a3a'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#2a2a2a'}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      
      <div style={styles.mainContent}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarSection}>
            <TabNavigation />
          </div>
          <div style={styles.treeContainer}>
            {treeData.length === 0 ? (
              <div style={{ padding: '16px', color: '#666' }}>
                Loading file tree...
              </div>
            ) : (
            <Tree
              ref={treeRef}
              data={treeData}
              openByDefault={false}
              width="100%"
              height={600}
              indent={0}
              rowHeight={32}
              onActivate={handleNodeClick}
              onToggle={async (id) => {
                const node = treeRef.current?.get(id);
                if (node && node.data.children === null) {
                  const children = await loadChildren(node);
                  const updatedTreeData = [...treeData];
                  const updateNodeInTree = (nodes, targetId, newChildren) => {
                    for (let i = 0; i < nodes.length; i++) {
                      if (nodes[i].id === targetId) {
                        nodes[i] = { ...nodes[i], children: newChildren };
                        return true;
                      }
                      if (nodes[i].children && updateNodeInTree(nodes[i].children, targetId, newChildren)) {
                        return true;
                      }
                    }
                    return false;
                  };
                  updateNodeInTree(updatedTreeData, id, children);
                  setTreeData(updatedTreeData);
                }
              }}
            >
              {FileTreeNode}
            </Tree>
            )}
          </div>
        </aside>
        
        <main style={styles.contentArea}>
          <div style={styles.breadcrumb}>
            {/* Up arrow navigation button */}
            {searchResults === null && currentPath !== '/' && currentPath !== '/media/lucidlink-1' && (
              <button
                onClick={() => {
                  const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
                  loadDirectory(parentPath);
                }}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #3a3a3a',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  marginRight: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a1a1aa',
                  transition: 'all 0.2s ease',
                  minWidth: '24px',
                  height: '24px'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#2a2a2a';
                  e.target.style.borderColor = '#3b82f6';
                  e.target.style.color = '#e4e4e7';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.borderColor = '#3a3a3a';
                  e.target.style.color = '#a1a1aa';
                }}
                title="Go up one directory level"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M18 15l-6-6-6 6"/>
                </svg>
              </button>
            )}
            <span>{searchResults !== null ? `Search results for "${searchQuery}"` : getRelativePath(currentPath || '/')}</span>
          </div>
          
          <div style={{
            ...styles.filterBar,
            position: 'relative'
          }}>
            {[
              { key: 'all', label: 'All', type: 'folder' },
              { key: 'images', label: 'Images', type: 'image' },
              { key: 'videos', label: 'Videos', type: 'video' },
              { key: 'audio', label: 'Audio', type: 'audio' },
              { key: 'documents', label: 'Documents', type: 'pdf' },
              { key: 'other', label: 'Other', type: 'default' },
              { key: 'cached', label: 'Cached', type: 'cached' },
              { key: 'uploading', label: 'All Uploading Files', type: 'uploading' }
            ].map(filter => (
              <button
                key={filter.key}
                style={{
                  ...styles.filterButton,
                  ...(activeFilter === filter.key ? styles.filterButtonActive : {})
                }}
                onClick={() => handleFilterClick(filter.key)}
              >
                <span>
                  {filter.type === 'folder' ? 
                    <FolderIcon isOpen={false} size={14} color={activeFilter === filter.key ? '#ffffff' : '#a1a1aa'} /> :
                  filter.type === 'cached' ?
                    <span style={{ 
                      color: activeFilter === filter.key ? '#ffffff' : '#a1a1aa',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}>✓</span> :
                  filter.type === 'uploading' ?
                    <span style={{ 
                      color: activeFilter === filter.key ? '#ffffff' : '#a1a1aa',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}>⬆</span> :
                    <FileIcon type={filter.type} size={14} color={activeFilter === filter.key ? '#ffffff' : '#a1a1aa'} />
                  }
                </span>
                <span>{filter.label}</span>
              </button>
            ))}
            
            {/* Toast Message - positioned to right of filter buttons to avoid Jobs drawer */}
            {toastMessage && (
              <div style={{
                marginLeft: '16px', // Space after the last filter button
                backgroundColor: (typeof toastMessage === 'object' && toastMessage.type === 'error') ? '#ef4444' : '#15803d',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '500',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center'
              }}>
                {typeof toastMessage === 'string' ? toastMessage : toastMessage.text}
              </div>
            )}
          </div>
          
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead style={styles.tableHeader}>
                <tr>
                  <th style={{...styles.tableHeaderCell, width: '40px', textAlign: 'center'}}>
                    <input
                      type="checkbox"
                      checked={selectedItems.size > 0 && selectedItems.size === getFilteredFiles().length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      style={{
                        accentColor: '#3b82f6',
                        cursor: 'pointer',
                      }}
                    />
                  </th>
                  <th style={styles.tableHeaderCell}>FILE NAME</th>
                  <th style={{...styles.tableHeaderCell, width: '136px'}}>DATE CREATED</th>
                  <th style={{...styles.tableHeaderCell, width: '136px'}}>LAST MODIFIED</th>
                  <th style={{...styles.tableHeaderCell, width: '120px'}}>FILESPACE</th>
                  <th style={{...styles.tableHeaderCell, width: '60px'}}>TYPE</th>
                  <th style={styles.tableHeaderCell}>SIZE</th>
                  <th style={{...styles.tableHeaderCell, width: '100px', textAlign: 'center'}}>CACHED</th>
                  <th style={{...styles.tableHeaderCell, width: '100px', textAlign: 'center'}}>RUI</th>
                  <th style={{...styles.tableHeaderCell, width: '100px', textAlign: 'center'}}>PREVIEW</th>
                  <th style={{...styles.tableHeaderCell, width: '126px', textAlign: 'center'}}>DIRECT LINK</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredFiles().map(file => (
                  <tr
                    key={file.path}
                    style={{
                      ...styles.tableRow,
                      ...(selectedItems.has(file.path) ? styles.tableRowSelected : {}),
                      ...(hoveredRow === file.path ? styles.tableRowHover : {})
                    }}
                    onMouseEnter={() => setHoveredRow(file.path)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td style={{...styles.tableCell, textAlign: 'center', width: '40px'}}>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(file.path)}
                        onChange={(e) => handleItemSelection(file.path, e.target.checked)}
                        style={{
                          accentColor: '#3b82f6',
                          cursor: 'pointer',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td 
                      style={styles.tableCell}
                      onClick={() => {
                        if (file.isDirectory) {
                          loadDirectory(file.path);
                        } else {
                          setSelectedFile(file);
                        }
                      }}
                    >
                      <div style={styles.fileName}>
                        <span style={styles.fileIcon}>
                          {renderFileIcon(file, 16)}
                        </span>
                        <span>{file.name}</span>
                      </div>
                    </td>
                    <td style={{...styles.tableCell, width: '136px'}}>
                      {file.created ? formatDate(file.created) : '-'}
                    </td>
                    <td style={{...styles.tableCell, width: '136px'}}>
                      {file.modified ? formatDate(file.modified) : '-'}
                    </td>
                    <td style={{...styles.tableCell, width: '120px'}}>
                      <span style={{
                        fontSize: '12px',
                        color: '#9ca3af',
                        backgroundColor: file.filespace_id === 1 ? '#065f46' : '#7c2d12',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: '500'
                      }}>
                        {file.filespace_name || (file.filespace_id === 2 ? 'FS-2' : 'FS-1')}
                      </span>
                    </td>
                    <td style={{...styles.tableCell, width: '60px'}}>
                      {file.isDirectory ? 'Folder' : file.extension || '-'}
                    </td>
                    <td style={styles.tableCell}>
                      {formatFileSize(file, directorySizes, loadingSizes)}
                    </td>
                    <td style={{...styles.tableCell, textAlign: 'center', width: '100px'}}>
                      {file.cached ? (
                        <span style={{ 
                          color: '#22c55e', 
                          fontSize: '16px',
                          fontWeight: 'bold'
                        }}>
                          ✓
                        </span>
                      ) : (
                        <span style={{ 
                          color: '#6b7280', 
                          fontSize: '12px' 
                        }}>
                          -
                        </span>
                      )}
                    </td>
                    <td style={{...styles.tableCell, textAlign: 'center', width: '100px'}}>
                      {!file.isDirectory && getRUIStatus(file, ruiStatus) ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}>
                          <div
                            style={{
                              width: '12px',
                              height: '12px',
                              border: '2px solid #f59e0b',
                              borderTop: '2px solid transparent',
                              borderRadius: '50%',
                              animation: 'spin 1s linear infinite'
                            }}
                          />
                          <span style={{
                            color: '#f59e0b',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}>
                            UPLOADING...
                          </span>
                        </div>
                      ) : (
                        <span style={{ 
                          color: '#6b7280', 
                          fontSize: '12px' 
                        }}>
                          -
                        </span>
                      )}
                    </td>
                    <td style={{...styles.tableCell, textAlign: 'center', width: '100px'}}>
                      {!file.isDirectory && isSupportedForPreview(file.name) ? (
                        <button
                          style={{
                            backgroundColor: 'transparent',
                            color: '#10b981',
                            border: '1px solid #10b981',
                            borderRadius: '12px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            minHeight: '24px',
                            minWidth: '70px',
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#10b981';
                            e.target.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = 'transparent';
                            e.target.style.color = '#10b981';
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openPreview(file.path);
                          }}
                          disabled={previewLoading.has(file.path)}
                        >
                          {previewLoading.has(file.path) ? '...' : 'preview'}
                        </button>
                      ) : (
                        <span style={{ 
                          color: '#6b7280', 
                          fontSize: '12px' 
                        }}>
                          -
                        </span>
                      )}
                    </td>
                    <td style={{...styles.tableCell, textAlign: 'center', width: '120px'}}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
                        <button
                          style={{
                            backgroundColor: 'transparent',
                            color: '#3b82f6',
                            border: '1px solid #3b82f6',
                            borderRadius: '12px',
                            padding: '6px 12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            minHeight: '24px',
                            minWidth: '90px',
                            whiteSpace: 'nowrap',
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#3b82f6';
                            e.target.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = 'transparent';
                            e.target.style.color = '#3b82f6';
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            generateDirectLink(file.path);
                          }}
                          disabled={directLinkLoading.has(file.path)}
                        >
                          {directLinkLoading.has(file.path) ? '...' : 'direct link'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {searchResults !== null && searchResults.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#71717a' }}>
                      No files found matching "{searchQuery}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {searchResults !== null && hasMoreResults && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <button
                  onClick={handleLoadMore}
                  disabled={isSearching}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '13px',
                    cursor: isSearching ? 'not-allowed' : 'pointer',
                    opacity: isSearching ? 0.6 : 1,
                  }}
                >
                  {isSearching ? 'Loading...' : 'Load More Results'}
                </button>
              </div>
            )}
          </div>
          
          <div style={styles.actionBar}>
            <button
              style={{
                ...styles.button,
                ...(selectedItems.size > 0 ? styles.primaryButton : {}),
              }}
              onClick={addToJobQueue}
              disabled={selectedItems.size === 0}
            >
              ☰ Add to Cache Job Queue ({selectedItems.size})
            </button>
            
            <button
              style={{
                ...styles.button,
                ...(hasSelectedVideos() ? styles.primaryButton : {}),
              }}
              onClick={addToVideoPreviewQueue}
              disabled={!hasSelectedVideos()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="2" y1="7" x2="7" y2="7" />
                <line x1="2" y1="17" x2="7" y2="17" />
                <line x1="17" y1="17" x2="22" y2="17" />
                <line x1="17" y1="7" x2="22" y2="7" />
              </svg>
              Add to Video Preview Queue ({countSelectedVideos()})
            </button>
            
            {selectedFile && selectedFile.extension === '.py' && (
              <button
                style={styles.button}
                onClick={() => executeAction('run')}
              >
                ▷ Run Script
              </button>
            )}
            
            <div style={{ flex: 1 }} />
            
            <span style={{ fontSize: '13px', color: '#71717a' }}>
              {selectedItems.size > 0 && `${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''} selected`}
            </span>
          </div>
        </main>
      </div>
      
      <JobPanel
        isOpen={showJobPanel}
        onClose={() => setShowJobPanel(false)}
        jobs={jobs}
        onClearJobs={clearJobs}
        onCancelJob={cancelJob}
      />
      
      {/* Preview Modal */}
      {previewModal && (
        <PreviewModal
          filePath={previewModal.filePath}
          preview={previewModal.preview}
          type={previewModal.type}
          onClose={() => setPreviewModal(null)}
        />
      )}
    </div>
  );
};

export default BrowserView;