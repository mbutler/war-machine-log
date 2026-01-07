# BECMI Real-Time Fantasy Simulator

A living fantasy world simulation that generates emergent narratives in real-time, inspired by the BECMI D&D ruleset.

## Quick Start

### Generate a world locally:
```bash
# Install bun if you haven't: https://bun.sh
bun install

# Generate a world with seed "gator" from Jan 1 to today
./batch.sh gator
```

### Deploy to server:
```bash
# Upload files (no dist/ folder on server - files go to root):
scp dist/fantasy-log.js dist/index.php user@server:/path/to/app/
scp world.json start.sh user@server:/path/to/app/
scp -r logs user@server:/path/to/app/

# On server:
cd /path/to/app
bun run fantasy-log.js
```

That's it! The simulation will catch up any missed time and run in real-time.

## What It Does

The simulator creates a persistent fantasy world that evolves in **1:1 real-time**. Events happen at the same pace they would in the game world—a 3-day journey takes 3 real days.

Watch as:
- Adventuring parties travel between settlements and explore dungeons
- Named antagonists scheme, raid, and remember their defeats
- Noble bloodlines marry, have children, and struggle for succession
- Thieves' guilds plan heists and wage turf wars
- Monster populations breed, migrate, and compete for territory
- Ships sail between ports carrying exotic goods and rumors from distant lands
- Weather changes with the seasons, affecting travel and morale
- Story threads emerge organically from world events

## Workflow

### 1. Generate World (Local Machine)

```bash
./batch.sh gator           # Seed "gator", auto-calculate days since Jan 1
./batch.sh gator 30        # Seed "gator", simulate 30 days
./batch.sh                 # Auto-generate seed, auto-calculate days
```

The batch script will:
1. Build the compiled `dist/fantasy-log.js`
2. Create a fresh world with your seed
3. Simulate from Jan 1 to today (or specified days)
4. Output the files you need for deployment

### 2. Upload to Server

**Minimal files needed on server:**

```
/path/to/app/
├── fantasy-log.js          # The compiled app (copy from dist/)
├── world.json              # World state (includes the seed)
├── start.sh                # Optional: auto-restart wrapper
├── fantasy-log.service     # Optional: systemd service file
├── index.php               # Optional: web interface
└── logs/
    ├── events.log          # Human-readable chronicle
    └── events.jsonl        # Machine-readable log (for web interface)
```

**No `dist/` folder, no source code, no node_modules, no package.json needed!**

```bash
# Copy from dist/ to server root (no dist/ folder on server)
scp dist/fantasy-log.js dist/index.php user@server:/path/to/app/
scp world.json start.sh fantasy-log.service user@server:/path/to/app/
scp -r logs user@server:/path/to/app/
```

### 3. Run on Server

```bash
# Direct run
bun run fantasy-log.js

# With auto-restart on crash
./start.sh

# Background with nohup
nohup ./start.sh > simulation.log 2>&1 &
```

On startup, the simulation will:
1. Load `world.json` (which contains the seed)
2. Catch up from `lastTickAt` to current time
3. Switch to real-time mode (1 tick per 10 minutes)

## Deterministic Simulation

**Same seed + same start time = identical results.**

The RNG is fully seeded, so:
- Batch mode produces reproducible logs
- Catch-up after downtime produces the same events that "would have happened"
- You can regenerate a world from scratch and get identical results

The seed is stored in `world.json`, so you only specify it once when creating the world.

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SIM_SEED` | auto-generated | Random seed (only needed for new worlds) |
| `SIM_START_WORLD_TIME` | `2026-01-01T00:00:00Z` | When the world begins |
| `SIM_BATCH_DAYS` | (none) | If set, simulate N days then exit |
| `SIM_CATCH_UP_SPEED` | `100` | Turns per second during catch-up (0 = max) |
| `SIM_LOG_DIR` | `logs` | Directory for log files |

## Output

### Web Interface
- Open `index.php` in your browser for a live event feed
- Hover over events for mysterious "glimpses" behind the simulation
- Auto-refreshes every 60 seconds
- Shows the last 50 events (configurable via URL: `?limit=100`)

### Log Files
- `logs/events.log` — Human-readable chronicle
- `logs/events.jsonl` — Machine-readable JSON Lines (feeds the web interface)

### World State
- `world.json` — Complete world state, persists between runs

## Process Management

### Recommended: systemd (Linux servers)

The best way to run the simulation on a Linux server:

```bash
# 1. Copy the service file to systemd
sudo cp fantasy-log.service /etc/systemd/system/

# 2. Edit paths to match your setup
sudo nano /etc/systemd/system/fantasy-log.service

# 3. Enable and start
sudo systemctl daemon-reload
sudo systemctl enable fantasy-log
sudo systemctl start fantasy-log
```

**Benefits:**
- Auto-restart on crash
- Starts on server boot
- Proper logging via journald
- Clean stop/start commands

```bash
# Commands
sudo systemctl status fantasy-log   # Check status
sudo systemctl stop fantasy-log     # Stop
sudo systemctl restart fantasy-log  # Restart
sudo journalctl -u fantasy-log -f   # View logs
```

### Alternative: nohup (simple)

```bash
# Start in background
nohup bun run fantasy-log.js > simulation.log 2>&1 &

# Stop
pkill -SIGINT -f 'fantasy-log'
```

### Alternative: start.sh (auto-restart wrapper)

```bash
nohup ./start.sh > simulation.log 2>&1 &
```

### Monitoring
```bash
# Check if running
ps aux | grep fantasy-log

# Watch the log
tail -f simulation.log

# Check web interface
curl http://localhost/index.php
```

## Catch-Up Behavior

When the simulation starts, it compares `lastTickAt` in `world.json` to the current time:

- **If behind**: Rapidly simulates missed time (deterministically)
- **If current**: Runs in real-time mode immediately

```
⏳ Catching up: 324 turns (2d 6h)
   Progress: 50% (162/324 turns) - January 3rd, 2026
✅ Catch-up complete!

🚀 Starting real-time simulation (1 tick per 10 minutes)
```

### Catch-Up Limits
- Default max: 30 days (configurable via `SIM_MAX_CATCH_UP_DAYS`)
- Speed: 100 turns/second by default (configurable via `SIM_CATCH_UP_SPEED`)

## Fresh Start

To completely reset and start a new world:

```bash
# Local: generate new world
rm world.json logs/events.*
./batch.sh new-seed

# Or on server: delete and let it create fresh
rm world.json logs/events.*
SIM_SEED=new-seed bun run fantasy-log.js
```

## Building

```bash
# Bundle for Bun runtime (recommended)
bun run build
# Output: dist/fantasy-log.js

# Bundle for Node.js (alternative)
bun run build:node
```

## Systems

| System | Description |
|--------|-------------|
| **Calendar** | Seasons, weather, moon phases, festivals |
| **Travel** | Parties journey between locations with encounters |
| **Dungeons** | Room-by-room exploration with BECMI treasure types |
| **Antagonists** | Named villains with motivations and memories |
| **Stories** | 30+ emergent narrative templates |
| **Dynasty** | Noble bloodlines, marriages, succession crises |
| **Guilds** | Thieves' guild heists, fencing, turf wars |
| **Ecology** | Monster populations, breeding, migration |
| **Naval** | Ships, ports, pirates, sea monsters, distant lands |
| **War Machine** | BECMI-inspired mass combat |
| **Treasure** | Full BECMI treasure types A-V with magic items |
| **Rumors** | Information spreads and creates consequences |

## Cross-System Integration

Events in one system ripple through others:
- Monster migrations change encounter tables
- Guild heists lower settlement mood
- Noble weddings boost town morale
- Ship arrivals bring rumors from procedurally-generated distant lands
- Treasure discoveries spawn rumors that attract rivals
- Weather affects travel time, naval voyages, and encounter rates

## Backwards Compatibility

The simulator lets you make code changes while a simulation is running. When you restart, `world.json` is migrated automatically.

### Safe Changes ✅
- Adding new fields to entities (defaults applied)
- Adding new event/story types
- Adding new subsystems
- Tweaking probabilities
- Bug fixes

### Schema Versioning

The world file includes a `schemaVersion` field:
```
📦 Migrating world from schema v1 to v2...
✓ World loaded successfully (schema v2)
```

## License

MIT
