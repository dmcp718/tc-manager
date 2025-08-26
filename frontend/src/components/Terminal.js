import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const Terminal = ({ user }) => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const socketRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    // Only admin users can access terminal
    if (!user || user.role !== 'admin') {
      return;
    }

    // Wait for DOM element to be ready
    if (!terminalRef.current) {
      return;
    }

    // Initialize terminal
    const terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Consolas, Monaco, "Lucida Console", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        cursorAccent: '#1a1a1a',
        selection: '#3a3a3a',
        black: '#1a1a1a',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e4e4e7',
        brightBlack: '#374151',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f9fafb'
      },
      rows: 24,
      cols: 80
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    // Open terminal in DOM element
    terminal.open(terminalRef.current);
    xtermRef.current = terminal;

    // Use setTimeout to ensure DOM is fully rendered before fitting
    setTimeout(() => {
      try {
        if (fitAddon && terminalRef.current && terminalRef.current.offsetWidth > 0) {
          fitAddon.fit();
        }
      } catch (error) {
        console.warn('Error fitting terminal:', error);
      }
    }, 100);

    // Connect to WebSocket
    connectWebSocket(terminal);

    // Handle window resize
    const handleResize = () => {
      try {
        if (fitAddon && terminalRef.current && terminalRef.current.offsetWidth > 0) {
          fitAddon.fit();
          // Send resize info to backend
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              type: 'terminal-resize',
              cols: terminal.cols,
              rows: terminal.rows
            }));
          }
        }
      } catch (error) {
        console.warn('Error resizing terminal:', error);
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (terminal) {
        terminal.dispose();
      }
    };
  }, [user]);

  const connectWebSocket = (terminal) => {
    try {
      setConnectionStatus('connecting');
      
      // Use the same WebSocket URL but with /terminal path
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      
      // In production, use the same host/port as the main app (nginx proxy)
      // In development, use the direct WebSocket port
      const wsHost = process.env.NODE_ENV === 'production' 
        ? window.location.host
        : (process.env.REACT_APP_WS_URL 
          ? process.env.REACT_APP_WS_URL.replace(/^wss?:\/\//, '')
          : `${window.location.hostname}:3002`);
      
      const wsUrl = `${wsProtocol}//${wsHost}/terminal`;
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('Terminal WebSocket connected');
        setConnectionStatus('connected');
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'terminal-ready':
              setSessionId(data.sessionId);
              terminal.writeln('\r\n\x1b[32mTerminal connected successfully!\x1b[0m');
              terminal.writeln('Type commands to interact with the host system.\r\n');
              break;
              
            case 'terminal-output':
              terminal.write(data.data);
              break;
              
            case 'terminal-exit':
              terminal.writeln(`\r\n\x1b[31mTerminal session ended (exit code: ${data.exitCode})\x1b[0m`);
              setConnectionStatus('disconnected');
              break;
              
            case 'terminal-error':
              terminal.writeln(`\r\n\x1b[31mTerminal error: ${data.error}\x1b[0m`);
              setConnectionStatus('error');
              break;
          }
        } catch (error) {
          console.error('Error parsing terminal WebSocket message:', error);
        }
      };

      socket.onclose = () => {
        console.log('Terminal WebSocket disconnected');
        setConnectionStatus('disconnected');
        terminal.writeln('\r\n\x1b[33mConnection lost. Please refresh to reconnect.\x1b[0m');
      };

      socket.onerror = (error) => {
        console.error('Terminal WebSocket error:', error);
        setConnectionStatus('error');
      };

      // Handle terminal input
      terminal.onData((data) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'terminal-input',
            data: data
          }));
        }
      });

    } catch (error) {
      console.error('Error connecting to terminal WebSocket:', error);
      setConnectionStatus('error');
    }
  };

  const reconnect = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
      connectWebSocket(xtermRef.current);
    }
  };

  const clearTerminal = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  };

  // Security check - only admin users
  if (!user || user.role !== 'admin') {
    return (
      <div style={styles.accessDenied}>
        <div style={styles.accessDeniedContent}>
          <span style={styles.accessDeniedIcon}>🔒</span>
          <h3 style={styles.accessDeniedTitle}>Access Denied</h3>
          <p style={styles.accessDeniedMessage}>
            Terminal access is restricted to administrator users only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.terminalContainer}>
      {/* Terminal Header */}
      <div style={styles.terminalHeader}>
        <div style={styles.terminalTitle}>
          <svg style={styles.terminalIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,17 10,11 4,5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          Terminal
          {sessionId && (
            <span style={styles.sessionId}>Session: {sessionId.slice(0, 8)}</span>
          )}
        </div>
        
        <div style={styles.terminalControls}>
          <div style={styles.connectionStatus}>
            <span 
              style={{
                ...styles.statusDot,
                backgroundColor: getStatusColor(connectionStatus)
              }}
            />
            {connectionStatus}
          </div>
          
          <button 
            onClick={clearTerminal}
            style={styles.controlButton}
            title="Clear terminal"
          >
            Clear
          </button>
          
          <button 
            onClick={reconnect}
            style={styles.controlButton}
            title="Reconnect terminal"
          >
            Reconnect
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div style={styles.terminalContent}>
        <div 
          ref={terminalRef} 
          style={styles.terminal}
        />
      </div>
    </div>
  );
};

const getStatusColor = (status) => {
  switch (status) {
    case 'connected': return '#22c55e';
    case 'connecting': return '#f59e0b';
    case 'disconnected': return '#6b7280';
    case 'error': return '#ef4444';
    default: return '#6b7280';
  }
};

const styles = {
  terminalContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '900px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  terminalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #3a3a3a',
  },
  terminalTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#e4e4e7',
    fontSize: '14px',
    fontWeight: '600',
  },
  terminalIcon: {
    width: '16px',
    height: '16px',
    color: '#e4e4e7',
  },
  sessionId: {
    fontSize: '12px',
    color: '#a1a1aa',
    fontFamily: 'monospace',
    marginLeft: '8px',
  },
  terminalControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#a1a1aa',
    textTransform: 'capitalize',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  controlButton: {
    backgroundColor: '#374151',
    color: '#e4e4e7',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 12px',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  terminalContent: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#1a1a1a',
  },
  terminal: {
    height: '100%',
    padding: '8px',
  },
  accessDenied: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '400px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
  },
  accessDeniedContent: {
    textAlign: 'center',
    color: '#e4e4e7',
  },
  accessDeniedIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '16px',
  },
  accessDeniedTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 8px 0',
    color: '#ef4444',
  },
  accessDeniedMessage: {
    fontSize: '14px',
    color: '#a1a1aa',
    margin: 0,
  },
};

export default Terminal;