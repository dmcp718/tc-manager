# Backend Dockerfile - Optimized for production
FROM node:18-bullseye-slim

# Install production dependencies for better performance
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    wget \
    fuse \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install custom LucidLink build
COPY lucidlink_3.2.6817_amd64.deb /tmp/
RUN apt-get update \
    && apt-get install -y /tmp/lucidlink_3.2.6817_amd64.deb \
    && rm /tmp/lucidlink_3.2.6817_amd64.deb \
    && rm -rf /var/lib/apt/lists/*

# Enable FUSE user_allow_other option
RUN echo "user_allow_other" >> /etc/fuse.conf

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install dependencies with optimization flags
RUN npm ci --only=production --no-audit --no-fund

# Copy source code
COPY . .

# Make startup script executable
RUN chmod +x start-lucidlink.sh

# Create non-root user for security and performance
RUN groupadd -g 1001 nodejs
RUN useradd -r -u 1001 -g nodejs nextjs

# Create directory for logs and set ownership
RUN mkdir -p /app/logs
RUN chown -R nextjs:nodejs /app
# Don't switch to nextjs user yet - startup script needs root privileges

# Expose port
EXPOSE 3001

# Health check with reduced frequency
HEALTHCHECK --interval=60s --timeout=3s --start-period=10s --retries=2 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Use dumb-init with startup script for LucidLink + Node.js
CMD ["dumb-init", "./start-lucidlink.sh", "node", "server-v2.js"]