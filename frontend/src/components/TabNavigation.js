import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// Outline icons matching the app's design style
const FolderIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const SettingsIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

const TabNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const tabs = [
    { 
      key: 'browser', 
      label: 'BROWSER', 
      icon: <FolderIcon size={14} />, 
      path: '/browser' 
    },
    { 
      key: 'admin', 
      label: 'ADMIN', 
      icon: <SettingsIcon size={14} />, 
      path: '/admin' 
    }
  ];
  
  const activeTab = location.pathname === '/admin' ? 'admin' : 'browser';

  const styles = {
    tabContainer: {
      display: 'flex',
      gap: '0',
      height: '100%',
      alignItems: 'center',
    },
    tab: {
      padding: '8px 16px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      border: 'none',
      backgroundColor: 'transparent',
      color: '#a1a1aa',
      borderRadius: '4px',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      height: '32px',
    },
    tabActive: {
      backgroundColor: '#2a2a2a',
      color: '#ffffff',
      borderBottom: '2px solid #3b82f6',
    },
    tabHover: {
      backgroundColor: '#1a1a1a',
      color: '#e4e4e7',
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
          onClick={() => navigate(tab.path)}
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
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default TabNavigation;