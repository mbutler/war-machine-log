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

Edit `src/config.ts` to change:
- `seed` — Random seed for reproducible worlds
- `timeScale` — Speed multiplier (1 = real-time)
- `startWorldTime` — When the simulation begins

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

