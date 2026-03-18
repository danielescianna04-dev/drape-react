#!/bin/bash
# Monitor container CPU usage, kill crypto miners
# Run via cron every 30 seconds

THRESHOLD=80
DURATION_FILE="/tmp/drape-cpu-alerts"

docker stats --no-stream --format "{{.Container}} {{.CPUPerc}}" | while read container cpu; do
  cpu_num=$(echo $cpu | tr -d '%')
  if (( $(echo "$cpu_num > $THRESHOLD" | bc -l) )); then
    count=$(grep -c "$container" "$DURATION_FILE" 2>/dev/null || echo 0)
    echo "$container" >> "$DURATION_FILE"
    if [ "$count" -ge 10 ]; then  # 10 checks * 30s = 5 min sustained
      echo "[ALERT] Killing container $container for sustained high CPU ($cpu)"
      docker kill "$container"
      sed -i "/$container/d" "$DURATION_FILE"
    fi
  else
    sed -i "/$container/d" "$DURATION_FILE" 2>/dev/null
  fi
done
