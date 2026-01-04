#!/bin/bash
# Reset world to Jan 1 and catch up to present
# Usage: ./reset-to-jan1.sh [seed]
#   - If seed is provided as argument, use it
#   - If SIM_SEED env var is set, use it
#   - Otherwise, generate a timestamp-based seed

set -e

# Stop current simulation
echo "🛑 Stopping current simulation..."
pkill -f 'restart-wrapper' || true
sleep 2

# Archive old world and logs before deletion
ARCHIVE_DIR="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ARCHIVE_DIR"
echo "📦 Archiving old files to $ARCHIVE_DIR..."

[ -f world.json ] && cp world.json "$ARCHIVE_DIR/" && echo "  ✓ Archived world.json"
[ -f logs/events.log ] && cp logs/events.log "$ARCHIVE_DIR/" && echo "  ✓ Archived events.log"
[ -f logs/events.jsonl ] && cp logs/events.jsonl "$ARCHIVE_DIR/" && echo "  ✓ Archived events.jsonl"
[ -f simulation.log ] && cp simulation.log "$ARCHIVE_DIR/" && echo "  ✓ Archived simulation.log"

echo "📦 Archive complete: $ARCHIVE_DIR"

# Delete old world
echo "🗑️  Deleting old world and logs..."
rm -f world.json logs/events.* simulation.log

# Determine seed: command line arg > env var > auto-generate
if [ -n "$1" ]; then
  NEW_SEED="$1"
  echo "🎲 Using provided seed: $NEW_SEED"
elif [ -n "$SIM_SEED" ]; then
  NEW_SEED="$SIM_SEED"
  echo "🎲 Using SIM_SEED env var: $NEW_SEED"
else
  NEW_SEED=$(date +%s)
  echo "🎲 Auto-generated seed: $NEW_SEED"
fi

# Calculate days from Jan 1, 2026 to today (this year for 1:1 time)
# For 1:1 time: if it's Jan 4 in real time, world should be at Jan 4 (matching day of year)
JAN1="2026-01-01T00:00:00Z"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Calculate day of year for current date, then use that as days to simulate
DAYS=$(node -e "
const d2 = new Date('$NOW');
// For 1:1 time: calculate days from Jan 1 to current day of year (same year)
const startOfYear = new Date(d2.getFullYear(), 0, 1);
const dayOfYear = Math.floor((d2 - startOfYear) / (1000 * 60 * 60 * 24));
console.log(dayOfYear);
")

echo "📅 Starting from: $JAN1"
echo "📅 Current date: $NOW"
echo "⏱️  Days to simulate: $DAYS"

# Build
echo "🔨 Building..."
SIM_SEED=$NEW_SEED SIM_START_WORLD_TIME="$JAN1" bun run build

# Run batch mode to simulate everything from Jan 1 to present (no gaps!)
echo "🚀 Running batch mode to simulate $DAYS days (no gaps in logs)..."
SIM_SEED=$NEW_SEED SIM_START_WORLD_TIME="$JAN1" SIM_BATCH_DAYS=$DAYS node dist/fantasy-log.js

# Start normal real-time mode
echo "✅ Catch-up complete! Starting real-time simulation..."
SIM_SEED=$NEW_SEED SIM_START_WORLD_TIME="$JAN1" bun run build
nohup ./restart-wrapper.sh > simulation.log 2>&1 &

echo "🎉 Done! World started from Jan 1, 2026 and caught up to present."
echo "📊 Check logs: tail -f simulation.log"

