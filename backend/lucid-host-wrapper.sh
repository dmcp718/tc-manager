#!/bin/bash
# Wrapper script to execute lucid commands on the host from inside the container
# Usage: ./lucid-host-wrapper.sh [lucid command args...]

# Execute lucid command on the host
docker run --rm --network host \
  -v /home/ubuntu/.lucid:/home/ubuntu/.lucid \
  -e HOME=/home/ubuntu \
  --user 1000:1000 \
  lucidlink/client:latest \
  lucid "$@"