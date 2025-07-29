#!/bin/bash
# Collect host system information and save as JSON file
# This script should be run on the host system before starting containers

OUTPUT_FILE="${1:-./host-info.json}"

# Start JSON
echo "{" > "$OUTPUT_FILE"

# Hostname
echo "  \"hostname\": \"$(hostname)\"," >> "$OUTPUT_FILE"

# OS Release
OS_RELEASE=$(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')
echo "  \"release\": \"$OS_RELEASE\"," >> "$OUTPUT_FILE"

# CPU Info
CPU_MODEL=$(cat /proc/cpuinfo | grep "model name" | head -1 | cut -d: -f2 | xargs)
CPU_CORES=$(nproc)
echo "  \"cpu\": {" >> "$OUTPUT_FILE"
echo "    \"model\": \"$CPU_MODEL\"," >> "$OUTPUT_FILE"
echo "    \"cores\": $CPU_CORES" >> "$OUTPUT_FILE"
echo "  }," >> "$OUTPUT_FILE"

# Memory Info
MEM_TOTAL_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
MEM_TOTAL_GB=$(echo "scale=1; $MEM_TOTAL_KB / 1024 / 1024" | bc)
echo "  \"memory\": {" >> "$OUTPUT_FILE"
echo "    \"total_kb\": $MEM_TOTAL_KB," >> "$OUTPUT_FILE"
echo "    \"total_gb\": \"$MEM_TOTAL_GB\"" >> "$OUTPUT_FILE"
echo "  }," >> "$OUTPUT_FILE"

# Network Info - Primary IP
PRIMARY_IP=$(ip route get 1.1.1.1 2>/dev/null | head -1 | awk '{print $7}')
PRIMARY_IFACE=$(ip route get 1.1.1.1 2>/dev/null | head -1 | awk '{print $5}')
echo "  \"network\": {" >> "$OUTPUT_FILE"
echo "    \"primary_ip\": \"${PRIMARY_IP:-unknown}\"," >> "$OUTPUT_FILE"
echo "    \"primary_interface\": \"${PRIMARY_IFACE:-unknown}\"" >> "$OUTPUT_FILE"
echo "  }," >> "$OUTPUT_FILE"

# Storage Info with mount points
echo "  \"storage\": [" >> "$OUTPUT_FILE"

# Get lsblk output with mountpoints
FIRST=true
while IFS= read -r line; do
    if [[ ! "$line" =~ ^loop ]]; then  # Skip loop devices
        NAME=$(echo "$line" | awk '{print $1}')
        SIZE=$(echo "$line" | awk '{print $2}')
        TYPE=$(echo "$line" | awk '{print $3}')
        FSTYPE=$(echo "$line" | awk '{print $4}')
        MOUNTPOINT=$(echo "$line" | awk '{print $5}')
        
        # Get usage for mounted filesystems
        USAGE="-"
        if [[ "$MOUNTPOINT" != "" && "$MOUNTPOINT" != "-" ]]; then
            USAGE=$(df -h "$MOUNTPOINT" 2>/dev/null | tail -1 | awk '{print $5}')
        fi
        
        if [[ "$FIRST" == "true" ]]; then
            FIRST=false
        else
            echo "," >> "$OUTPUT_FILE"
        fi
        
        echo -n "    {" >> "$OUTPUT_FILE"
        echo -n "\"name\": \"$NAME\", " >> "$OUTPUT_FILE"
        echo -n "\"size\": \"$SIZE\", " >> "$OUTPUT_FILE"
        echo -n "\"type\": \"$TYPE\", " >> "$OUTPUT_FILE"
        echo -n "\"fstype\": \"${FSTYPE:-}\", " >> "$OUTPUT_FILE"
        echo -n "\"mountpoint\": \"${MOUNTPOINT:-}\", " >> "$OUTPUT_FILE"
        echo -n "\"usage\": \"${USAGE:-}\"" >> "$OUTPUT_FILE"
        echo -n "}" >> "$OUTPUT_FILE"
    fi
done < <(lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT -n 2>/dev/null || echo "")

echo "" >> "$OUTPUT_FILE"
echo "  ]," >> "$OUTPUT_FILE"

# Timestamp
echo "  \"collected_at\": \"$(date -Iseconds)\"" >> "$OUTPUT_FILE"

# End JSON
echo "}" >> "$OUTPUT_FILE"

echo "Host information collected and saved to: $OUTPUT_FILE"