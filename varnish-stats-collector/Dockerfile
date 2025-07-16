# Dockerfile for Varnish Stats Collector
FROM alpine:latest

# Install dependencies
RUN apk add --no-cache \
    bash \
    docker-cli \
    coreutils

# Create working directory
WORKDIR /app

# Copy the stats collection script
COPY collect-stats.sh /app/

# Make script executable
RUN chmod +x /app/collect-stats.sh

# Create directory for stats file
RUN mkdir -p /data

# Run the script
CMD ["/app/collect-stats.sh"]