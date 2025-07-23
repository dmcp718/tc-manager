const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    this.adminUsername = process.env.ADMIN_USERNAME || 'admin';
    this.adminPasswordHash = null;
    this.tokenExpiry = process.env.JWT_EXPIRY || '8h';
    
    // Database connection pool
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'sitecache_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
    });
    
    this.initializeAdminPassword();
  }

  async initializeAdminPassword() {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    this.adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    console.log(`Admin user initialized: ${this.adminUsername}`);
  }

  async validateCredentials(username, password) {
    try {
      // Try database first
      const result = await this.pool.query(
        'SELECT password_hash, role FROM users WHERE username = $1 AND is_active = true',
        [username]
      );
      
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (isValid) {
          // Update last login
          await this.pool.query(
            'UPDATE users SET last_login = NOW() WHERE username = $1',
            [username]
          );
          return { username, role: user.role };
        }
      }
      
      // Fallback to environment admin user for backward compatibility
      if (username === this.adminUsername) {
        if (!this.adminPasswordHash) {
          await this.initializeAdminPassword();
        }
        
        const isValid = await bcrypt.compare(password, this.adminPasswordHash);
        if (isValid) {
          return { username, role: 'admin' };
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error validating credentials:', error);
      return false;
    }
  }

  generateToken(username, role = 'admin') {
    return jwt.sign(
      { username, role },
      this.jwtSecret,
      { expiresIn: this.tokenExpiry }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      return null;
    }
  }

  // Middleware to protect routes
  requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    // If no header token, check query parameter (for HLS video requests)
    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = this.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
  };

  // User Management Methods
  async getAllUsers() {
    try {
      const result = await this.pool.query(`
        SELECT id, username, email, role, created_at, last_login, is_active
        FROM users 
        WHERE is_active = true 
        ORDER BY created_at DESC
      `);
      return result.rows;
    } catch (error) {
      console.error('Error getting users:', error);
      throw error;
    }
  }

  async createUser(username, password, email = null, role = 'user') {
    try {
      // Check if username already exists
      const existingUser = await this.pool.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      
      if (existingUser.rows.length > 0) {
        throw new Error('Username already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);
      
      // Insert new user
      const result = await this.pool.query(`
        INSERT INTO users (username, password_hash, email, role, created_at) 
        VALUES ($1, $2, $3, $4, NOW()) 
        RETURNING id, username, email, role, created_at
      `, [username, passwordHash, email, role]);
      
      return result.rows[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      // Soft delete by setting is_active to false
      const result = await this.pool.query(`
        UPDATE users 
        SET is_active = false, updated_at = NOW() 
        WHERE id = $1 AND is_active = true
        RETURNING id, username
      `, [userId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found or already deleted');
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  async getUserById(userId) {
    try {
      const result = await this.pool.query(`
        SELECT id, username, email, role, created_at, last_login, is_active
        FROM users 
        WHERE id = $1 AND is_active = true
      `, [userId]);
      
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  async updateUserPassword(userId, newPassword) {
    try {
      const passwordHash = await bcrypt.hash(newPassword, 10);
      
      const result = await this.pool.query(`
        UPDATE users 
        SET password_hash = $1, updated_at = NOW() 
        WHERE id = $2 AND is_active = true
        RETURNING id, username
      `, [passwordHash, userId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      return result.rows[0];
    } catch (error) {
      console.error('Error updating user password:', error);
      throw error;
    }
  }

  // Optional auth middleware - allows both authenticated and unauthenticated access
  optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = this.verifyToken(token);
      if (decoded) {
        req.user = decoded;
      }
    }

    next();
  };
}

// Singleton instance
const authService = new AuthService();

module.exports = authService;