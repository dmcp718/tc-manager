# Multi-stage Dockerfile for Frontend
# Development stage
FROM node:18-alpine AS development

# Set working directory
WORKDIR /app

# Install dependencies for development
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code (for development, this will be overridden by volume mount)
COPY . .

# Set development environment variables
ENV NODE_ENV=development
ENV CHOKIDAR_USEPOLLING=true
ENV FAST_REFRESH=true
ENV GENERATE_SOURCEMAP=true

# Expose port for React dev server
EXPOSE 3000

# Start React development server
CMD ["npm", "start"]

# Builder stage for production
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Accept build arguments 
ARG REACT_APP_API_URL
ARG REACT_APP_WS_URL
ARG REACT_APP_LUCIDLINK_MOUNT_POINT
ARG REACT_APP_GRAFANA_URL

# Set environment variables for build
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_WS_URL=$REACT_APP_WS_URL
ENV REACT_APP_LUCIDLINK_MOUNT_POINT=$REACT_APP_LUCIDLINK_MOUNT_POINT
ENV REACT_APP_GRAFANA_URL=$REACT_APP_GRAFANA_URL
ENV NODE_ENV=production
ENV GENERATE_SOURCEMAP=false

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built application from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.production.conf /etc/nginx/conf.d/default.conf

# Create nginx user and set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]