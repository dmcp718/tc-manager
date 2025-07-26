# Direct Link API Configuration for Docker

## Overview
The Direct Link feature requires access to the LucidLink API running on the host machine. Since Docker containers have their own network namespace, special configuration is needed to allow the containerized backend to communicate with the host's LucidLink service.

## Configuration

### Default Setup (Docker Desktop)
By default, the Docker configuration uses `host.docker.internal` which automatically resolves to the host machine's IP address. This works out of the box on:
- Docker Desktop for Mac
- Docker Desktop for Windows
- Docker Desktop for Linux (with `host.docker.internal` support)

### Environment Variables
- `LUCIDLINK_API_HOST`: The hostname/IP to reach the LucidLink API (default: `host.docker.internal` in Docker)
- `LUCIDLINK_FS_1_PORT`: The port where LucidLink API is listening (default: 9782)

### Alternative Configurations

#### 1. For Linux without Docker Desktop
If `host.docker.internal` is not available, you can use the host's IP address:

```bash
# Find your host IP (usually on docker0 interface)
ip addr show docker0

# Set the environment variable in docker-compose.yml
LUCIDLINK_API_HOST: 172.17.0.1  # Replace with your actual docker0 IP
```

#### 2. Using Host Network Mode (Linux only)
Add to the backend service in docker-compose.yml:
```yaml
backend:
  network_mode: host
  # Remove the ports section as it's not needed with host networking
```

#### 3. Custom Bridge Network
Create a custom network with a fixed gateway:
```yaml
networks:
  sitecache-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16
          gateway: 172.20.0.1
```

Then use `LUCIDLINK_API_HOST: 172.20.0.1`

## Testing Direct Link Connection

1. Ensure LucidLink is running on the host machine
2. Test connectivity from within the container:
```bash
docker exec sitecache-backend curl -v http://host.docker.internal:9782/
```

3. Test Direct Link generation:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"filePath":"/mnt/lucidlink/00_Media/test.mp4"}' \
  http://localhost:3001/api/direct-link
```

## Troubleshooting

### Connection Refused
- Verify LucidLink is running: `lsof -i :9782`
- Check firewall settings allow connections on port 9782
- Ensure LucidLink is bound to 0.0.0.0, not just 127.0.0.1

### DNS Resolution Issues
- Test resolution: `docker exec sitecache-backend nslookup host.docker.internal`
- Try using IP address directly instead of hostname

### Network Isolation
- Containers in custom networks may need explicit configuration
- Use `docker network inspect` to verify network settings