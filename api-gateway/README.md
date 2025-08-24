# TeamCache Manager API Gateway

External REST API for submitting cache jobs to TeamCache Manager with advanced progress tracking.

## Overview

The API Gateway provides a comprehensive REST API for external services to submit files and directories to be cached by TeamCache Manager. It features enhanced progress tracking with file-based and size-based metrics, plus real-time throughput statistics.

## Features

- **REST API for cache job submission**
- **API key authentication** for security
- **Rate limiting** (10 requests per minute)
- **Enhanced Progress Tracking:**
  - File-based progress (X of Y files completed)
  - Size-based progress (GB completed / GB total)
  - Real-time LucidLink throughput stats (MB/s)
  - Human-readable size formatting
- **S3 Health Monitoring:**
  - Automatic health checks every 5 seconds
  - Round-trip latency measurement
  - Dynamic 3-sample running average (more responsive)
  - Real-time WebSocket broadcasts
- **Real-time Metrics via WebSocket:**
  - Push-based updates for dashboards
  - LucidLink throughput stats
  - S3 health and latency metrics
- **Cross-platform path support** (Windows, macOS, Linux)
- **Automatic path normalization**
- **Direct database integration** with file indexing

## Quick Start

### 1. Start the API Gateway

```bash
# From the project root
docker compose -f docker-compose.yml -f docker-compose.api.yml up -d
```

### 2. Test the health endpoint

```bash
curl http://localhost:8095/api/v1/health
```

### 3. Submit a cache job

```bash
# Using relative paths (recommended)
curl -X POST http://localhost:8095/api/v1/cache/jobs \
  -H "X-API-Key: demo-api-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["00_Media/Farm/ProRes422/Farm00103.mov"],
    "directories": ["00_Media/Farm/ProRes422"],
    "recursive": true
  }'
```

## API Endpoints

### Health Check

Check if the API service is running and database is connected.

**Request:**
```http
GET /api/v1/health
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "service": "api-gateway",
  "database": "connected",
  "timestamp": "2025-08-23T02:40:00.000Z"
}
```

### Create Cache Job

Submit files and/or directories to be cached.

**Request:**
```http
POST /api/v1/cache/jobs
Headers:
  X-API-Key: demo-api-key-2024
  Content-Type: application/json

Body:
{
  "files": ["file1.mp4", "file2.mov"],     // Optional: List of files
  "directories": ["folder1", "folder2"],    // Optional: List of directories
  "recursive": true                         // Optional: Scan directories recursively (default: true)
}
```

**Response (Enhanced with Size Information):**
```json
{
  "success": true,
  "jobId": "6bb4629b-1487-477c-96fe-b762d82a099b",
  "status": "pending",
  "totalFiles": 2,
  "totalSize": {
    "bytes": 1013645672,
    "readable": "966.69 MB"
  },
  "message": "Cache job created successfully",
  "createdAt": "2025-08-23T02:38:17.048Z"
}
```

### Get Job Status

Retrieve detailed status and progress for a cache job.

**Request:**
```http
GET /api/v1/cache/jobs/{jobId}
Headers:
  X-API-Key: demo-api-key-2024
```

**Response (Enhanced with Detailed Progress):**
```json
{
  "success": true,
  "job": {
    "id": "6bb4629b-1487-477c-96fe-b762d82a099b",
    "status": "running",  // pending | running | completed | failed | cancelled
    "totalFiles": 20,
    "progress": {
      // File-based progress tracking
      "files": {
        "completed": 15,
        "failed": 0,
        "total": 20,
        "percentage": 75
      },
      // Size-based progress tracking
      "size": {
        "completedBytes": 64424509440,
        "totalBytes": 85899345920,
        "completedReadable": "60.0 GB",
        "totalReadable": "80.0 GB",
        "percentage": 75
      },
      // Overall percentage (average of file and size progress)
      "percentage": 75
    },
    // Real-time throughput statistics (when available)
    "throughput": {
      "mbps": 125.5,
      "readable": "125.5 MB/s",
      "timestamp": "2025-08-23T02:41:33.451Z"
    },
    "createdAt": "2025-08-23T02:38:17.048Z",
    "startedAt": "2025-08-23T02:38:22.035Z",
    "completedAt": null,
    "error": null
  }
}
```

### List Jobs

Get a list of all cache jobs with their status.

**Request:**
```http
GET /api/v1/cache/jobs
Headers:
  X-API-Key: demo-api-key-2024
```

**Response:**
```json
{
  "success": true,
  "jobs": [
    {
      "id": "6bb4629b-1487-477c-96fe-b762d82a099b",
      "status": "completed",
      "totalFiles": 2,
      "totalSizeBytes": 1013645672,
      "totalSizeReadable": "966.69 MB",
      "completedFiles": 2,
      "completedSizeBytes": 1013645672,
      "completedSizeReadable": "966.69 MB",
      "createdAt": "2025-08-23T02:38:17.048Z",
      "completedAt": "2025-08-23T02:38:23.334Z"
    }
  ],
  "total": 1
}
```

### Cancel Job

Cancel a pending or running cache job.

**Request:**
```http
DELETE /api/v1/cache/jobs/{jobId}
Headers:
  X-API-Key: demo-api-key-2024
```

**Response:**
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

### Get Metrics

Retrieve current system metrics including LucidLink throughput and S3 health status.

**Request:**
```http
GET /api/v1/metrics
```

**Response:**
```json
{
  "success": true,
  "metrics": {
    "lucidLink": {
      "throughputMbps": 125.5,
      "timestamp": "2025-08-23T03:00:00.000Z"
    },
    "s3Health": {
      "latency": 45,
      "averageLatency": 52,
      "isHealthy": true,
      "lastCheck": "2025-08-23T03:00:00.000Z",
      "checkCount": 360,
      "region": "us-east-1"
    }
  },
  "timestamp": "2025-08-23T03:00:00.000Z"
}
```

### Get S3 Health Metrics

Retrieve detailed S3 health metrics with latency history.

**Request:**
```http
GET /api/v1/metrics/s3
```

**Response:**
```json
{
  "success": true,
  "s3Health": {
    "latency": 45,
    "averageLatency": 52,
    "isHealthy": true,
    "lastCheck": "2025-08-23T03:00:00.000Z",
    "checkCount": 360,
    "latencyHistory": [45, 48, 52, 55, 49, ...],
    "region": "us-east-1"
  },
  "timestamp": "2025-08-23T03:00:00.000Z"
}
```

## Path Handling

The API intelligently handles paths from different operating systems:

### Relative Paths (Recommended)
```json
{
  "files": ["00_Media/video.mp4"],
  "directories": ["00_Media/Farm"]
}
```

### Absolute Paths (Auto-normalized)

**From macOS:**
```json
{
  "files": ["/Volumes/dmpfs/tc-east-1/00_Media/video.mp4"]
}
```

**From Windows:**
```json
{
  "files": ["C:\\dmpfs\\tc-east-1\\00_Media\\video.mp4"]
}
```

**From Linux:**
```json
{
  "files": ["/mnt/lucidlink/tc-east-1/00_Media/video.mp4"]
}
```

All paths are automatically normalized to work with the container's mount point.

## Progress Tracking Details

### Enhanced Real-Time Progress
The API provides granular, real-time progress updates with configurable thresholds for optimal performance:

### File-Based Progress
- Tracks number of files completed vs total files
- Useful for understanding job completion rate
- Percentage based on file count
- Updates incrementally as files complete

### Size-Based Progress
- Tracks bytes completed vs total bytes
- Better representation for jobs with varied file sizes
- Human-readable format (KB, MB, GB, TB)
- More accurate for bandwidth estimation
- Updates in real-time with configurable thresholds

### Throughput Statistics
- Real-time download speed from LucidLink
- Updated via WebSocket connection to backend
- Only shown when data is fresh (< 10 seconds old)
- Helps estimate completion time

### Progress Update Frequency
Progress updates are optimized for performance with configurable thresholds:
- **File Threshold**: Updates after N files complete (default: 10)
- **Time Threshold**: Updates after N milliseconds (default: 2000ms)
- Updates trigger when either threshold is met
- Per-file events available via WebSocket for real-time monitoring

## WebSocket Real-time Metrics

The API Gateway provides a WebSocket endpoint for real-time metrics streaming, ideal for dashboard applications.

### Connection
```javascript
const ws = new WebSocket('ws://localhost:8095/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'metrics':
      // Initial full metrics on connection
      console.log('LucidLink stats:', data.lucidLink);
      console.log('S3 health:', data.s3Health);
      break;
      
    case 'lucidlink-stats':
      // Real-time LucidLink throughput updates
      console.log('Throughput:', data.lucidLink.throughputMbps, 'MB/s');
      break;
      
    case 's3-health':
      // S3 health updates every 5 seconds
      console.log('S3 latency:', data.s3Health.latency, 'ms');
      console.log('Average latency:', data.s3Health.averageLatency, 'ms');
      break;
  }
};
```

### Message Types

**Initial Metrics** (sent on connection):
```json
{
  "type": "metrics",
  "lucidLink": {
    "throughputMbps": 125.5,
    "timestamp": "2025-08-23T03:00:00.000Z"
  },
  "s3Health": {
    "latency": 45,
    "averageLatency": 52,
    "isHealthy": true,
    "lastCheck": "2025-08-23T03:00:00.000Z",
    "region": "us-east-1"
  }
}
```

**LucidLink Stats Update**:
```json
{
  "type": "lucidlink-stats",
  "lucidLink": {
    "throughputMbps": 130.2,
    "timestamp": "2025-08-23T03:00:01.000Z"
  }
}
```

**S3 Health Update** (every 5 seconds):
```json
{
  "type": "s3-health",
  "s3Health": {
    "latency": 48,
    "averageLatency": 51,
    "isHealthy": true,
    "lastCheck": "2025-08-23T03:00:05.000Z",
    "region": "us-east-1"
  }
}
```

## Configuration

Environment variables for the API Gateway:

```bash
# API Configuration
API_GATEWAY_PORT=8095              # External port for API access
API_GATEWAY_KEY=demo-api-key-2024  # API key for authentication

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=teamcache_db
DB_USER=teamcache_user
DB_PASSWORD=teamcache_password

# Backend WebSocket (for real-time stats)
BACKEND_WS_URL=ws://backend:3002

# S3 Health Monitoring (optional)
S3_HEALTH_BUCKET=your-s3-bucket     # S3 bucket to health check
S3_REGION=us-east-1                 # AWS region (default: us-east-1)
S3_CHECK_INTERVAL=5000               # Check interval in ms (default: 5000)

# Progress Update Thresholds (optional)
CACHE_PROGRESS_FILE_THRESHOLD=10     # Update after N files (default: 10)
CACHE_PROGRESS_TIME_THRESHOLD=2000   # Update after N ms (default: 2000)
```

## Error Responses

### Authentication Error
```json
{
  "success": false,
  "error": "Invalid or missing API key"
}
```

### Rate Limit Error
```json
{
  "success": false,
  "error": "Too many requests, please try again later"
}
```

### Invalid Job ID
```json
{
  "success": false,
  "error": "Invalid job ID format"
}
```

### Job Not Found
```json
{
  "success": false,
  "error": "Job not found"
}
```

## Testing

A test script is included for easy testing:

```bash
# Run all tests
./api-gateway/test-api.sh

# Test specific endpoint
curl -X POST http://localhost:8095/api/v1/cache/jobs \
  -H "X-API-Key: demo-api-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "directories": ["00_Media/Farm/ProRes422"],
    "recursive": false
  }'
```

## Integration Examples

### Python Client Example
```python
import requests
import json
import time

API_URL = "http://localhost:8095/api/v1"
API_KEY = "demo-api-key-2024"

# Submit a cache job
def create_cache_job(files=None, directories=None):
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    
    data = {}
    if files:
        data["files"] = files
    if directories:
        data["directories"] = directories
    
    response = requests.post(
        f"{API_URL}/cache/jobs",
        headers=headers,
        json=data
    )
    return response.json()

# Monitor job progress
def get_job_progress(job_id):
    headers = {"X-API-Key": API_KEY}
    response = requests.get(
        f"{API_URL}/cache/jobs/{job_id}",
        headers=headers
    )
    return response.json()

# Example usage
job = create_cache_job(directories=["00_Media/Farm"])
print(f"Created job: {job['jobId']}")
print(f"Total size: {job['totalSize']['readable']}")

# Poll for progress
while True:
    status = get_job_progress(job['jobId'])
    progress = status['job']['progress']
    
    print(f"Progress: {progress['size']['completedReadable']} / {progress['size']['totalReadable']}")
    
    if status['job']['throughput']:
        print(f"Speed: {status['job']['throughput']['readable']}")
    
    if status['job']['status'] in ['completed', 'failed', 'cancelled']:
        break
    
    time.sleep(5)
```

### Node.js Client Example
```javascript
const axios = require('axios');

const API_URL = 'http://localhost:8095/api/v1';
const API_KEY = 'demo-api-key-2024';

async function createCacheJob(files = [], directories = []) {
  try {
    const response = await axios.post(
      `${API_URL}/cache/jobs`,
      { files, directories },
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`Job created: ${response.data.jobId}`);
    console.log(`Total size: ${response.data.totalSize.readable}`);
    return response.data;
  } catch (error) {
    console.error('Error creating job:', error.response?.data || error.message);
  }
}

async function monitorJob(jobId) {
  try {
    const response = await axios.get(
      `${API_URL}/cache/jobs/${jobId}`,
      {
        headers: { 'X-API-Key': API_KEY }
      }
    );
    
    const job = response.data.job;
    const progress = job.progress;
    
    console.log(`Files: ${progress.files.completed}/${progress.files.total}`);
    console.log(`Size: ${progress.size.completedReadable}/${progress.size.totalReadable}`);
    
    if (job.throughput) {
      console.log(`Speed: ${job.throughput.readable}`);
    }
    
    return job;
  } catch (error) {
    console.error('Error getting job status:', error.response?.data || error.message);
  }
}
```

### WebSocket Client Example (JavaScript)
```javascript
// Real-time metrics monitoring via WebSocket
const WebSocket = require('ws');

class MetricsMonitor {
  constructor(url = 'ws://localhost:8095/ws') {
    this.url = url;
    this.ws = null;
    this.metrics = {
      lucidLink: null,
      s3Health: null
    };
  }

  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.on('open', () => {
      console.log('Connected to metrics WebSocket');
    });
    
    this.ws.on('message', (data) => {
      const message = JSON.parse(data);
      
      switch(message.type) {
        case 'metrics':
          // Initial full metrics
          this.metrics.lucidLink = message.lucidLink;
          this.metrics.s3Health = message.s3Health;
          console.log('Initial metrics received');
          break;
          
        case 'lucidlink-stats':
          // Real-time throughput update
          this.metrics.lucidLink = message.lucidLink;
          console.log(`LucidLink: ${message.lucidLink.throughputMbps} MB/s`);
          break;
          
        case 's3-health':
          // S3 health update
          this.metrics.s3Health = message.s3Health;
          console.log(`S3 Latency: ${message.s3Health.latency}ms (avg: ${message.s3Health.averageLatency}ms)`);
          break;
      }
    });
    
    this.ws.on('close', () => {
      console.log('Disconnected from metrics WebSocket');
      // Reconnect after 5 seconds
      setTimeout(() => this.connect(), 5000);
    });
    
    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }
  
  getMetrics() {
    return this.metrics;
  }
  
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Usage
const monitor = new MetricsMonitor();
monitor.connect();
```

### Dashboard Integration Example (React)
```jsx
import React, { useState, useEffect } from 'react';

const MetricsDashboard = () => {
  const [metrics, setMetrics] = useState({
    lucidLink: { throughputMbps: 0 },
    s3Health: { latency: null, averageLatency: null, isHealthy: false }
  });

  useEffect(() => {
    const ws = new WebSocket('ws://your-api-server:8095/ws');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch(data.type) {
        case 'metrics':
        case 'lucidlink-stats':
          if (data.lucidLink) {
            setMetrics(prev => ({ ...prev, lucidLink: data.lucidLink }));
          }
          break;
        case 's3-health':
          if (data.s3Health) {
            setMetrics(prev => ({ ...prev, s3Health: data.s3Health }));
          }
          break;
      }
    };
    
    return () => ws.close();
  }, []);

  return (
    <div>
      <h2>System Metrics</h2>
      <div>
        <h3>LucidLink Throughput</h3>
        <p>{metrics.lucidLink.throughputMbps.toFixed(2)} MB/s</p>
      </div>
      <div>
        <h3>S3 Health</h3>
        <p>Status: {metrics.s3Health.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}</p>
        <p>Latency: {metrics.s3Health.latency}ms</p>
        <p>Average: {metrics.s3Health.averageLatency}ms</p>
      </div>
    </div>
  );
};
```

### Python WebSocket Client
```python
import asyncio
import json
import websockets

class MetricsMonitor:
    def __init__(self, url='ws://localhost:8095/ws'):
        self.url = url
        self.metrics = {
            'lucidLink': None,
            's3Health': None
        }
    
    async def connect(self):
        async with websockets.connect(self.url) as websocket:
            print("Connected to metrics WebSocket")
            
            async for message in websocket:
                data = json.loads(message)
                
                if data['type'] == 'metrics':
                    # Initial full metrics
                    self.metrics['lucidLink'] = data.get('lucidLink')
                    self.metrics['s3Health'] = data.get('s3Health')
                    print("Initial metrics received")
                    
                elif data['type'] == 'lucidlink-stats':
                    # Real-time throughput update
                    self.metrics['lucidLink'] = data.get('lucidLink')
                    throughput = data['lucidLink']['throughputMbps']
                    print(f"LucidLink: {throughput:.2f} MB/s")
                    
                elif data['type'] == 's3-health':
                    # S3 health update
                    self.metrics['s3Health'] = data.get('s3Health')
                    latency = data['s3Health']['latency']
                    avg_latency = data['s3Health']['averageLatency']
                    print(f"S3 Latency: {latency}ms (avg: {avg_latency}ms)")
    
    def get_metrics(self):
        return self.metrics

# Usage
async def main():
    monitor = MetricsMonitor()
    await monitor.connect()

if __name__ == "__main__":
    asyncio.run(main())
```

## Deployment

### Docker Compose Deployment

The API Gateway is deployed as part of the TeamCache Manager stack:

```yaml
# docker-compose.api.yml
services:
  api-gateway:
    build: ./api-gateway
    ports:
      - "8095:8095"
    environment:
      - API_GATEWAY_PORT=8095
      - API_GATEWAY_KEY=${API_KEY}
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=teamcache_db
      - DB_USER=teamcache_user
      - DB_PASSWORD=${DB_PASSWORD}
      - BACKEND_WS_URL=ws://backend:3002
      - S3_HEALTH_BUCKET=${S3_BUCKET}
      - S3_REGION=${S3_REGION}
    depends_on:
      - postgres
      - backend
    networks:
      - teamcache-network
```

### Standalone Deployment

For standalone deployment outside Docker:

```bash
# Install dependencies
cd api-gateway
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start the server
npm start

# Or with PM2 for production
pm2 start server.js --name api-gateway
```

### AWS ECS/Fargate Deployment

For AWS deployment, ensure:
1. IAM role has S3 access permissions for health checks
2. Security groups allow inbound traffic on port 8095
3. Load balancer health checks use `/api/v1/health`
4. WebSocket support is enabled on ALB (if using)

## Monitoring & Observability

### Health Endpoints

- **Basic Health**: `GET /api/v1/health` - Database connectivity check
- **Metrics**: `GET /api/v1/metrics` - All system metrics
- **S3 Health**: `GET /api/v1/metrics/s3` - Detailed S3 metrics

### Recommended Monitoring Setup

1. **Prometheus Metrics** (pull-based):
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'teamcache-api'
    static_configs:
      - targets: ['api-gateway:8095']
    metrics_path: '/api/v1/metrics'
```

2. **Grafana Dashboard** (WebSocket-based):
- Use WebSocket data source plugin
- Connect to `ws://api-gateway:8095/ws`
- Parse JSON messages for real-time visualization

3. **CloudWatch Integration**:
```javascript
// Lambda function to push metrics to CloudWatch
const AWS = require('aws-sdk');
const WebSocket = require('ws');

const cloudwatch = new AWS.CloudWatch();

function pushMetrics(metrics) {
  const params = {
    Namespace: 'TeamCache',
    MetricData: [
      {
        MetricName: 'S3Latency',
        Value: metrics.s3Health.latency,
        Unit: 'Milliseconds',
        Timestamp: new Date()
      },
      {
        MetricName: 'LucidLinkThroughput',
        Value: metrics.lucidLink.throughputMbps,
        Unit: 'Megabits',
        Timestamp: new Date()
      }
    ]
  };
  
  cloudwatch.putMetricData(params, (err, data) => {
    if (err) console.error(err);
  });
}
```

## Performance Considerations

### WebSocket vs REST Polling

**WebSocket Advantages**:
- Single persistent connection
- Real-time updates (no polling delay)
- Lower bandwidth usage
- Reduced server load

**REST Polling Use Cases**:
- Simple integrations
- Firewall restrictions
- Stateless requirements

### Scaling Recommendations

1. **Horizontal Scaling**:
   - Deploy multiple API Gateway instances
   - Use Redis for shared state
   - Implement sticky sessions for WebSocket

2. **Database Optimization**:
   - Index frequently queried columns
   - Use read replicas for metrics queries
   - Implement connection pooling

3. **Caching Strategy**:
   - Cache file metadata (5-minute TTL)
   - Cache job status (1-second TTL for active jobs)
   - Use ETags for conditional requests

## Security Notes

⚠️ **Important:** This API uses simple API key authentication suitable for development and demo purposes. For production use, consider:

- Implementing OAuth 2.0 or JWT authentication
- Using HTTPS/TLS encryption
- Implementing user-based access control
- Adding request signing
- Implementing more sophisticated rate limiting
- Adding audit logging

## Troubleshooting

### Connection Refused
- Ensure the API Gateway container is running: `docker ps | grep api-gateway`
- Check the port mapping: default is 8095
- Verify network connectivity

### Invalid API Key
- Check the API key in your `.env` file
- Ensure you're sending the `X-API-Key` header

### No Files Found
- Verify files exist in the database (indexed by backend)
- Check path format and normalization
- Ensure the backend has completed indexing

### No Throughput Stats
- WebSocket connection to backend may be disconnected
- Stats are only shown when actively downloading
- Check backend is running and WebSocket port (3002) is accessible

## Support

For issues or questions, please refer to the main TeamCache Manager documentation or create an issue in the repository.