# Elasticsearch Development Setup

This guide shows how to quickly set up Elasticsearch for local development without rebuilding Docker containers.

## Quick Local Setup (Recommended for Development)

### Option 1: Docker Run (Simplest)
```bash
# Start Elasticsearch in a container with proper settings
docker run -d \
  --name sitecache-elasticsearch-dev \
  -p 9200:9200 \
  -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  -e "ES_JAVA_OPTS=-Xms1g -Xmx1g" \
  docker.elastic.co/elasticsearch/elasticsearch:8.11.0

# Test connection
curl http://localhost:9200
```

### Option 2: Using Homebrew (macOS)
```bash
# Install Elasticsearch
brew install elasticsearch

# Start Elasticsearch
brew services start elasticsearch

# Test connection
curl http://localhost:9200
```

### Option 3: Direct Download
```bash
# Download and extract
wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.0-linux-x86_64.tar.gz
tar -xzf elasticsearch-8.11.0-linux-x86_64.tar.gz
cd elasticsearch-8.11.0

# Configure for development
echo "xpack.security.enabled: false" >> config/elasticsearch.yml
echo "discovery.type: single-node" >> config/elasticsearch.yml

# Start
./bin/elasticsearch
```

## Backend Development Setup

1. **Install dependencies**:
```bash
cd backend
npm install
```

2. **Start backend with Elasticsearch support**:
```bash
# Set environment variables for local ES
export ELASTICSEARCH_HOST=localhost
export ELASTICSEARCH_PORT=9200
export ELASTICSEARCH_INDEX=sitecache-files

# Start backend
npm start
```

## Testing the Integration

### Test Elasticsearch Connection
```bash
# Check if ES is running
curl http://localhost:9200/_cluster/health

# Check backend connection
curl http://localhost:3001/api/search/stats
```

### Test Search Endpoints
```bash
# PostgreSQL search (existing)
curl "http://localhost:3001/api/search?q=test"

# Elasticsearch search (new)
curl "http://localhost:3001/api/search/es?q=test"

# Search with filters
curl "http://localhost:3001/api/search/es?q=video&is_directory=false&extension=.mp4"

# Get suggestions
curl "http://localhost:3001/api/search/suggestions?q=vid"
```

## Development Workflow

1. **Start Elasticsearch** (using any method above)
2. **Start backend** with ES environment variables
3. **Backend will automatically**:
   - Connect to Elasticsearch
   - Create the index if it doesn't exist
   - Fall back to PostgreSQL if ES is unavailable

4. **Index some files**:
   - Use the existing file indexing process
   - Files will be indexed into both PostgreSQL and Elasticsearch

## Environment Variables

```bash
# Elasticsearch configuration
ELASTICSEARCH_HOST=localhost          # Default: localhost
ELASTICSEARCH_PORT=9200              # Default: 9200
ELASTICSEARCH_INDEX=sitecache-files  # Default: sitecache-files
```

## API Endpoints

- `GET /api/search` - PostgreSQL search (existing)
- `GET /api/search/es` - Elasticsearch search (new)
- `GET /api/search/suggestions` - Search autocomplete
- `GET /api/search/stats` - Elasticsearch index statistics

## Production Deployment

For production, use the docker-compose service:

```bash
# Start all services including Elasticsearch
docker-compose up -d

# The backend will automatically connect to the ES container
```

## Troubleshooting

### Elasticsearch not starting
- Check if port 9200 is already in use: `lsof -i :9200`
- Check Java is installed and JAVA_HOME is set
- Try increasing heap size: `-e "ES_JAVA_OPTS=-Xms2g -Xmx2g"`

### Backend can't connect to Elasticsearch
- Verify ES is running: `curl http://localhost:9200`
- Check environment variables are set correctly
- Look for connection errors in backend logs
- Backend will fall back to PostgreSQL search if ES is unavailable

### Index not created
- Check ES cluster health: `curl http://localhost:9200/_cluster/health`
- Verify index exists: `curl http://localhost:9200/sitecache-files`
- Check backend logs for index creation errors