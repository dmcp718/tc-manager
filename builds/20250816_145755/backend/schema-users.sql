-- User Management Schema
-- Add user authentication and management to SiteCache Manager

-- Users table for web application authentication
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users USING btree(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users USING btree(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users USING btree(is_active);

-- Trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123)
-- This should match the current environment variables
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '$2b$10$lbH6P37.ENwU5KbBouT.U.DelGQmpInLFhhsCeyE5JJj/4Bd5Y3.u', 'admin')
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Function to get active users
CREATE OR REPLACE FUNCTION get_active_users()
RETURNS TABLE(
    id INTEGER,
    username VARCHAR(50),
    email VARCHAR(255),
    role VARCHAR(20),
    created_at TIMESTAMP,
    last_login TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.created_at,
        u.last_login
    FROM users u
    WHERE u.is_active = true
    ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql;