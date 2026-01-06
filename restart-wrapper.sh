#!/bin/bash
# Fantasy Log Auto-Restart Script
# 1. Kills any existing fantasy-log or restart-wrapper processes
# 2. Starts the CURRENT world.json and CURRENT logs (no regeneration!)
# 3. Continues simulation from last saved state
# 4. Restarts automatically if the simulation crashes
# 5. Designed to run with nohup for background execution

echo "$(date): Starting fantasy-log simulation with auto-restart..."

# Kill any existing running processes (excluding ourselves)
echo "$(date): Killing any existing simulation processes..."
CURRENT_PID=$$

# Kill other restart-wrapper processes (not ourselves)
for pid in $(pgrep -f "restart-wrapper"); do
  if [ "$pid" != "$CURRENT_PID" ]; then
    kill -9 $pid 2>/dev/null || true
  fi
done

# Kill fantasy-log processes
pkill -9 -f "fantasy-log.js" 2>/dev/null || true
pkill -9 -f "bun.*fantasy-log" 2>/dev/null || true
sleep 1

while true; do
    echo "$(date): Launching process..."
    if command -v bun >/dev/null 2>&1; then
        echo "$(date): Using bun..."
        SIM_LOG_DIR=logs bun run fantasy-log.js
    else
        echo "$(date): ERROR: Neither bun nor node found!"
        exit 1
    fi

    EXIT_CODE=$?
    echo "$(date): Process exited with code $EXIT_CODE"

    if [ $EXIT_CODE -eq 0 ]; then
        echo "$(date): Clean exit detected. Not restarting."
        break
    else
        echo "$(date): Crash detected. Restarting in 5 seconds..."
        sleep 5
    fi
done

echo "$(date): Simulation monitoring ended."
