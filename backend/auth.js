const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
    this.adminUsername = process.env.ADMIN_USERNAME || 'admin';
    this.adminPasswordHash = null;
    this.tokenExpiry = process.env.JWT_EXPIRY || '8h';
    
    this.initializeAdminPassword();
  }

  async initializeAdminPassword() {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    this.adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    console.log(`Admin user initialized: ${this.adminUsername}`);
  }

  async validateCredentials(username, password) {
    if (username !== this.adminUsername) {
      return false;
    }
    
    if (!this.adminPasswordHash) {
      await this.initializeAdminPassword();
    }
    
    return await bcrypt.compare(password, this.adminPasswordHash);
  }

  generateToken(username) {
    return jwt.sign(
      { username, role: 'admin' },
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
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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