import React from 'react';

// Outline icons for admin tabs
const SystemIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

const UsersIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const SiteCacheIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="m3 5 0 14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>
    <path d="m3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>
  </svg>
);

const LogsIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10,9 9,9 8,9"/>
  </svg>
);

const TerminalIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <polyline points="4,17 10,11 4,5"/>
    <line x1="12" y1="19" x2="20" y2="19"/>
  </svg>
);

const AdminTabNavigation = ({ activeTab, onTabChange }) => {
  const tabs = [
    { 
      key: 'system', 
      label: 'System', 
      icon: <SystemIcon size={16} />,
      description: 'Host system information'
    },
    { 
      key: 'users', 
      label: 'Users', 
      icon: <UsersIcon size={16} />,
      description: 'User account management'
    },
    { 
      key: 'sitecache', 
      label: 'SiteCache', 
      icon: <SiteCacheIcon size={16} />,
      description: 'Cache service status'
    },
    { 
      key: 'logs', 
      label: 'Logs', 
      icon: <LogsIcon size={16} />,
      description: 'Application logs and events'
    },
    { 
      key: 'terminal', 
      label: 'Terminal', 
      icon: <TerminalIcon size={16} />,
      description: 'Command line interface'
    }
  ];

  const styles = {
    tabContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      width: '100%',
    },
    tab: {
      padding: '12px 16px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      border: 'none',
      backgroundColor: 'transparent',
      color: '#a1a1aa',
      borderRadius: '6px',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      width: '100%',
      textAlign: 'left',
      outline: 'none',
    },
    tabActive: {
      backgroundColor: '#2563eb',
      color: '#ffffff',
    },
    tabHover: {
      backgroundColor: '#374151',
      color: '#e5e7eb',
    },
    tabContent: {
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
    },
    tabLabel: {
      fontSize: '14px',
      fontWeight: '500',
    },
    tabDescription: {
      fontSize: '12px',
      opacity: 0.8,
    }
  };

  return (
    <div style={styles.tabContainer}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          style={{
            ...styles.tab,
            ...(activeTab === tab.key ? styles.tabActive : {})
          }}
          onClick={() => onTabChange(tab.key)}
          onMouseEnter={(e) => {
            if (activeTab !== tab.key) {
              Object.assign(e.target.style, styles.tabHover);
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== tab.key) {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = '#a1a1aa';
            }
          }}
        >
          {tab.icon}
          <div style={styles.tabContent}>
            <div style={styles.tabLabel}>{tab.label}</div>
            <div style={styles.tabDescription}>{tab.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default AdminTabNavigation;