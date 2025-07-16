# Media Preview Service Dockerfile
FROM node:18-bullseye

# Install FFmpeg and ImageMagick
RUN apt-get update && apt-get install -y \
    ffmpeg \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --no-audit --no-fund

# Copy application files
COPY . .

# Create cache directories
RUN mkdir -p /tmp/previews /tmp/temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3003
ENV PREVIEW_CACHE_DIR=/tmp/previews
ENV TEMP_DIR=/tmp/temp

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3003/health || exit 1

# Run the application
CMD ["node", "server.js"]