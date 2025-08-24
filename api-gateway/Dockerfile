FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8095

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8095/api/v1/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Start server
CMD ["node", "server.js"]