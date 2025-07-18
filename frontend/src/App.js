import React, { useState, useEffect, useRef } from 'react';
import { Tree } from 'react-arborist';
import Hls from 'hls.js';

// Cache buster: 2025-07-18-v1.4.0-es-search-no-show-in-folder

// Fonts are loaded in index.html for better performance

// Add CSS keyframes for spinner animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

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
    borderRight: '1px solid #2a2a2a',
    backgroundColor: '#111111',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarSection: {
    padding: '16px',
    borderBottom: '1px solid #2a2a2a',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  treeContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '8px',
  },
  contentArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1a1a1a',
  },
  breadcrumb: {
    padding: '16px 20px',
    borderBottom: '1px solid #2a2a2a',
    fontSize: '14px',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  filterBar: {
    padding: '12px 20px',
    borderBottom: '1px solid #2a2a2a',
    backgroundColor: '#1a1a1a',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  filterButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #3a3a3a',
    backgroundColor: 'transparent',
    color: '#a1a1aa',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
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
  },
  tableHeader: {
    backgroundColor: '#111111',
    borderBottom: '1px solid #2a2a2a',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  tableHeaderCell: {
    padding: '12px 20px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '600',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderRight: '1px solid #2a2a2a',
  },
  tableRow: {
    borderBottom: '1px solid #2a2a2a',
    cursor: 'pointer',
    transition: 'background-color 0.1s ease',
  },
  tableRowHover: {
    backgroundColor: '#262626',
  },
  tableRowSelected: {
    backgroundColor: '#1e3a8a',
  },
  tableCell: {
    padding: '12px 20px',
    fontSize: '14px',
    borderRight: '1px solid #2a2a2a',
    color: '#e4e4e7',
  },
  fileName: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontWeight: '500',
  },
  fileIcon: {
    fontSize: '16px',
    width: '20px',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  folderIcon: {
    color: '#22c55e',
  },
  actionBar: {
    padding: '12px 20px',
    borderTop: '1px solid #2a2a2a',
    backgroundColor: '#111111',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  button: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #3b82f6',
    backgroundColor: 'transparent',
    color: '#a1a1aa',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
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
    right: 0,
    top: 0,
    bottom: 0,
    width: '400px',
    backgroundColor: '#111111',
    borderLeft: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
    transform: 'translateX(100%)',
    transition: 'transform 0.3s ease',
    zIndex: 1000,
  },
  jobPanelOpen: {
    transform: 'translateX(0)',
  },
  treeNode: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    cursor: 'pointer',
    borderRadius: '6px',
    fontSize: '14px',
    margin: '1px 4px',
    transition: 'all 0.1s ease',
    position: 'relative',
  },
  treeNodeSelected: {
    backgroundColor: '#1e3a8a',
    color: '#ffffff',
  },
  treeNodeHover: {
    backgroundColor: '#262626',
  },
  nodeIcon: {
    marginRight: '10px',
    fontSize: '14px',
    width: '16px',
    textAlign: 'center',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'flex-end',
  },
  nodeText: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'inherit',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

// API client
class FileSystemAPI {
  static baseURL = process.env.REACT_APP_API_URL || 'http://192.168.8.28:3001/api';

  static async getRoots() {
    const response = await fetch(`${this.baseURL}/roots`);
    return response.json();
  }

  static async getFiles(path) {
    const response = await fetch(`${this.baseURL}/files?path=${encodeURIComponent(path)}`);
    return response.json();
  }

  static async executeScript(scriptPath, args = []) {
    const response = await fetch(`${this.baseURL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptPath, args }),
    });
    return response.json();
  }

  static async getJobs() {
    const response = await fetch(`${this.baseURL}/jobs`);
    return response.json();
  }

  static async getCacheStats() {
    const response = await fetch(`${this.baseURL}/cache-stats`);
    return response.json();
  }
}

// Custom Folder Icon Component
const FolderIcon = ({ isOpen, size = 16, color = '#22c55e' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    {isOpen && <path d="M2 7h20"/>}
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
              {job.type === 'script' ? job.scriptPath.split('/').pop() : `Cache Job (${job.totalFiles} files)`}
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
                color: job.status === 'completed' ? '#4a8' :
                       job.status === 'failed' ? '#a44' : '#aa4'
              }}>{job.status}</span>
              {job.type === 'cache' && (
                <span style={{ marginLeft: '10px' }}>
                  {job.completedFiles || 0}/{job.totalFiles} files cached
                  {job.failedFiles > 0 && ` (${job.failedFiles} failed)`}
                </span>
              )}
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
            {job.type === 'cache' && ['pending', 'running', 'paused'].includes(job.status) && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                  Progress: {Math.round((job.completedFiles / job.totalFiles) * 100)}% 
                  ({job.completedFiles}/{job.totalFiles} files)
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
            {job.output && job.output.length > 0 && (
              <pre style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#0a0a0a',
                borderRadius: '4px',
                fontSize: '12px',
                overflow: 'auto',
                maxHeight: '200px',
              }}>
                {job.output.map(o => o.data).join('')}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to format bytes to human-readable format
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Preview Modal Component
function VideoPlayer({ preview }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // If it's a direct stream URL (MP4), use native video player
    if (preview?.directStreamUrl) {
      video.src = preview.directStreamUrl;
      return;
    }

    // If it's an HLS stream, use hls.js for Chromium support
    if (preview?.playlistUrl) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(preview.playlistUrl);
        hls.attachMedia(video);
        
        return () => {
          hls.destroy();
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS support
        video.src = preview.playlistUrl;
      }
    }
  }, [preview]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      style={{
        width: '100%',
        height: 'auto',
        maxHeight: '80vh',
        backgroundColor: '#000'
      }}
    >
      Your browser does not support the video tag.
    </video>
  );
}

function PreviewModal({ filePath, preview, type, onClose }) {
  const [isLoading, setIsLoading] = useState(preview?.status === 'processing');
  const [currentPreview, setCurrentPreview] = useState(preview);

  useEffect(() => {
    if (preview?.status === 'processing') {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`${FileSystemAPI.baseURL}/preview/status/${preview?.cacheKey}`);
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

    if (isLoading || currentPreview.status === 'processing') {
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

    // Render completed or progressive_ready preview
    if (type === 'video' && (currentPreview?.status === 'completed' || currentPreview?.status === 'progressive_ready')) {
      return <VideoPlayer preview={currentPreview} />;
    }

    if (type === 'image') {
      return (
        <img
          src={preview?.previewUrl || preview?.directUrl}
          alt="Preview"
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: '80vh',
            objectFit: 'contain'
          }}
        />
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
        maxWidth: '90vw',
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
              backgroundColor: 'transparent',
              border: 'none',
              color: '#a1a1aa',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#2a2a2a'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            ✕
          </button>
        </div>

        {/* Preview Content */}
        {renderPreviewContent()}
      </div>
    </div>
  );
}

// Main File Explorer Component
function App() {
  const [treeData, setTreeData] = useState([]);
  const [currentPath, setCurrentPath] = useState('/');
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
  const [indexStatus, setIndexStatus] = useState(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStartTime, setIndexStartTime] = useState(null);
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
  const [previewModal, setPreviewModal] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const treeRef = useRef();
  const searchTimeoutRef = useRef(null);
  const indexStartTimeRef = useRef(null);
  
  // Store duration calculation function on window for WebSocket access
  window._calculateIndexDuration = () => {
    if (window._indexStartTime) {
      return Date.now() - window._indexStartTime;
    }
    return 5000; // 5 second fallback
  };
  
  window._formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

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

  // Load root directories on mount
  useEffect(() => {
    loadRoots();
    loadJobs();
    loadCacheStats();
    checkIndexStatus();
    checkElasticsearchStatus();
    
    // Enhanced WebSocket connection with auto-reconnect and fallback polling
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://192.168.8.28:3002';
    let ws = null;
    let reconnectTimer = null;
    let fallbackPollingTimer = null;
    let isConnected = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseReconnectDelay = 1000;
    
    const handleWebSocketMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'job-update') {
        loadJobs();
      } else if (data.type === 'cache-job-started' || 
                 data.type === 'cache-job-completed' || 
                 data.type === 'cache-job-failed' ||
                 data.type === 'cache-job-progress' ||
                 data.type === 'cache-file-started' ||
                 data.type === 'cache-file-completed' ||
                 data.type === 'cache-file-failed') {
        // Real-time cache job updates
        console.log('Loading jobs due to cache event:', data.type);
        loadJobs();
        // Also refresh current directory to update cache status indicators
        if (currentPath && files.length > 0 && data.type === 'cache-file-completed') {
          loadDirectory(currentPath);
        }
      } else if (data.type === 'index-progress') {
        setIndexStatus(prev => ({
          ...prev,
          processedFiles: data.processedFiles,
          currentPath: data.currentPath,
          errors: data.errors
        }));
      } else if (data.type === 'index-complete') {
        setIsIndexing(false);
        setIndexStatus(null);
        
        // Calculate duration using window functions
        const duration = window._calculateIndexDuration ? window._calculateIndexDuration() : 5000;
        const formatDuration = window._formatDuration || ((ms) => `${Math.floor(ms/1000)}s`);
        
        // Show completion toast with summary and duration
        const totalFiles = data.totalFiles || 0;
        const indexedFiles = data.indexedFiles || 0;
        const skippedFiles = data.skippedFiles || 0;
        const deletedFiles = data.deletedFiles || 0;
        const durationText = ` Duration: ${formatDuration(duration)}`;
        
        // Build message with deletion info if applicable
        let message = `Indexing complete: ${indexedFiles.toLocaleString()} files indexed, ${skippedFiles.toLocaleString()} skipped`;
        if (deletedFiles > 0) {
          message += `, ${deletedFiles.toLocaleString()} deleted`;
        }
        message += `.${durationText}`;
        
        showToast(message, 'success', 5000); // 5 seconds for stats readability
        
        // Reset start time
        setIndexStartTime(null);
        indexStartTimeRef.current = null;
        window._indexStartTime = null;
        
        // Refresh the current directory to show updated data
        if (currentPath && currentPath !== '/') {
          loadDirectory(currentPath);
        }
      } else if (data.type === 'index-error') {
        setIsIndexing(false);
        setIndexStatus(null);
        console.error('Indexing error:', data.error);
        
        // Show error toast
        showToast(`Indexing failed: ${data.error || 'Unknown error'}`, 'error');
      } else if (data.type === 'lucidlink-stats') {
        // Update LucidLink download statistics for running cache jobs
        const downloadSpeed = data.getMibps;
        
        // LucidLink stats are now only used for header display
        // No need to track download speeds per job anymore
        
        // Also update the standalone network stats for the header (legacy)
        setNetworkStats({
          getMibps: data.getMibps,
          timestamp: Date.now()
        });
        
        // Auto-hide after 5 seconds of no updates
        setTimeout(() => {
          setNetworkStats(prev => {
            if (prev && Date.now() - prev.timestamp > 4000) {
              return null;
            }
            return prev;
          });
        }, 5000);
      } else if (data.type === 'varnish-stats') {
        // Update Varnish cache statistics for the cached data display
        console.log('Received Varnish cache stats:', data);
        
        const usagePercentage = data.usagePercentage || 0;
        setCacheUsage({
          used: usagePercentage,
          total: 100,
          bytesUsed: data.bytesUsed || 0,
          totalSpace: data.totalSpace || 0,
          loading: false
        });
      } else if (data.type === 'cache-job-progress') {
        // Update cache job progress
        setJobs(prevJobs => prevJobs.map(job => {
          if (job.id === data.jobId) {
            return {
              ...job,
              completedFiles: data.completedFiles || job.completedFiles || 0,
              failedFiles: data.failedFiles || job.failedFiles || 0,
              status: data.status || job.status
            };
          }
          return job;
        }));
      } else if (data.type === 'cache-job-started') {
        // Update job when it starts and initialize download speed
        setJobs(prevJobs => prevJobs.map(job => {
          if (job.id === data.jobId) {
            return {
              ...job,
              status: 'running',
              startTime: new Date().toISOString()
            };
          }
          return job;
        }));
      } else if (data.type === 'cache-file-started') {
        // A file has started caching - could update UI to show current file
        console.log('Cache file started:', data);
      } else if (data.type === 'cache-file-completed') {
        // Update individual file completion
        setJobs(prevJobs => prevJobs.map(job => {
          if (job.id === data.jobId) {
            const completedFiles = (job.completedFiles || 0) + 1;
            return {
              ...job,
              completedFiles: completedFiles
            };
          }
          return job;
        }));
      } else if (data.type === 'cache-file-failed') {
        // Update individual file failure
        setJobs(prevJobs => prevJobs.map(job => {
          if (job.id === data.jobId) {
            const failedFiles = (job.failedFiles || 0) + 1;
            const completedFiles = job.completedFiles || 0;
            return {
              ...job,
              failedFiles: failedFiles,
              status: (completedFiles + failedFiles >= job.totalFiles) ? 'completed' : 'running'
            };
          }
          return job;
        }));
      } else if (data.type === 'cache-job-completed') {
        // Mark job as completed
        setJobs(prevJobs => prevJobs.map(job => {
          if (job.id === data.jobId) {
            return {
              ...job,
              status: 'completed',
              completedFiles: data.completedFiles || job.completedFiles,
              failedFiles: data.failedFiles || job.failedFiles,
              endTime: new Date().toISOString()
            };
          }
          return job;
        }));
      } else if (data.type === 'network-stats') {
        // Legacy network statistics (fallback)
        setNetworkStats({
          rxMbps: data.rxMbps,
          txMbps: data.txMbps,
          timestamp: Date.now()
        });
        
        // Auto-hide after 5 seconds of no updates
        setTimeout(() => {
          setNetworkStats(prev => {
            if (prev && Date.now() - prev.timestamp > 4000) {
              return null;
            }
            return prev;
          });
        }, 5000);
      }
      } catch (error) {
        console.error('WebSocket handler error:', error);
        alert('WebSocket handler error: ' + error.message);
      }
    };
    
    const startFallbackPolling = () => {
      if (fallbackPollingTimer) return;
      
      console.log('Starting fallback polling for jobs');
      fallbackPollingTimer = setInterval(() => {
        if (!isConnected) {
          console.log('WebSocket disconnected, polling for job updates');
          loadJobs();
        }
      }, 2000); // Poll every 2 seconds when WebSocket is down
    };
    
    const stopFallbackPolling = () => {
      if (fallbackPollingTimer) {
        console.log('Stopping fallback polling');
        clearInterval(fallbackPollingTimer);
        fallbackPollingTimer = null;
      }
    };
    
    const connectWebSocket = () => {
      try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.log('WebSocket connected');
          isConnected = true;
          reconnectAttempts = 0;
          stopFallbackPolling();
          
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
        };
        
        ws.onmessage = handleWebSocketMessage;
        
        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          isConnected = false;
          startFallbackPolling();
          
          // Auto-reconnect with exponential backoff
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(baseReconnectDelay * Math.pow(2, reconnectAttempts), 30000);
            console.log(`Reconnecting WebSocket in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
            
            reconnectTimer = setTimeout(() => {
              reconnectAttempts++;
              connectWebSocket();
            }, delay);
          } else {
            console.log('Max WebSocket reconnect attempts reached, using fallback polling only');
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          isConnected = false;
          startFallbackPolling();
        };
        
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        isConnected = false;
        startFallbackPolling();
      }
    };
    
    // Initial connection
    connectWebSocket();
    
    // Cleanup
    return () => {
      isConnected = false;
      
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

  // Load jobs on mount and periodically
  useEffect(() => {
    loadJobs();
    
    // Refresh jobs every 2 seconds to catch any missed WebSocket updates
    const interval = setInterval(() => {
      loadJobs();
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  const loadRoots = async () => {
    try {
      const roots = await FileSystemAPI.getRoots();
      setTreeData(roots.map(root => ({
        ...root,
        id: root.path,
        children: null, // null indicates not loaded yet, [] indicates loaded but empty
      })));
    } catch (error) {
      console.error('Failed to load roots:', error);
    }
  };

  const loadJobs = async () => {
    try {
      const jobList = await FileSystemAPI.getJobs();
      setJobs(jobList);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  const loadCacheStats = async () => {
    try {
      const stats = await FileSystemAPI.getCacheStats();
      if (stats && !stats.loading) {
        const usagePercentage = stats.usagePercentage || 0;
        setCacheUsage({
          used: usagePercentage,
          total: 100,
          bytesUsed: stats.bytesUsed || 0,
          totalSpace: stats.totalSpace || 0,
          loading: false
        });
      }
    } catch (error) {
      console.error('Failed to load cache stats:', error);
      // Keep loading state on error, WebSocket will update when available
    }
  };

  const loadDirectory = async (path) => {
    try {
      const fileList = await FileSystemAPI.getFiles(path);
      // Ensure fileList is always an array
      const files = Array.isArray(fileList) ? fileList : [];
      setFiles(files);
      setCurrentPath(path);
      setSelectedItems(new Set()); // Clear selection when navigating
      
      // Load directory sizes for directories that don't have computed sizes
      const directories = files.filter(f => f.isDirectory && !f.fileCount);
      if (directories.length > 0) {
        loadDirectorySizes(directories);
      }
    } catch (error) {
      console.error('Failed to load directory:', error);
      setFiles([]); // Set to empty array on error
    }
  };

  const handleNodeClick = (node) => {
    if (node.data.isDirectory) {
      loadDirectory(node.data.path);
      setSelectedFile(null);
    }
  };

  const loadChildren = async (node) => {
    if (!node.data.isDirectory) return [];
    
    try {
      const children = await FileSystemAPI.getFiles(node.data.path);
      return children
        .filter(child => child.isDirectory)
        .map(child => ({
          ...child,
          id: child.path,
          children: null, // null indicates not loaded yet
        }));
    } catch (error) {
      console.error('Failed to load children:', error);
      return [];
    }
  };

  const executeAction = async (action) => {
    if (!selectedFile) return;
    
    try {
      if (action === 'run' && selectedFile.extension === '.py') {
        const result = await FileSystemAPI.executeScript(selectedFile.path);
        setShowJobPanel(true);
        loadJobs();
      }
    } catch (error) {
      console.error('Failed to execute action:', error);
    }
  };

  const handleItemSelection = (filePath, isSelected) => {
    const newSelection = new Set(selectedItems);
    if (isSelected) {
      newSelection.add(filePath);
    } else {
      newSelection.delete(filePath);
    }
    setSelectedItems(newSelection);
  };

  const handleSelectAll = (isSelected) => {
    if (isSelected) {
      const allPaths = getFilteredFiles().map(file => file.path);
      setSelectedItems(new Set(allPaths));
    } else {
      setSelectedItems(new Set());
    }
  };

  const collectFilesRecursively = async (path) => {
    try {
      const files = await FileSystemAPI.getFiles(path);
      let allFiles = [];
      
      for (const file of files) {
        if (file.isDirectory) {
          const subFiles = await collectFilesRecursively(file.path);
          allFiles = allFiles.concat(subFiles);
        } else {
          allFiles.push(file.path);
        }
      }
      return allFiles;
    } catch (error) {
      console.error('Error collecting files recursively:', error);
      return [];
    }
  };

  const collectDirectoriesRecursively = async (path) => {
    try {
      const files = await FileSystemAPI.getFiles(path);
      let allDirectories = [path]; // Include the root directory
      
      for (const file of files) {
        if (file.isDirectory) {
          const subDirectories = await collectDirectoriesRecursively(file.path);
          allDirectories = allDirectories.concat(subDirectories);
        }
      }
      return allDirectories;
    } catch (error) {
      console.error('Error collecting directories recursively:', error);
      return [path]; // Return at least the root directory
    }
  };

  const addToJobQueue = async () => {
    console.log('addToJobQueue clicked, selectedItems:', selectedItems.size);
    if (selectedItems.size === 0) {
      console.log('No items selected, returning early');
      return;
    }
    
    try {
      let allFilePaths = [];
      let allDirectories = [];
      
      // Get the current file list (could be search results or directory files)
      const currentFiles = getFilteredFiles();
      
      for (const selectedPath of selectedItems) {
        const selectedItem = currentFiles.find(f => f.path === selectedPath);
        if (selectedItem) {
          if (selectedItem.isDirectory) {
            // Collect all subdirectories recursively
            const recursiveDirectories = await collectDirectoriesRecursively(selectedPath);
            allDirectories = allDirectories.concat(recursiveDirectories);
            
            // Collect all files recursively
            const recursiveFiles = await collectFilesRecursively(selectedPath);
            allFilePaths = allFilePaths.concat(recursiveFiles);
          } else {
            allFilePaths.push(selectedPath);
          }
        }
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
        },
        body: JSON.stringify({
          filePaths: allFilePaths,
          directories: allDirectories
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Cache job created:', result);
        setShowJobPanel(true);
        // Immediately refresh jobs to show the new pending job
        loadJobs();
      } else {
        const errorText = await response.text();
        console.error('Failed to create cache job:', response.status, errorText);
        alert(`Failed to create cache job: ${response.status} - ${errorText}`);
      }
      
      // Clear selection after adding to queue
      setSelectedItems(new Set());
      
    } catch (error) {
      console.error('Failed to add to job queue:', error);
    }
  };

  // Clear completed jobs
  const clearJobs = async () => {
    try {
      const response = await fetch(`${FileSystemAPI.baseURL}/jobs/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Jobs cleared successfully:', result);
        // Refresh the job list
        loadJobs();
      } else {
        const errorText = await response.text();
        console.error('Failed to clear jobs:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error clearing jobs:', error);
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
        },
        body: JSON.stringify({ filePath })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate direct link');
      }

      const result = await response.json();
      
      // Open the direct link in a new tab
      window.open(result.directLink, '_blank');
      showToast('Opening Direct Link');

      console.log('Direct link generated and opened:', result.directLink);

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

  // Preview functionality
  const getSupportedPreviewTypes = () => {
    return {
      video: ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.r3d', '.braw', '.mxf', '.mpg', '.mpeg', '.m4v', '.wmv', '.flv'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.tif', '.tiff', '.bmp', '.heic', '.heif', '.raw', '.exr', '.dpx', '.dng', '.cr2', '.nef', '.orf', '.arw', '.pef'],
      audio: ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma']
    };
  };

  const getPreviewType = (filename) => {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    const types = getSupportedPreviewTypes();
    
    for (const [type, extensions] of Object.entries(types)) {
      if (extensions.includes(ext)) {
        return type;
      }
    }
    
    return 'unsupported';
  };

  const isSupportedForPreview = (filename) => {
    return getPreviewType(filename) !== 'unsupported';
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
        },
        body: JSON.stringify({ filePath })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate preview');
      }

      const result = await response.json();
      
      // Open preview modal
      setPreviewModal({
        filePath,
        preview: result,
        type: getPreviewType(filePath)
      });

      console.log('Preview generated:', result);

    } catch (error) {
      console.error('Error generating preview:', error);
      showToast('Failed to generate preview', 'error');
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
        }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Job cancelled successfully:', result);
        // Refresh the job list
        loadJobs();
      } else {
        const errorText = await response.text();
        console.error('Failed to cancel job:', response.status, errorText);
        alert(`Failed to cancel job: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Error cancelling job:', error);
      alert(`Error cancelling job: ${error.message}`);
    }
  };

  // Check Elasticsearch availability
  const checkElasticsearchStatus = async () => {
    try {
      const response = await fetch(`${FileSystemAPI.baseURL}/search/elasticsearch/availability`);
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

  // Search functionality
  const handleSearch = async (query, offset = 0, append = false) => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearchOffset(0);
      setHasMoreResults(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    
    try {
      const limit = 50; // Fixed page size
      const endpoint = elasticsearchAvailable ? '/search/elasticsearch' : '/search';
      const response = await fetch(`${FileSystemAPI.baseURL}${endpoint}?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Handle different response formats
        const results = elasticsearchAvailable ? data.results : data;
        
        if (append && searchResults) {
          setSearchResults([...searchResults, ...results]);
        } else {
          setSearchResults(results);
        }
        
        setSearchOffset(offset);
        setHasMoreResults(results.length === limit); // Has more if we got a full page
      } else {
        const errorData = await response.json();
        setSearchError(errorData.error || 'Search failed');
        console.error('Search failed:', errorData);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchError('Search service unavailable');
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadMore = () => {
    if (searchQuery && !isSearching && hasMoreResults) {
      const newOffset = searchOffset + 50;
      handleSearch(searchQuery, newOffset, true);
    }
  };

  // Debounced search
  const handleSearchInputChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      handleSearch(query);
    }, 300);
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
      setIsIndexing(true);
      const startTime = Date.now();
      setIndexStartTime(startTime);
      indexStartTimeRef.current = startTime;
      window._indexStartTime = startTime;
      const response = await fetch(`${FileSystemAPI.baseURL}/index/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Indexing started:', result);
        setIndexStatus({ processedFiles: 0, currentPath: '', errors: 0 });
      } else {
        setIsIndexing(false);
        console.error('Failed to start indexing');
      }
    } catch (error) {
      setIsIndexing(false);
      console.error('Error starting indexing:', error);
    }
  };

  const stopIndexing = async () => {
    try {
      const response = await fetch(`${FileSystemAPI.baseURL}/index/stop`, {
        method: 'POST'
      });
      
      if (response.ok) {
        console.log('Indexing stop requested');
      }
    } catch (error) {
      console.error('Error stopping indexing:', error);
    }
  };

  const checkIndexStatus = async () => {
    try {
      const response = await fetch(`${FileSystemAPI.baseURL}/index/status`);
      if (response.ok) {
        const status = await response.json();
        setIsIndexing(status.running);
        if (status.running) {
          // If indexing is already running, set current time as start time
          // This won't be perfectly accurate but will give us some duration
          const fallbackStartTime = Date.now();
          window._indexStartTime = fallbackStartTime;
        }
        if (status.running && status.progress) {
          setIndexStatus({
            processedFiles: status.progress.processed_files,
            currentPath: status.progress.current_path,
            errors: 0
          });
        }
      }
    } catch (error) {
      console.error('Error checking index status:', error);
    }
  };

  // Load directory sizes for visible directories
  const loadDirectorySizes = async (directories) => {
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

  const getFileIconType = (file) => {
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

  const renderFileIcon = (file, size = 16) => {
    if (file.isDirectory) {
      return <FolderIcon isOpen={false} size={size} />;
    }
    const type = getFileIconType(file);
    return <FileIcon type={type} size={size} />;
  };

  const formatFileSize = (file) => {
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

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
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
    if (activeFilter === 'images') return fileList.filter(f => f.extension && ['.jpg', '.png', '.gif', '.jpeg', '.webp', '.tif', '.tiff', '.psd', '.dpx', '.exr'].includes(f.extension.toLowerCase()));
    if (activeFilter === 'videos') return fileList.filter(f => f.extension && ['.mp4', '.mov', '.avi', '.mkv', '.m4v', '.mxf', '.braw', '.r3d'].includes(f.extension.toLowerCase()));
    if (activeFilter === 'audio') return fileList.filter(f => f.extension && ['.mp3', '.wav', '.flac', '.aac'].includes(f.extension.toLowerCase()));
    if (activeFilter === 'documents') return fileList.filter(f => f.extension && ['.pdf', '.doc', '.docx', '.txt', '.md'].includes(f.extension.toLowerCase()));
    if (activeFilter === 'cached') return fileList.filter(f => f.cached === true);
    if (activeFilter === 'other') return fileList.filter(f => !f.isDirectory && f.extension && !['.jpg', '.png', '.gif', '.jpeg', '.webp', '.tif', '.tiff', '.psd', '.dpx', '.exr', '.mp4', '.mov', '.avi', '.mkv', '.m4v', '.mxf', '.braw', '.r3d', '.mp3', '.wav', '.flac', '.aac', '.pdf', '.doc', '.docx', '.txt', '.md'].includes(f.extension.toLowerCase()));
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
            <span style={{ marginLeft: '8px' }}>
              SiteCache Manager
            </span>
            <span style={{ 
              marginLeft: '8px', 
              fontSize: '12px', 
              color: '#a1a1aa',
              fontWeight: 'normal'
            }}>
              v1.4.0
            </span>
          </h1>
        </div>
        
        <div style={styles.headerCenter}>
          <div style={styles.searchContainer}>
            <input
              type="text"
              placeholder={elasticsearchAvailable ? 
                "Search files... (supports AND, OR, NOT)" : 
                "Search files..."
              }
              title={elasticsearchAvailable ? 
                "Search examples:\n• Farm\n• proxy\n• Farm AND Proxy\n• mp4 OR mov\n• NOT temp\n• Farm*\n• *.jpg" : 
                "Search files by name or path"
              }
              value={searchQuery}
              onChange={handleSearchInputChange}
              style={styles.searchInput}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.target.style.borderColor = '#3a3a3a'}
            />
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
          
          
          {/* Indexing Status */}
          {isIndexing && (
            <div style={{
              marginLeft: '20px',
              fontSize: '13px',
              color: '#a1a1aa',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              Indexing files
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid #3a3a3a',
                borderTop: '2px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
            </div>
          )}
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
              width: '168px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              position: 'relative'
            }}>
              GET speed:
              <span style={{
                position: 'absolute',
                right: '0',
                textAlign: 'right',
                color: '#ffffff',
                fontWeight: '500'
              }}>
                {networkStats ? (
                  networkStats.getMibps !== undefined ? 
                    `${networkStats.getMibps.toFixed(2)} MiB/s` :
                    `${networkStats.rxMbps.toFixed(1)}↓ ${networkStats.txMbps.toFixed(1)}↑ MB/s`
                ) : '00.00 MiB/s'}
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
                backgroundColor: cacheUsage.used < 70 ? '#22c55e' : 
                               cacheUsage.used < 85 ? '#eab308' : '#ef4444',
                borderRadius: '7px',
                transition: 'all 0.3s ease'
              }} />
              <div style={{
                position: 'absolute',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                fontWeight: '600',
                color: '#ffffff',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)'
              }}>
                {cacheUsage.loading ? '...' : `${cacheUsage.used}%`}
              </div>
            </div>
            <span style={{
              fontSize: '12px',
              color: '#a1a1aa',
              whiteSpace: 'nowrap'
            }}>
              {cacheUsage.loading ? '...' : formatBytes(cacheUsage.totalSpace)}
            </span>
          </div>
          
          {isIndexing ? (
            <button
              style={{
                ...styles.button,
                minWidth: '110px',
                justifyContent: 'center'
              }}
              onClick={stopIndexing}
            >
              Stop Indexing
            </button>
          ) : (
            <button
              style={{
                ...styles.button,
                minWidth: '110px',
                justifyContent: 'center'
              }}
              onClick={startIndexing}
            >
              Index Files
            </button>
          )}
          
          <button
            style={{
              ...styles.button,
              ...(jobs.some(j => j.status === 'running') ? styles.primaryButton : {}),
            }}
            onClick={() => setShowJobPanel(!showJobPanel)}
          >
            ⟲ Jobs ({jobs.filter(j => j.status === 'running').length})
          </button>
        </div>
      </header>
      
      <div style={styles.mainContent}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarSection}>
            <div style={styles.sectionTitle}>Locations</div>
          </div>
          <div style={styles.treeContainer}>
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
          </div>
        </aside>
        
        <main style={styles.contentArea}>
          <div style={styles.breadcrumb}>
            <span>{searchResults !== null ? `Search results for "${searchQuery}"` : currentPath}</span>
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
              { key: 'cached', label: 'Cached', type: 'cached' },
              { key: 'other', label: 'Other', type: 'default' }
            ].map(filter => (
              <button
                key={filter.key}
                style={{
                  ...styles.filterButton,
                  ...(activeFilter === filter.key ? styles.filterButtonActive : {})
                }}
                onClick={() => setActiveFilter(filter.key)}
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
                    <FileIcon type={filter.type} size={14} color={activeFilter === filter.key ? '#ffffff' : '#a1a1aa'} />
                  }
                </span>
                <span>{filter.label}</span>
              </button>
            ))}
            
            {/* Toast Message - right-justified in filter bar */}
            {toastMessage && (
              <div style={{
                position: 'absolute',
                right: '20px', // Right-justified with small margin
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: (typeof toastMessage === 'object' && toastMessage.type === 'error') ? '#ef4444' : '#15803d',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '500',
                zIndex: 1000,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                whiteSpace: 'nowrap'
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
                  <th style={styles.tableHeaderCell}>File Name</th>
                  <th style={{...styles.tableHeaderCell, width: '136px'}}>Date Created</th>
                  <th style={{...styles.tableHeaderCell, width: '136px'}}>Last Modified</th>
                  <th style={{...styles.tableHeaderCell, width: '60px'}}>Type</th>
                  <th style={styles.tableHeaderCell}>Size</th>
                  <th style={{...styles.tableHeaderCell, width: '100px', textAlign: 'center'}}>Cached</th>
                  <th style={{...styles.tableHeaderCell, width: '100px', textAlign: 'center'}}>Preview</th>
                  <th style={{...styles.tableHeaderCell, width: '120px', textAlign: 'center'}}>Direct Link</th>
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
                    <td style={{...styles.tableCell, width: '60px'}}>
                      {file.isDirectory ? 'Folder' : file.extension || '-'}
                    </td>
                    <td style={styles.tableCell}>
                      {formatFileSize(file)}
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
                            minWidth: '80px',
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
}

export default App;
