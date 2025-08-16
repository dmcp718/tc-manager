# Multi-stage Dockerfile for Backend
# Development stage
FROM node:18-bullseye-slim AS development

# Install development dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    wget \
    fuse \
    ca-certificates \
    curl \
    ffmpeg \
    python3 \
    build-essential \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Copy and install custom LucidLink build (if available)
COPY lucidlink-builds/ /tmp/lucidlink-builds/
RUN if [ -f /tmp/lucidlink-builds/lucidlink_3.2.6817_amd64.deb ]; then \
        echo "Installing LucidLink package..." \
        && apt-get update \
        && apt-get install -y /tmp/lucidlink-builds/lucidlink_3.2.6817_amd64.deb \
        && rm -rf /tmp/lucidlink-builds \
        && rm -rf /var/lib/apt/lists/*; \
    else \
        echo "LucidLink package not found - development mode without LucidLink" \
        && rm -rf /tmp/lucidlink-builds; \
    fi

# Enable FUSE user_allow_other option
RUN echo "user_allow_other" >> /etc/fuse.conf

# Set working directory
WORKDIR /app

# Set development environment
ENV NODE_ENV=development

# Copy package files
COPY tc-manager/backend/package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Generate SSH key for host access
RUN mkdir -p /root/.ssh && \
    ssh-keygen -t rsa -b 2048 -f /root/.ssh/id_rsa -N "" && \
    chmod 600 /root/.ssh/id_rsa

# Copy source code (for development, this will be overridden by volume mount)
COPY tc-manager/backend/ .

# Make startup script executable
RUN chmod +x start-lucidlink.sh

# Copy and use development entrypoint
COPY tc-manager/backend/docker-entrypoint-dev.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint-dev.sh

# Expose ports (including debugger port)
EXPOSE 3001 3002 9229

# Use entrypoint that ensures npm packages are installed
ENTRYPOINT ["/usr/local/bin/docker-entrypoint-dev.sh"]

# Development command with nodemon
CMD ["dumb-init", "./start-lucidlink.sh", "npm", "run", "dev"]

# Production stage
FROM node:18-bullseye-slim AS production

# Install production dependencies for better performance
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    wget \
    fuse \
    ca-certificates \
    curl \
    ffmpeg \
    python3 \
    build-essential \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Copy and install custom LucidLink build (if available)
COPY lucidlink-builds/ /tmp/lucidlink-builds/
RUN if [ -f /tmp/lucidlink-builds/lucidlink_3.2.6817_amd64.deb ]; then \
        echo "Installing LucidLink package..." \
        && apt-get update \
        && apt-get install -y /tmp/lucidlink-builds/lucidlink_3.2.6817_amd64.deb \
        && rm -rf /tmp/lucidlink-builds \
        && rm -rf /var/lib/apt/lists/*; \
    else \
        echo "LucidLink package not found - development mode without LucidLink" \
        && rm -rf /tmp/lucidlink-builds; \
    fi

# Enable FUSE user_allow_other option
RUN echo "user_allow_other" >> /etc/fuse.conf

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY tc-manager/backend/package*.json ./

# Install dependencies with optimization flags
RUN npm ci --only=production --no-audit --no-fund

# Generate SSH key for host access
RUN mkdir -p /root/.ssh && \
    ssh-keygen -t rsa -b 2048 -f /root/.ssh/id_rsa -N "" && \
    chmod 600 /root/.ssh/id_rsa

# Copy source code
COPY tc-manager/backend/ .

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
EXPOSE 3001 3002

# Health check with reduced frequency
HEALTHCHECK --interval=60s --timeout=3s --start-period=10s --retries=2 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Use dumb-init with startup script for LucidLink + Node.js
CMD ["dumb-init", "./start-lucidlink.sh", "node", "server-v2.js"]