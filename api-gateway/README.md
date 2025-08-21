# TeamCache Manager API Gateway

External API service for submitting cache jobs to TeamCache Manager.

## Overview

The API Gateway provides a simple REST API for external services to submit files and directories to be cached by TeamCache Manager. It's designed for development and demo purposes with simple API key authentication.

## Features

- Simple REST API for cache job submission
- API key authentication
- Rate limiting (10 requests per minute)
- Direct database integration
- Health check endpoint
- Job status tracking

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
curl -X POST http://localhost:8095/api/v1/cache/jobs \
  -H "X-API-Key: demo-api-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["/media/lucidlink-1/video.mp4"],
    "directories": ["/media/lucidlink-1/folder"],
    "recursive": true
  }'
```

## API Documentation

### Authentication

All API endpoints (except health) require an API key in the request headers:

```
X-API-Key: <your-api-key>
```

Default API key: `demo-api-key-2024`

### Endpoints

#### Health Check

Check if the API Gateway is running and database is connected.

**Request:**
```
GET /api/v1/health
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "service": "api-gateway",
  "database": "connected",
  "timestamp": "2024-08-17T10:30:00.000Z"
}
```

#### Create Cache Job

Submit files and/or directories to be cached.

**Request:**
```
POST /api/v1/cache/jobs
Headers:
  X-API-Key: <api-key>
  Content-Type: application/json

Body:
{
  "files": ["/media/lucidlink-1/file1.mp4", "/media/lucidlink-1/file2.mov"],
  "directories": ["/media/lucidlink-1/folder1", "/media/lucidlink-1/folder2"],
  "recursive": true
}
```

**Parameters:**
- `files` (array, optional): List of file paths to cache
- `directories` (array, optional): List of directory paths to cache
- `recursive` (boolean, optional): Recursively cache subdirectories (default: true)

**Response:**
```json
{
  "success": true,
  "jobId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "pending",
  "totalFiles": 150,
  "message": "Cache job created successfully",
  "createdAt": "2024-08-17T10:30:00.000Z"
}
```

#### Get Job Status

Check the status and progress of a cache job.

**Request:**
```
GET /api/v1/cache/jobs/:id
Headers:
  X-API-Key: <api-key>
```

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "status": "running",
    "totalFiles": 150,
    "progress": {
      "completed": 75,
      "failed": 2,
      "total": 150,
      "percentage": 50
    },
    "createdAt": "2024-08-17T10:30:00.000Z",
    "startedAt": "2024-08-17T10:31:00.000Z",
    "completedAt": null,
    "error": null
  }
}
```

**Status Values:**
- `pending`: Job created but not started
- `running`: Job is being processed
- `completed`: Job finished successfully
- `failed`: Job failed with error
- `cancelled`: Job was cancelled
- `paused`: Job is paused

#### List Jobs

Get a list of recent cache jobs.

**Request:**
```
GET /api/v1/cache/jobs?limit=10&offset=0&status=pending
Headers:
  X-API-Key: <api-key>
```

**Query Parameters:**
- `limit` (number, optional): Number of jobs to return (max: 100, default: 10)
- `offset` (number, optional): Pagination offset (default: 0)
- `status` (string, optional): Filter by status

**Response:**
```json
{
  "success": true,
  "jobs": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "status": "completed",
      "totalFiles": 150,
      "createdAt": "2024-08-17T10:30:00.000Z",
      "completedAt": "2024-08-17T10:45:00.000Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 1
  }
}
```

#### Cancel Job

Cancel a pending or running cache job.

**Request:**
```
DELETE /api/v1/cache/jobs/:id
Headers:
  X-API-Key: <api-key>
```

**Response:**
```json
{
  "success": true,
  "message": "Job cancelled successfully",
  "job": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "status": "cancelled"
  }
}
```

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

**Common HTTP Status Codes:**
- `200 OK`: Success
- `201 Created`: Job created successfully
- `400 Bad Request`: Invalid input
- `401 Unauthorized`: Invalid or missing API key
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service unhealthy

## Configuration

Environment variables for the API Gateway:

```bash
# API Gateway Configuration
API_GATEWAY_PORT=8095              # External port
API_GATEWAY_KEY=demo-api-key-2024  # API key for authentication
API_GATEWAY_ENABLED=true           # Enable/disable service

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_NAME=teamcache_db
DB_USER=teamcache_user
DB_PASSWORD=teamcache_password

# Path Configuration
ALLOWED_PATHS=/media/lucidlink-1   # Allowed file path prefix
```

## Rate Limiting

The API Gateway implements rate limiting to prevent abuse:
- **Limit**: 10 requests per minute per IP
- **Window**: 60 seconds sliding window
- **Response**: HTTP 429 when limit exceeded

## Security Considerations

This API Gateway is designed for development and demo purposes:

1. **Simple Authentication**: Uses basic API key authentication
2. **Path Validation**: Only allows files under configured paths
3. **Rate Limiting**: Prevents request flooding
4. **Input Validation**: Validates all input parameters
5. **No Sensitive Data**: Doesn't expose internal system details

For production use, consider:
- Implementing OAuth2 or JWT authentication
- Adding HTTPS/TLS encryption
- Implementing request signing
- Adding audit logging
- Using API gateway solutions like Kong or Traefik

## Testing

See the `test-api.sh` script for example API calls:

```bash
# Run test script
./api-gateway/test-api.sh

# Or test individual endpoints
curl -X POST http://localhost:8095/api/v1/cache/jobs \
  -H "X-API-Key: demo-api-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      "/media/lucidlink-1/test/video1.mp4",
      "/media/lucidlink-1/test/video2.mov"
    ]
  }'
```

## Monitoring

Monitor the API Gateway:

```bash
# View logs
docker logs tc-mgr-api-gateway -f

# Check health
curl http://localhost:8095/api/v1/health

# View container stats
docker stats tc-mgr-api-gateway
```

## Troubleshooting

### Connection Refused
- Check if the container is running: `docker ps | grep api-gateway`
- Check port mapping: `docker port tc-mgr-api-gateway`

### Database Connection Failed
- Ensure PostgreSQL is running: `docker ps | grep postgres`
- Check database credentials in environment variables

### Invalid API Key
- Verify the API key in your request matches the configured key
- Check environment variable: `docker exec tc-mgr-api-gateway env | grep API_KEY`

### Rate Limit Exceeded
- Wait 60 seconds before retrying
- Consider increasing the rate limit for development

## Architecture

The API Gateway connects directly to the PostgreSQL database to create cache jobs:

```
External Service
      ↓
API Gateway (:8095)
      ↓
PostgreSQL Database
      ↓
Cache Workers (automatic processing)
```

Jobs created through the API are automatically picked up by the cache workers for processing.