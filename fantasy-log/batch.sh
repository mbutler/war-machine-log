#!/bin/bash
# Fantasy Log - Batch Mode Script
# Generate a world from a start date up to N days
#
# Usage: 
#   ./batch.sh                        # Auto-calculate days, auto-generate seed
#   ./batch.sh gator                  # Use seed "gator", auto-calculate days
#   ./batch.sh gator 30               # Use seed "gator", simulate 30 days
#   SIM_START_WORLD_TIME="2025-06-01T00:00:00Z" ./batch.sh gator

set -e

# First arg is seed (optional), second is days (optional)
SEED=${1:-${SIM_SEED:-$(date +%s)}}
# Calculate days since Jan 1 in UTC (simulation uses UTC time)
DAYS=${2:-$(node -e "const d=new Date(); const jan1=new Date(Date.UTC(d.getUTCFullYear(),0,1)); console.log(Math.floor((d-jan1)/(1000*60*60*24)))")}
START=${SIM_START_WORLD_TIME:-"2026-01-01T00:00:00Z"}

echo "═══════════════════════════════════════════════════════════════════"
echo "  BECMI Batch Mode"
echo "═══════════════════════════════════════════════════════════════════"
echo "  Seed: $SEED"
echo "  Start: $START"
echo "  Days: $DAYS"
echo "═══════════════════════════════════════════════════════════════════"

# Archive existing files
if [ -f world.json ] || [ -f logs/events.log ]; then
    ARCHIVE_DIR="backups/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$ARCHIVE_DIR"
    echo "📦 Archiving existing files to $ARCHIVE_DIR"
    [ -f world.json ] && cp world.json "$ARCHIVE_DIR/"
    [ -f logs/events.log ] && cp logs/events.log "$ARCHIVE_DIR/"
    [ -f logs/events.jsonl ] && cp logs/events.jsonl "$ARCHIVE_DIR/"
fi

# Delete old world (start fresh)
rm -f world.json logs/events.*

# Ensure logs directory exists
mkdir -p logs

# Build first
echo "🔨 Building..."
bun run build

echo "🚀 Running batch simulation..."
SIM_SEED="$SEED" \
SIM_START_WORLD_TIME="$START" \
SIM_BATCH_DAYS="$DAYS" \
SIM_CATCH_UP_SPEED=0 \
bun run dist/fantasy-log.js

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  ✅ Batch Complete"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "  Files to upload to server (no dist/ folder on server!):"
echo ""
echo "    scp dist/fantasy-log.js dist/index.php user@server:/path/to/app/"
echo "    scp world.json start.sh fantasy-log.service user@server:/path/to/app/"
echo "    scp -r logs user@server:/path/to/app/"
echo ""
echo "  To run on server (systemd recommended):"
echo "    sudo cp fantasy-log.service /etc/systemd/system/"
echo "    sudo systemctl daemon-reload"
echo "    sudo systemctl enable --now fantasy-log"
echo ""
