# BECMI Real-Time Fantasy Simulator

A living fantasy world simulation that generates emergent narratives in real-time, inspired by the BECMI D&D ruleset.

## Quick Start

```bash
# Install dependencies
bun install

# Run the simulator
bun run start

# Or with hot-reload (development)
bun run dev

# Run the bundled version
bun run dist/fantasy-log.js
```

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

## Output

### Console
```
╔════════════════════════════════════════════════════════════════╗
║  BECMI Real-Time Simulator                                     ║
║  15th of Deepwinter, Year 1056                                 ║
╠════════════════════════════════════════════════════════════════╣
║  Seed: default-seed                                            ║
║  Time Scale: 1x (turn every 600000ms)                          ║
║  Settlements: 3   Parties: 2   Antagonists: 2                  ║
║  Active Stories: 0                                             ║
╚════════════════════════════════════════════════════════════════╝
```

### Log Files
- `logs/events.log` — Human-readable narrative log
- `logs/events.jsonl` — Machine-readable JSON Lines format

### World State
- `world.json` — Complete world state, persists between runs

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SIM_SEED` | `default-seed` | Random seed for reproducible worlds |
| `SIM_TIME_SCALE` | `1` | Speed multiplier (1 = real-time, 60 = 1 min/sec) |
| `SIM_CATCH_UP` | `true` | Enable catch-up mode on restart |
| `SIM_CATCH_UP_SPEED` | `10` | Turns per second during catch-up |
| `SIM_LOG_DIR` | `logs` | Directory for log files |

Example:
```bash
SIM_SEED=my-world SIM_TIME_SCALE=60 bun run start
```

## Persistence & Catch-Up

The world **persists** between runs via `world.json`. When you stop and restart:

1. The simulator detects how much real time has passed
2. It simulates the missed time at accelerated speed (catch-up mode)
3. Then resumes 1:1 real-time simulation

```
⏰ Catching up 2d 6h of missed time (324 turns)...
⏰ Catch-up progress: 50% (162/324 turns)
✓ Caught up! World time is now synchronized.
```

### Catch-Up Limits
- **Maximum**: 7 days of catch-up (to prevent hours-long waits)
- Beyond 7 days, the world catches up 7 days then continues

### Disable Catch-Up
```bash
# Skip catch-up, jump directly to current time
SIM_CATCH_UP=false bun run start
```

### Fresh Start
To reset the world completely:
```bash
rm world.json logs/events.*
bun run start
```

### New World with Different Names
The seed controls procedural generation. Same seed = same towns, NPCs, and factions.

```bash
# Delete old world and use a new seed
rm world.json logs/events.*
SIM_SEED=my-unique-world bun run start

# Or use a random seed (timestamp)
rm world.json logs/events.*
SIM_SEED=$(date +%s) bun run start
```

| Scenario | Result |
|----------|--------|
| `world.json` exists | Loads saved world (continues simulation) |
| `world.json` deleted, same seed | Regenerates identical world |
| `world.json` deleted, new seed | Completely new world with different names |

## Backwards Compatibility

The simulator is designed to let you **make code changes while a simulation is running**. When you restart, your existing `world.json` will be migrated automatically.

### Safe Changes ✅

| Change | Why It's Safe |
|--------|---------------|
| Adding new fields to entities | Defaults are applied during load |
| Adding new event/story types | Old stories continue unchanged |
| Adding new subsystems | Initialized with defaults on load |
| Tweaking probabilities | Only affects future events |
| Adding new terrain types | Old hexes keep their terrain |
| Bug fixes | Won't corrupt existing state |

### Risky Changes ⚠️

| Change | Risk | Mitigation |
|--------|------|------------|
| Renaming fields | Load fails | Create migration in `normalize()` |
| Changing field types | Parse error | Add type coercion in `normalize()` |
| Removing required fields | Undefined errors | Keep deprecated fields temporarily |
| Changing enum values | Invalid state | Map old values to new in `normalize()` |

### Schema Versioning

The world file includes a `schemaVersion` field. When loading an older version:
```
📦 Migrating world from schema v1 to v2...
✓ World loaded successfully (schema v2)
```

### Best Practices for Long-Running Simulations

1. **Test changes with stress tests first**: `bun run src/stress-test.ts`
2. **Back up your world**: `cp world.json world.backup.json`
3. **Add new features with defaults**: `newField ?? defaultValue`
4. **Don't delete old fields** — mark them deprecated instead

## Building

```bash
# Bundle for Bun runtime
bun run build

# Bundle for Node.js
bun run build:node

# Output: dist/fantasy-log.js
```

## Stress Testing

Run 90 simulated days as fast as possible to verify system stability:

```bash
bun run src/stress-test.ts
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

## License

MIT

