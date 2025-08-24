# TeamCache Manager API Reference

## Base URL
```
http://your-server:8095/api/v1
```

## Authentication

All API endpoints (except health and metrics) require API key authentication.

**Header:**
```
X-API-Key: your-api-key-here
```

## Endpoints

### 1. Health Check

Check API server and database connectivity.

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

---

### 2. Create Cache Job

Submit files and/or directories for caching.

```http
POST /api/v1/cache/jobs
```

**Headers:**
- `X-API-Key`: Required
- `Content-Type`: application/json

**Request Body:**
```json
{
  "files": ["path/to/file1.mp4", "path/to/file2.mov"],
  "directories": ["path/to/folder1", "path/to/folder2"],
  "recursive": true
}
```

**Parameters:**
- `files` (array, optional): List of file paths to cache
- `directories` (array, optional): List of directory paths to cache
- `recursive` (boolean, optional): Scan directories recursively (default: true)

**Response:**
```json
{
  "success": true,
  "jobId": "6bb4629b-1487-477c-96fe-b762d82a099b",
  "status": "pending",
  "totalFiles": 150,
  "totalSize": {
    "bytes": 5368709120,
    "readable": "5.00 GB"
  },
  "filesSubmitted": ["file1.mp4", "file2.mov"],
  "directoriesSubmitted": ["folder1", "folder2"],
  "message": "Cache job created successfully",
  "estimatedTime": "40 minutes at 2 MB/s"
}
```

---

### 3. Get Job Status

Retrieve detailed status and progress for a specific job.

```http
GET /api/v1/cache/jobs/{jobId}
```

**Headers:**
- `X-API-Key`: Required

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "6bb4629b-1487-477c-96fe-b762d82a099b",
    "status": "running",
    "created_at": "2025-08-23T02:40:00.000Z",
    "updated_at": "2025-08-23T02:45:30.000Z",
    "progress": {
      "files": {
        "completed": 75,
        "failed": 2,
        "total": 150,
        "percentage": 50
      },
      "size": {
        "completed": 2684354560,
        "completedReadable": "2.50 GB",
        "total": 5368709120,
        "totalReadable": "5.00 GB",
        "percentage": 50
      }
    },
    "throughput": {
      "mbps": 125.5,
      "readable": "125.5 MB/s"
    },
    "estimatedTimeRemaining": "20 minutes"
  }
}
```

**Status Values:**
- `pending`: Job created but not started
- `running`: Job is actively processing
- `completed`: Job finished successfully
- `failed`: Job failed with errors
- `cancelled`: Job was cancelled

---

### 4. List All Jobs

Get a paginated list of all cache jobs.

```http
GET /api/v1/cache/jobs
```

**Headers:**
- `X-API-Key`: Required

**Query Parameters:**
- `page` (integer, optional): Page number (default: 1)
- `limit` (integer, optional): Items per page (default: 10, max: 100)
- `status` (string, optional): Filter by status

**Response:**
```json
{
  "success": true,
  "jobs": [
    {
      "id": "6bb4629b-1487-477c-96fe-b762d82a099b",
      "status": "completed",
      "created_at": "2025-08-23T02:40:00.000Z",
      "total_files": 150,
      "completed_files": 150,
      "failed_files": 0,
      "total_size_bytes": 5368709120,
      "completed_size_bytes": 5368709120
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25
  }
}
```

---

### 5. Cancel Job

Cancel a pending or running cache job.

```http
DELETE /api/v1/cache/jobs/{jobId}
```

**Headers:**
- `X-API-Key`: Required

**Response:**
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

---

### 6. Get System Metrics

Retrieve current system metrics including LucidLink and S3 health.

```http
GET /api/v1/metrics
```

**No authentication required**

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

---

### 7. Get S3 Health Metrics

Get detailed S3 health metrics with latency history.

```http
GET /api/v1/metrics/s3
```

**No authentication required**

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
    "latencyHistory": [45, 48, 52, 55, 49, 44, 46, 51],
    "region": "us-east-1"
  },
  "timestamp": "2025-08-23T03:00:00.000Z"
}
```

---

## WebSocket Endpoint

Real-time metrics streaming via WebSocket.

```
ws://your-server:8095/ws
```

**No authentication required**

### Connection Example

```javascript
const ws = new WebSocket('ws://your-server:8095/ws');

ws.onopen = () => {
  console.log('Connected to metrics stream');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data.type, data);
};
```

### Message Types

#### Initial Metrics
Sent immediately upon connection:
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

#### LucidLink Stats Update
Real-time throughput updates:
```json
{
  "type": "lucidlink-stats",
  "lucidLink": {
    "throughputMbps": 130.2,
    "timestamp": "2025-08-23T03:00:01.000Z"
  }
}
```

#### S3 Health Update
Broadcast every 5 seconds:
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

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Validation error message"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Invalid or missing API key"
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": "Job not found"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Too many requests, please try again later"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Internal server error",
  "details": "Error message"
}
```

### 503 Service Unavailable
```json
{
  "success": false,
  "status": "unhealthy",
  "service": "api-gateway",
  "database": "disconnected",
  "error": "Database connection failed"
}
```

---

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Default Limit**: 10 requests per minute per IP
- **Applies to**: All `/api/v1/cache/jobs` endpoints
- **Headers Returned**:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

---

## Path Handling

The API normalizes paths from different operating systems automatically:

### Supported Path Formats

**Relative Paths (Recommended):**
```json
{
  "files": ["Media/video.mp4"],
  "directories": ["Media/Projects"]
}
```

**Windows Paths:**
```json
{
  "files": ["C:\\LucidLink\\Media\\video.mp4"],
  "directories": ["D:\\Projects\\2024"]
}
```

**macOS Paths:**
```json
{
  "files": ["/Volumes/LucidLink/Media/video.mp4"],
  "directories": ["/Volumes/LucidLink/Projects"]
}
```

**Linux Paths:**
```json
{
  "files": ["/mnt/lucidlink/Media/video.mp4"],
  "directories": ["/media/lucidlink/Projects"]
}
```

### Path Normalization Rules

1. Backslashes (`\`) are converted to forward slashes (`/`)
2. Common mount prefixes are removed:
   - Windows: `C:\`, `D:\`, etc.
   - macOS: `/Volumes/`
   - Linux: `/mnt/`, `/media/`
3. LucidLink-specific prefixes are normalized
4. Leading/trailing slashes are handled appropriately

---

## Best Practices

### 1. Error Handling
Always check the `success` field in responses:
```javascript
const response = await fetch(url, options);
const data = await response.json();

if (!data.success) {
  console.error('API Error:', data.error);
  // Handle error appropriately
}
```

### 2. Job Monitoring
For long-running jobs, poll status every 5-10 seconds:
```javascript
async function monitorJob(jobId) {
  while (true) {
    const status = await getJobStatus(jobId);
    
    if (['completed', 'failed', 'cancelled'].includes(status.job.status)) {
      return status;
    }
    
    await sleep(5000); // Wait 5 seconds
  }
}
```

### 3. WebSocket Reconnection
Implement automatic reconnection for WebSocket:
```javascript
function connectWebSocket() {
  const ws = new WebSocket('ws://your-server:8095/ws');
  
  ws.onclose = () => {
    setTimeout(connectWebSocket, 5000); // Reconnect after 5 seconds
  };
  
  return ws;
}
```

### 4. Batch Operations
When caching multiple items, use directories instead of individual files:
```json
{
  "directories": ["Projects/2024"],
  "recursive": true
}
```

### 5. Path Recommendations
- Use relative paths when possible
- Avoid hardcoding absolute paths
- Test path normalization in development

---

## Versioning

The API uses URL versioning: `/api/v1/`

Future versions will be available at `/api/v2/`, etc., with backward compatibility maintained for deprecated versions.

---

## Support

For issues, questions, or feature requests:
- GitHub Issues: [Your Repository URL]
- Documentation: [This document]
- Email: support@example.com