# TeamCache Manager API - Quick Start Guide

## 🚀 5-Minute Setup

### Prerequisites
- Docker and Docker Compose installed
- Access to TeamCache Manager deployment
- Network access to port 8095

### Step 1: Start the API Gateway

```bash
# From the TeamCache Manager root directory
docker compose -f docker-compose.yml -f docker-compose.api.yml up -d
```

### Step 2: Verify Installation

```bash
# Check health endpoint
curl http://localhost:8095/api/v1/health

# Expected response:
# {"success":true,"status":"healthy","service":"api-gateway","database":"connected"}
```

### Step 3: Submit Your First Cache Job

```bash
# Cache a single file
curl -X POST http://localhost:8095/api/v1/cache/jobs \
  -H "X-API-Key: demo-api-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "files": ["Media/sample-video.mp4"]
  }'

# Cache an entire directory
curl -X POST http://localhost:8095/api/v1/cache/jobs \
  -H "X-API-Key: demo-api-key-2024" \
  -H "Content-Type: application/json" \
  -d '{
    "directories": ["Projects/2024"],
    "recursive": true
  }'
```

### Step 4: Monitor Progress

```bash
# Replace {jobId} with the ID from Step 3
curl -H "X-API-Key: demo-api-key-2024" \
  http://localhost:8095/api/v1/cache/jobs/{jobId}
```

---

## 📊 Real-time Metrics Dashboard

### WebSocket Connection (JavaScript)

```html
<!DOCTYPE html>
<html>
<head>
    <title>TeamCache Metrics</title>
</head>
<body>
    <h1>Real-time Metrics</h1>
    <div id="metrics">
        <p>LucidLink Speed: <span id="speed">--</span> MB/s</p>
        <p>S3 Latency: <span id="latency">--</span> ms</p>
        <p>S3 Status: <span id="status">--</span></p>
    </div>

    <script>
        const ws = new WebSocket('ws://localhost:8095/ws');
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.lucidLink) {
                document.getElementById('speed').textContent = 
                    data.lucidLink.throughputMbps.toFixed(2);
            }
            
            if (data.s3Health) {
                document.getElementById('latency').textContent = 
                    data.s3Health.latency || '--';
                document.getElementById('status').textContent = 
                    data.s3Health.isHealthy ? '✅ Healthy' : '❌ Unhealthy';
            }
        };
    </script>
</body>
</html>
```

---

## 🐍 Python Client Example

```python
import requests
import json
import time

# Configuration
API_URL = "http://localhost:8095/api/v1"
API_KEY = "demo-api-key-2024"

def submit_cache_job(directories):
    """Submit a cache job for specified directories"""
    
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    
    data = {
        "directories": directories,
        "recursive": True
    }
    
    response = requests.post(
        f"{API_URL}/cache/jobs",
        headers=headers,
        json=data
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Job created: {result['jobId']}")
        print(f"📁 Total files: {result['totalFiles']}")
        print(f"💾 Total size: {result['totalSize']['readable']}")
        return result['jobId']
    else:
        print(f"❌ Error: {response.text}")
        return None

def monitor_job(job_id):
    """Monitor job progress until completion"""
    
    headers = {"X-API-Key": API_KEY}
    
    while True:
        response = requests.get(
            f"{API_URL}/cache/jobs/{job_id}",
            headers=headers
        )
        
        if response.status_code == 200:
            data = response.json()
            job = data['job']
            progress = job['progress']
            
            # Display progress
            print(f"\r📊 Progress: {progress['size']['completedReadable']} / "
                  f"{progress['size']['totalReadable']} "
                  f"({progress['size']['percentage']}%)", end="")
            
            # Check if completed
            if job['status'] in ['completed', 'failed', 'cancelled']:
                print(f"\n✅ Job {job['status']}")
                break
        
        time.sleep(5)  # Check every 5 seconds

# Example usage
if __name__ == "__main__":
    # Submit job
    job_id = submit_cache_job(["Projects/2024/Q1"])
    
    # Monitor progress
    if job_id:
        monitor_job(job_id)
```

---

## 🚅 Node.js Client Example

```javascript
const axios = require('axios');

const API_URL = 'http://localhost:8095/api/v1';
const API_KEY = 'demo-api-key-2024';

class TeamCacheClient {
  constructor(apiUrl = API_URL, apiKey = API_KEY) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  async submitJob(files = [], directories = [], recursive = true) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/cache/jobs`,
        { files, directories, recursive },
        {
          headers: {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`✅ Job created: ${response.data.jobId}`);
      console.log(`📁 Files: ${response.data.totalFiles}`);
      console.log(`💾 Size: ${response.data.totalSize.readable}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async getJobStatus(jobId) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/cache/jobs/${jobId}`,
        {
          headers: { 'X-API-Key': this.apiKey }
        }
      );
      
      return response.data.job;
    } catch (error) {
      console.error('❌ Error:', error.response?.data || error.message);
      throw error;
    }
  }

  async monitorJob(jobId, interval = 5000) {
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          const job = await this.getJobStatus(jobId);
          const progress = job.progress;
          
          console.log(`📊 Progress: ${progress.size.completedReadable} / ${progress.size.totalReadable} (${progress.size.percentage}%)`);
          
          if (['completed', 'failed', 'cancelled'].includes(job.status)) {
            console.log(`✅ Job ${job.status}`);
            resolve(job);
          } else {
            setTimeout(checkStatus, interval);
          }
        } catch (error) {
          reject(error);
        }
      };
      
      checkStatus();
    });
  }
}

// Example usage
async function main() {
  const client = new TeamCacheClient();
  
  // Submit a cache job
  const job = await client.submitJob([], ['Projects/2024'], true);
  
  // Monitor until completion
  await client.monitorJob(job.jobId);
}

main().catch(console.error);
```

---

## 🔧 Configuration

### Basic Configuration (.env file)

```bash
# API Settings
API_GATEWAY_PORT=8095
API_GATEWAY_KEY=your-secure-api-key-here

# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=teamcache_db
DB_USER=teamcache_user
DB_PASSWORD=your-password

# S3 Health Monitoring (Optional)
S3_HEALTH_BUCKET=your-s3-bucket
S3_REGION=us-east-1
S3_CHECK_INTERVAL=5000
```

### Enable S3 Monitoring

1. Set your S3 bucket name in `.env`:
```bash
S3_HEALTH_BUCKET=my-teamcache-bucket
S3_REGION=us-east-1
```

2. Ensure AWS credentials are configured:
   - Via environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - Or via IAM role (recommended for EC2/ECS)

3. Restart the API Gateway:
```bash
docker compose restart api-gateway
```

---

## 📈 Common Use Cases

### 1. Batch Cache Multiple Projects

```bash
#!/bin/bash
# cache-projects.sh

API_URL="http://localhost:8095/api/v1"
API_KEY="demo-api-key-2024"

# List of projects to cache
PROJECTS=(
  "Projects/2024/Q1"
  "Projects/2024/Q2"
  "Media/Raw/January"
)

for PROJECT in "${PROJECTS[@]}"; do
  echo "Caching $PROJECT..."
  
  curl -X POST "$API_URL/cache/jobs" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"directories\": [\"$PROJECT\"], \"recursive\": true}" \
    --silent | jq '.jobId'
done
```

### 2. Monitor All Running Jobs

```python
import requests

def get_running_jobs():
    response = requests.get(
        "http://localhost:8095/api/v1/cache/jobs",
        headers={"X-API-Key": "demo-api-key-2024"},
        params={"status": "running"}
    )
    
    jobs = response.json()['jobs']
    for job in jobs:
        print(f"Job {job['id']}: {job['completed_files']}/{job['total_files']} files")
```

### 3. Cancel Stuck Jobs

```javascript
async function cancelOldJobs(olderThanHours = 24) {
  const response = await axios.get(`${API_URL}/cache/jobs`, {
    headers: { 'X-API-Key': API_KEY }
  });
  
  const now = Date.now();
  const threshold = olderThanHours * 60 * 60 * 1000;
  
  for (const job of response.data.jobs) {
    const age = now - new Date(job.created_at).getTime();
    
    if (job.status === 'running' && age > threshold) {
      await axios.delete(`${API_URL}/cache/jobs/${job.id}`, {
        headers: { 'X-API-Key': API_KEY }
      });
      console.log(`Cancelled old job: ${job.id}`);
    }
  }
}
```

---

## 🆘 Troubleshooting

### API Gateway Not Accessible

```bash
# Check if container is running
docker ps | grep api-gateway

# Check logs
docker logs tc-manager-api-gateway-1

# Test connectivity
telnet localhost 8095
```

### Authentication Errors

```bash
# Verify API key in environment
docker exec tc-manager-api-gateway-1 env | grep API_GATEWAY_KEY

# Test with correct header
curl -H "X-API-Key: demo-api-key-2024" \
  http://localhost:8095/api/v1/health
```

### No Files Found

```bash
# Check if backend has indexed files
docker exec tc-manager-postgres-1 psql -U teamcache_user -d teamcache_db \
  -c "SELECT COUNT(*) FROM files;"

# Trigger manual indexing
docker exec tc-manager-backend-1 npm run index
```

### WebSocket Connection Failed

```javascript
// Debug WebSocket connection
const ws = new WebSocket('ws://localhost:8095/ws');

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = (event) => {
  console.log('Connection closed:', event.code, event.reason);
};
```

---

## 📚 Additional Resources

- **Full API Reference**: [API_REFERENCE.md](./API_REFERENCE.md)
- **Complete Documentation**: [README.md](./README.md)
- **Integration Examples**: See `examples/` directory
- **Docker Compose**: `docker-compose.api.yml`

---

## 💡 Tips & Best Practices

1. **Use Relative Paths**: More portable across different systems
2. **Batch Operations**: Submit directories instead of individual files
3. **Monitor via WebSocket**: More efficient than polling
4. **Implement Retries**: Handle transient network errors
5. **Set Reasonable Timeouts**: Don't poll too frequently
6. **Log API Responses**: Helpful for debugging
7. **Use Environment Variables**: Don't hardcode credentials

---

## 🔒 Security Reminder

The default API key (`demo-api-key-2024`) is for development only. For production:
1. Generate a strong, unique API key
2. Use HTTPS/TLS encryption
3. Implement IP whitelisting if possible
4. Monitor API usage for anomalies
5. Rotate keys periodically