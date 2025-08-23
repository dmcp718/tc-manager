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
- **Cross-platform path support** (Windows, macOS, Linux)
- **Automatic path normalization**
- **Direct database integration** with file indexing
- **WebSocket connection** for real-time stats

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