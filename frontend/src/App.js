import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BrowserView from './views/BrowserView';
import AdminView from './views/AdminView';

// Cache buster: 2025-07-23-browser-admin-tabs

// Add CSS keyframes for spinner animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Login screen styles
const loginStyles = {
  loginContainer: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    color: '#e4e4e7',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  loginForm: {
    backgroundColor: '#2a2a2a',
    padding: '40px',
    borderRadius: '12px',
    border: '1px solid #3a3a3a',
    width: '360px',
    maxWidth: '90vw',
  },
  loginTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: '32px',
  },
  loginInput: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #3a3a3a',
    borderRadius: '8px',
    color: '#e4e4e7',
    fontSize: '14px',
    marginBottom: '16px',
    fontFamily: 'inherit',
  },
  loginButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    marginTop: '8px',
  },
  loginError: {
    color: '#ef4444',
    fontSize: '14px',
    marginBottom: '16px',
    textAlign: 'center',
  },
};

// FileSystemAPI - Basic implementation for authentication
const FileSystemAPI = {
  baseURL: process.env.REACT_APP_API_URL || '/api',
};

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${FileSystemAPI.baseURL.replace('/api', '')}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('authToken', data.token);
        onLogin(data.user, data.token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={loginStyles.loginContainer}>
      <div style={loginStyles.loginForm}>
        <h1 style={loginStyles.loginTitle}>SiteCache Manager</h1>
        {error && <div style={loginStyles.loginError}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={loginStyles.loginInput}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={loginStyles.loginInput}
            required
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              ...loginStyles.loginButton,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Authentication functions
  const checkAuth = async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setAuthLoading(false);
      return;
    }

    try {
      const response = await fetch(`${FileSystemAPI.baseURL.replace('/api', '')}/api/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem('authToken');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('authToken');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = (userData, token) => {
    setUser(userData);
    setIsAuthenticated(true);
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (token) {
        await fetch(`${FileSystemAPI.baseURL.replace('/api', '')}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('authToken');
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (authLoading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        color: '#e4e4e7'
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/browser" replace />} />
        <Route 
          path="/browser" 
          element={<BrowserView user={user} onLogout={handleLogout} />} 
        />
        <Route 
          path="/admin" 
          element={<AdminView user={user} onLogout={handleLogout} />} 
        />
      </Routes>
    </Router>
  );
}

export default App;