#!/bin/bash
# Bridge script to run lucid perf on host and make data available to container
# This script runs on the host and outputs to a shared location

OUTPUT_FILE="/tmp/lucid-perf-output"

# Run lucid perf continuously and output to shared file
lucid perf --seconds 1 --objectstore getBytes,getTime > "$OUTPUT_FILE" 2>&1 &
LUCID_PID=$!

# Handle cleanup on exit
cleanup() {
    kill $LUCID_PID 2>/dev/null
    rm -f "$OUTPUT_FILE"
    exit 0
}
trap cleanup EXIT INT TERM

# Wait for lucid process
wait $LUCID_PID