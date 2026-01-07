#!/bin/bash
# Fantasy Log - Simple Start Script
# Runs the compiled simulation with auto-restart on crash
#
# Prerequisites on server:
#   - bun installed (https://bun.sh)
#   - fantasy-log.js (compiled app)
#   - world.json (world state)
#   - logs/ directory

set -e

echo "═══════════════════════════════════════════════════════════════════"
echo "  BECMI Real-Time Simulator"
echo "═══════════════════════════════════════════════════════════════════"

# Kill any existing simulation processes
echo "🛑 Stopping existing processes..."
pkill -f "fantasy-log.js" 2>/dev/null || true
sleep 1

# Ensure logs directory exists
mkdir -p logs

# Find the JS file to run
if [ -f "fantasy-log.js" ]; then
    JS_FILE="fantasy-log.js"
else
    echo "❌ Cannot find fantasy-log.js in current directory."
    echo "   On server: copy dist/fantasy-log.js here"
    echo "   Locally: run 'bun run build' first, then use dist/fantasy-log.js"
    exit 1
fi

while true; do
    echo "🚀 Starting simulation (using $JS_FILE)..."
    
    if command -v bun >/dev/null 2>&1; then
        bun run "$JS_FILE"
    else
        echo "❌ Bun not found. Please install: curl -fsSL https://bun.sh/install | bash"
        exit 1
    fi

    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ Clean exit. Stopping."
        break
    else
        echo "⚠️  Crashed with code $EXIT_CODE. Restarting in 5 seconds..."
        sleep 5
    fi
done
