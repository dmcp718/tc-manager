import React, { useState, useEffect, useRef } from 'react';
import TabNavigation from '../components/TabNavigation';
import AdminTabNavigation from '../components/AdminTabNavigation';
import Terminal from '../components/Terminal';

// Outline icons matching the app's design style
const WrenchIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);

const InfoIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <path d="m12 16v-4"/>
    <circle cx="12" cy="8" r=".5" fill={color}/>
  </svg>
);

// Admin view styles
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
  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  sidebar: {
    width: '320px',
    backgroundColor: '#111111',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarSection: {
    padding: '20px',
    borderBottom: '1px solid #2a2a2a',
  },
  content: {
    flex: 1,
    padding: '24px',
    overflowY: 'auto',
  },
  statusCard: {
    backgroundColor: '#2a2a2a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
  },
  statusTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusContent: {
    fontSize: '14px',
    lineHeight: '1.5',
    color: '#e4e4e7',
  },
  statusLine: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #3a3a3a',
  },
  statusLineLastChild: {
    borderBottom: 'none',
  },
  statusLabel: {
    fontWeight: '500',
    minWidth: '120px',
    color: '#a1a1aa',
  },
  statusValue: {
    color: '#e4e4e7',
  },
  statusActive: {
    color: '#10b981',
    fontWeight: '600',
  },
  statusInactive: {
    color: '#ef4444',
    fontWeight: '600',
  },
  refreshButton: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  logoutButton: {
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  userButton: {
    backgroundColor: 'transparent',
    color: '#e4e4e7',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '14px',
    cursor: 'default',
  },
  filterContainer: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  searchInput: {
    backgroundColor: '#2a2a2a',
    color: '#e4e4e7',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '14px',
    minWidth: '200px',
    outline: 'none',
  },
  filterSelect: {
    backgroundColor: '#2a2a2a',
    color: '#e4e4e7',
    border: '1px solid #3a3a3a',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  logContainer: {
    backgroundColor: '#111111',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  logHeader: {
    display: 'grid',
    gridTemplateColumns: '150px 80px 120px 1fr',
    gap: '16px',
    padding: '12px 16px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #3a3a3a',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#a1a1aa',
  },
  logHeaderItem: {
    display: 'flex',
    alignItems: 'center',
  },
  logEntries: {
    maxHeight: '400px',
    overflowY: 'auto',
  },
  logEntry: {
    display: 'grid',
    gridTemplateColumns: '150px 80px 120px 1fr',
    gap: '16px',
    padding: '12px 16px',
    borderBottom: '1px solid #2a2a2a',
    fontSize: '14px',
    alignItems: 'center',
  },
  logTime: {
    color: '#a1a1aa',
    fontFamily: 'monospace',
    fontSize: '13px',
  },
  logLevel: {
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: '600',
    textAlign: 'center',
  },
  logLevelInfo: {
    backgroundColor: '#1e40af',
    color: '#ffffff',
  },
  logLevelWarn: {
    backgroundColor: '#d97706',
    color: '#ffffff',
  },
  logLevelError: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
  },
  logEvent: {
    color: '#e4e4e7',
    fontWeight: '500',
  },
  logDetails: {
    color: '#a1a1aa',
    fontSize: '13px',
  },
};

const AdminView = ({ user, onLogout }) => {
  const [activeAdminTab, setActiveAdminTab] = useState('sitecache');
  
  // Logs state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);
  const [logFilters, setLogFilters] = useState({
    level: 'all',
    timeRange: '24h',
    search: '',
    limit: 50,
    offset: 0
  });
  const [systemStatus, setSystemStatus] = useState({
    lucidSiteCache: {
      status: 'checking...',
      since: null,
      active: null,
      loading: true,
    },
    lastUpdated: null,
  });
  const [systemInfo, setSystemInfo] = useState({
    hostname: 'Loading...',
    release: 'Loading...',
    cpu: { cores: 0, model: 'Loading...' },
    memory: 'Loading...',
    network: { interface: 'Loading...', ip: 'Loading...' },
    storage: [],
    loading: true,
  });
  
  // User management state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    email: '',
    role: 'user'
  });
  
  // Debounce timer for search
  const searchTimeoutRef = useRef(null);

  const fetchSystemStatus = async () => {
    try {
      setSystemStatus(prev => ({
        ...prev,
        lucidSiteCache: { ...prev.lucidSiteCache, loading: true }
      }));

      // Call backend API to get systemctl status
      const apiURL = process.env.REACT_APP_API_URL || '/api';
      const response = await fetch(`${apiURL}/admin/system-status`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSystemStatus({
          lucidSiteCache: {
            status: data.lucidSiteCache?.status || 'unknown',
            since: data.lucidSiteCache?.since || null,
            active: data.lucidSiteCache?.active || false,
            loading: false,
          },
          lastUpdated: new Date(),
        });
      } else {
        throw new Error('Failed to fetch system status');
      }
    } catch (error) {
      console.error('Error fetching system status:', error);
      setSystemStatus(prev => ({
        ...prev,
        lucidSiteCache: {
          status: 'error fetching status',
          since: null,
          active: false,
          loading: false,
        },
        lastUpdated: new Date(),
      }));
    }
  };

  const fetchSystemInfo = async () => {
    try {
      setSystemInfo(prev => ({ ...prev, loading: true }));
      
      const apiURL = process.env.REACT_APP_API_URL || '/api';
      const response = await fetch(`${apiURL}/admin/system-info`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSystemInfo({
          hostname: data.hostname || 'Unknown',
          release: data.release || 'Unknown',
          cpu: data.cpu || { cores: 0, model: 'Unknown' },
          memory: data.memory || 'Unknown',
          network: data.network || { interface: 'Unknown', ip: 'Unknown' },
          storage: data.storage || [],
          loading: false,
        });
      } else {
        throw new Error('Failed to fetch system info');
      }
    } catch (error) {
      console.error('Error fetching system info:', error);
      setSystemInfo({
        hostname: 'Error loading',
        release: 'Error loading',
        cpu: { cores: 0, model: 'Error loading' },
        memory: 'Error loading',
        network: { interface: 'Error loading', ip: 'Error loading' },
        storage: [],
        loading: false,
      });
    }
  };

  useEffect(() => {
    fetchSystemStatus();
    // Refresh status every 30 seconds
    const interval = setInterval(fetchSystemStatus, 30000);
    return () => {
      clearInterval(interval);
      // Cleanup search timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Fetch system info when System tab is active
    if (activeAdminTab === 'system') {
      fetchSystemInfo();
    }
    // Fetch users when Users tab is active
    if (activeAdminTab === 'users') {
      fetchUsers();
    }
    // Fetch logs when Logs tab is active
    if (activeAdminTab === 'logs') {
      fetchLogs();
    }
  }, [activeAdminTab]);

  const fetchUsers = async () => {
    try {
      setUsersLoading(true);
      const apiURL = process.env.REACT_APP_API_URL || '/api';
      const response = await fetch(`${apiURL}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });

      if (response.ok) {
        const usersData = await response.json();
        setUsers(usersData);
      } else {
        throw new Error('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  // Fetch logs from API
  const fetchLogs = async (filters = logFilters) => {
    setLogsLoading(true);
    setLogsError(null);
    
    try {
      const apiURL = process.env.REACT_APP_API_URL || '/api';
      const params = new URLSearchParams({
        level: filters.level,
        limit: filters.limit.toString(),
        offset: filters.offset.toString()
      });
      
      // Convert timeRange to startDate
      if (filters.timeRange !== 'all') {
        const now = new Date();
        let hoursBack = 24;
        if (filters.timeRange === '7d') hoursBack = 24 * 7;
        else if (filters.timeRange === '30d') hoursBack = 24 * 30;
        
        const startDate = new Date(now - hoursBack * 60 * 60 * 1000);
        params.append('startDate', startDate.toISOString());
      }
      
      if (filters.search) {
        params.append('search', filters.search);
      }
      
      const response = await fetch(`${apiURL}/admin/logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.status}`);
      }
      
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLogsError(error.message);
    } finally {
      setLogsLoading(false);
    }
  };

  // Handle log filter changes
  const handleLogFilterChange = (key, value) => {
    const newFilters = { ...logFilters, [key]: value, offset: 0 };
    setLogFilters(newFilters);
    
    // For search, debounce the API call to avoid excessive requests
    if (key === 'search') {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        fetchLogs(newFilters);
      }, 500); // Wait 500ms after user stops typing
    } else {
      // For other filters, fetch immediately
      fetchLogs(newFilters);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    
    if (!newUser.username || !newUser.password) {
      alert('Username and password are required');
      return;
    }

    try {
      const apiURL = process.env.REACT_APP_API_URL || '/api';
      const response = await fetch(`${apiURL}/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify(newUser),
      });

      if (response.ok) {
        await fetchUsers(); // Refresh user list
        setShowCreateUser(false);
        setNewUser({ username: '', password: '', email: '', role: 'user' });
      } else {
        const error = await response.json();
        alert(`Error creating user: ${error.error}`);
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Error creating user');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      try {
        const apiURL = process.env.REACT_APP_API_URL || '/api';
        const response = await fetch(`${apiURL}/admin/users/${userId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          },
        });

        if (response.ok) {
          await fetchUsers(); // Refresh user list
        } else {
          const error = await response.json();
          alert(`Error deleting user: ${error.error}`);
        }
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Error deleting user');
      }
    }
  };

  const formatSince = (since) => {
    if (!since) return 'unknown';
    try {
      const date = new Date(since);
      const now = new Date();
      const diffMs = now - date;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (diffHours > 0) {
        return `${diffHours}h ${diffMinutes}m ago`;
      } else {
        return `${diffMinutes}m ago`;
      }
    } catch (error) {
      return since;
    }
  };

  const renderAdminContent = () => {
    switch (activeAdminTab) {
      case 'system':
        return (
          <>
            <div style={styles.statusCard}>
              <div style={styles.statusTitle}>
                <InfoIcon size={18} color="#ffffff" />
                System Information
                <button 
                  style={{
                    ...styles.refreshButton,
                    marginLeft: 'auto',
                    opacity: systemInfo.loading ? 0.7 : 1,
                  }}
                  onClick={fetchSystemInfo}
                  disabled={systemInfo.loading}
                >
                  {systemInfo.loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              <div style={styles.statusContent}>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>Host IP:</div>
                  <div style={styles.statusValue}>{systemInfo.hostname}</div>
                </div>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>Linux Release:</div>
                  <div style={styles.statusValue}>{systemInfo.release}</div>
                </div>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>CPU:</div>
                  <div style={styles.statusValue}>
                    {systemInfo.cpu.model} ({systemInfo.cpu.cores} cores)
                  </div>
                </div>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>Memory:</div>
                  <div style={styles.statusValue}>{systemInfo.memory}</div>
                </div>
              </div>
            </div>
            
            <div style={styles.statusCard}>
            <div style={styles.statusTitle}>
              <InfoIcon size={18} color="#ffffff" />
              Storage Devices
            </div>
            <div style={styles.statusContent}>
              <p style={{ color: '#a1a1aa', fontSize: '12px', marginBottom: '12px', fontStyle: 'italic' }}>
                Host system information loaded from host-info.json
              </p>
              {systemInfo.storage.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #3a3a3a' }}>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Device</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Size</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>FS</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Mount</th>
                      <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemInfo.storage.map((device, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #2a2a2a' }}>
                        <td style={{ padding: '8px', color: '#e4e4e7', fontFamily: 'monospace' }}>{device.name}</td>
                        <td style={{ padding: '8px', color: '#e4e4e7' }}>{device.size || '-'}</td>
                        <td style={{ padding: '8px', color: '#e4e4e7' }}>{device.type || '-'}</td>
                        <td style={{ padding: '8px', color: '#e4e4e7' }}>{device.fstype || '-'}</td>
                        <td style={{ padding: '8px', color: '#e4e4e7', fontSize: '12px' }}>{device.mountpoint || '-'}</td>
                        <td style={{ padding: '8px', color: device.usage && device.usage !== '-' && parseInt(device.usage) > 80 ? '#ef4444' : '#e4e4e7' }}>
                          {device.usage || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: '#a1a1aa', fontSize: '14px' }}>No storage devices found</p>
              )}
            </div>
          </div>
          </>
        );
      
      case 'users':
        return (
          <>
            <div style={styles.statusCard}>
              <div style={styles.statusTitle}>
                <InfoIcon size={18} color="#ffffff" />
                User Management
                <button 
                  style={{
                    ...styles.refreshButton,
                    marginLeft: 'auto',
                    opacity: usersLoading ? 0.7 : 1,
                  }}
                  onClick={() => setShowCreateUser(true)}
                  disabled={usersLoading}
                >
                  + Add User
                </button>
              </div>
              <div style={styles.statusContent}>
                {usersLoading ? (
                  <p style={{ color: '#a1a1aa', fontSize: '14px' }}>Loading users...</p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #3a3a3a' }}>
                        <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Username</th>
                        <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Email</th>
                        <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Role</th>
                        <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Created</th>
                        <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Last Login</th>
                        <th style={{ textAlign: 'left', padding: '8px', color: '#a1a1aa' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((userItem) => (
                        <tr key={userItem.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                          <td style={{ padding: '8px', color: '#e4e4e7', fontFamily: 'monospace', fontWeight: userItem.username === user?.username ? 'bold' : 'normal' }}>
                            {userItem.username}
                            {userItem.username === user?.username && ' (you)'}
                          </td>
                          <td style={{ padding: '8px', color: '#e4e4e7' }}>{userItem.email || '-'}</td>
                          <td style={{ padding: '8px', color: userItem.role === 'admin' ? '#f59e0b' : '#6b7280' }}>
                            {userItem.role}
                          </td>
                          <td style={{ padding: '8px', color: '#a1a1aa', fontSize: '12px' }}>
                            {userItem.created_at ? new Date(userItem.created_at).toLocaleDateString() : '-'}
                          </td>
                          <td style={{ padding: '8px', color: '#a1a1aa', fontSize: '12px' }}>
                            {userItem.last_login ? new Date(userItem.last_login).toLocaleDateString() : 'Never'}
                          </td>
                          <td style={{ padding: '8px' }}>
                            {userItem.username !== user?.username && (
                              <button
                                onClick={() => handleDeleteUser(userItem.id, userItem.username)}
                                style={{
                                  backgroundColor: '#dc2626',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                
                {users.length === 0 && !usersLoading && (
                  <p style={{ color: '#a1a1aa', fontSize: '14px', textAlign: 'center', marginTop: '20px' }}>
                    No users found
                  </p>
                )}
              </div>
            </div>

            {/* Create User Modal */}
            {showCreateUser && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
              }}>
                <div style={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #3a3a3a',
                  borderRadius: '8px',
                  padding: '24px',
                  width: '400px',
                  maxWidth: '90vw',
                }}>
                  <h3 style={{ color: '#ffffff', marginTop: 0, marginBottom: '20px' }}>Create New User</h3>
                  
                  <form onSubmit={handleCreateUser}>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', color: '#a1a1aa', marginBottom: '4px', fontSize: '14px' }}>
                        Username *
                      </label>
                      <input
                        type="text"
                        value={newUser.username}
                        onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: '#2a2a2a',
                          border: '1px solid #3a3a3a',
                          borderRadius: '4px',
                          color: '#e4e4e7',
                          fontSize: '14px',
                        }}
                        required
                      />
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', color: '#a1a1aa', marginBottom: '4px', fontSize: '14px' }}>
                        Password *
                      </label>
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: '#2a2a2a',
                          border: '1px solid #3a3a3a',
                          borderRadius: '4px',
                          color: '#e4e4e7',
                          fontSize: '14px',
                        }}
                        required
                      />
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', color: '#a1a1aa', marginBottom: '4px', fontSize: '14px' }}>
                        Email
                      </label>
                      <input
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: '#2a2a2a',
                          border: '1px solid #3a3a3a',
                          borderRadius: '4px',
                          color: '#e4e4e7',
                          fontSize: '14px',
                        }}
                      />
                    </div>
                    
                    <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', color: '#a1a1aa', marginBottom: '4px', fontSize: '14px' }}>
                        Role
                      </label>
                      <select
                        value={newUser.role}
                        onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px',
                          backgroundColor: '#2a2a2a',
                          border: '1px solid #3a3a3a',
                          borderRadius: '4px',
                          color: '#e4e4e7',
                          fontSize: '14px',
                        }}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateUser(false);
                          setNewUser({ username: '', password: '', email: '', role: 'user' });
                        }}
                        style={{
                          backgroundColor: '#374151',
                          color: '#e4e4e7',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '8px 16px',
                          fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '8px 16px',
                          fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        Create User
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        );
      
      case 'sitecache':
        return (
          <>
            <div style={styles.statusCard}>
              <div style={styles.statusTitle}>
                <WrenchIcon size={18} color="#ffffff" />
                SiteCache Status
                <button 
                  style={{
                    ...styles.refreshButton,
                    marginLeft: 'auto',
                    opacity: systemStatus.lucidSiteCache.loading ? 0.7 : 1,
                  }}
                  onClick={fetchSystemStatus}
                  disabled={systemStatus.lucidSiteCache.loading}
                >
                  {systemStatus.lucidSiteCache.loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              <div style={styles.statusContent}>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>Service:</div>
                  <div style={styles.statusValue}>lucid-site-cache</div>
                </div>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>Status:</div>
                  <div style={{
                    ...styles.statusValue,
                    ...(systemStatus.lucidSiteCache.active ? styles.statusActive : styles.statusInactive)
                  }}>
                    {systemStatus.lucidSiteCache.loading ? 'Checking...' : 
                     systemStatus.lucidSiteCache.active ? 'Active (running)' : 
                     systemStatus.lucidSiteCache.status}
                  </div>
                </div>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>Since:</div>
                  <div style={styles.statusValue}>
                    {systemStatus.lucidSiteCache.loading ? 'Checking...' : 
                     formatSince(systemStatus.lucidSiteCache.since)}
                  </div>
                </div>
                {systemStatus.lastUpdated && (
                  <div style={styles.statusLine}>
                    <div style={styles.statusLabel}>Last Updated:</div>
                    <div style={styles.statusValue}>
                      {systemStatus.lastUpdated.toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={styles.statusCard}>
              <div style={styles.statusTitle}>
                <InfoIcon size={18} color="#ffffff" />
                Application Information
              </div>
              <div style={styles.statusContent}>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>Application:</div>
                  <div style={styles.statusValue}>TeamCache Manager v1.7.0</div>
                </div>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>User:</div>
                  <div style={styles.statusValue}>{user?.username || 'Unknown'}</div>
                </div>
                <div style={styles.statusLine}>
                  <div style={styles.statusLabel}>Environment:</div>
                  <div style={styles.statusValue}>
                    {process.env.NODE_ENV === 'development' ? 'Development' : 'Production'}
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      
      case 'logs':
        return (
          <div style={styles.statusCard}>
            <div style={styles.statusTitle}>
              <InfoIcon size={18} color="#ffffff" />
              Application Logs
            </div>
            <div style={styles.statusContent}>
              <div style={{ marginBottom: '20px' }}>
                <div style={styles.filterContainer}>
                  <input
                    type="text"
                    placeholder="Search logs..."
                    style={styles.searchInput}
                    value={logFilters.search}
                    onChange={(e) => handleLogFilterChange('search', e.target.value)}
                  />
                  <select 
                    style={styles.filterSelect}
                    value={logFilters.level}
                    onChange={(e) => handleLogFilterChange('level', e.target.value)}
                  >
                    <option value="all">All Logs</option>
                    <option value="info">Info</option>
                    <option value="warn">Warnings</option>
                    <option value="error">Errors</option>
                    <option value="cache_jobs">Cache Jobs</option>
                    <option value="index_jobs">Index Jobs</option>
                  </select>
                  <select 
                    style={styles.filterSelect}
                    value={logFilters.timeRange}
                    onChange={(e) => handleLogFilterChange('timeRange', e.target.value)}
                  >
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                  </select>
                  <button 
                    style={styles.refreshButton}
                    onClick={() => fetchLogs()}
                    disabled={logsLoading}
                  >
                    {logsLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>
              
              {logsError && (
                <div style={{ 
                  color: '#ef4444', 
                  marginBottom: '16px', 
                  padding: '12px',
                  backgroundColor: '#1f1f1f',
                  borderRadius: '6px',
                  border: '1px solid #dc2626'
                }}>
                  Error loading logs: {logsError}
                </div>
              )}
              
              <div style={styles.logContainer}>
                <div style={styles.logHeader}>
                  <span style={styles.logHeaderItem}>Time</span>
                  <span style={styles.logHeaderItem}>Level</span>
                  <span style={styles.logHeaderItem}>Event</span>
                  <span style={styles.logHeaderItem}>Details</span>
                </div>
                
                <div style={styles.logEntries}>
                  {logsLoading ? (
                    <div style={{ 
                      padding: '40px', 
                      textAlign: 'center', 
                      color: '#a1a1aa' 
                    }}>
                      Loading logs...
                    </div>
                  ) : logs.length === 0 ? (
                    <div style={{ 
                      padding: '40px', 
                      textAlign: 'center', 
                      color: '#a1a1aa' 
                    }}>
                      No logs found for the selected filters.
                    </div>
                  ) : (
                    logs.map((log, index) => (
                      <div key={index} style={styles.logEntry}>
                        <span style={styles.logTime}>
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                        <span style={{
                          ...styles.logLevel,
                          ...(log.level === 'INFO' ? styles.logLevelInfo :
                              log.level === 'WARN' ? styles.logLevelWarn :
                              log.level === 'ERROR' ? styles.logLevelError : styles.logLevelInfo)
                        }}>
                          {log.level}
                        </span>
                        <span style={styles.logEvent}>
                          {log.event === 'auth_login_success' ? 'User Login' :
                           log.event === 'auth_login_failed' ? 'Auth Failed' :
                           log.event === 'cache_job_created' ? 'Cache Job' :
                           log.event === 'cache_job_started' ? 'Job Started' :
                           log.event === 'cache_job_completed' ? 'Job Complete' :
                           log.event === 'index_job_created' ? 'Index Files' :
                           log.event === 'index_job_completed' ? 'Index Complete' :
                           log.event === 'index_job_stopped' ? 'Index Stopped' :
                           log.event === 'index_job_progress' ? 'Index Progress' :
                           log.event === 'user_created' ? 'User Created' :
                           log.event === 'user_deleted' ? 'User Deleted' :
                           'System'}
                        </span>
                        <span style={styles.logDetails} title={log.details}>
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'terminal':
        return <Terminal user={user} />;
      
      default:
        return null;
    }
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
              <span style={styles.titleVersion}>v1.7.0</span>
            </span>
          </h1>
        </div>
        
        <div style={styles.headerCenter}>
          {/* Empty center section for admin view */}
        </div>
        
        <div style={styles.headerRight}>
          <button style={styles.userButton}>
            👤 {user?.username || 'User'}
          </button>
          <button 
            style={styles.logoutButton}
            onClick={onLogout}
          >
            Logout
          </button>
        </div>
      </header>
      
      <div style={styles.mainContent}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarSection}>
            <TabNavigation />
          </div>
          <div style={styles.sidebarSection}>
            <AdminTabNavigation 
              activeTab={activeAdminTab} 
              onTabChange={setActiveAdminTab} 
            />
          </div>
        </aside>
        <div style={styles.content}>
          {renderAdminContent()}
        </div>
      </div>
    </div>
  );
};

export default AdminView;