# BECMI Real-Time Simulator - Design Document

## Overview

An always-on BECMI-inspired fantasy world simulator that generates **emergent narrative logs** in real-time. The simulation prioritizes fascinating storytelling born from deep systems over strict rule fidelity.

## Core Philosophy

- **Emergent Narrative First**: Rich stories arise naturally from interacting systems
- **Cause and Effect**: Events spawn consequences that ripple through the world
- **Memorable Characters**: NPCs and antagonists have depth, relationships, and arcs
- **Atmospheric Prose**: Logs read like a chronicle, not a database dump
- **Scalable Depth**: Systems can be deepened without rewrites

## Time Model

- Wall clock = world clock (configurable multiplier for testing)
- **Turn** (10 min): Dungeon exploration granularity, minimal overworld use
- **Hour**: Travel progress, encounter checks, caravan movement
- **Day**: Weather changes, town beats, calendar progression, story advancement
- **Season**: Festivals, economic pulses, weather patterns

## World Structure

### Hex Map
- 6-mile hexes in a 6x6 starting region
- Terrain types: road, clear, forest, hills, mountains, swamp, desert
- Each terrain has unique encounter tables, atmospheric details, and travel modifiers

### Settlements
- Types: village, town, city
- Tracked: population, mood, supply/demand for goods, price trends
- Generate daily beats with notable NPCs and visiting parties

### Dungeons
- Stocked rooms with types: lair, trap, treasure, empty, shrine, laboratory
- Danger levels, rare finds (artifacts, relics, maps)
- Exploration consumes rooms, reveals loot, triggers encounters

### Roads & Trade Routes
- Connect settlements, speed travel
- Caravans move goods, create economic events
- Faction influence along routes

## Character Systems

### NPCs (Character Depth System)
Each NPC has:
- **Traits**: ambitious, cautious, greedy, honorable, cruel, etc.
- **Background**: noble-exile, veteran-soldier, escaped-slave, etc.
- **Motivation**: wealth, revenge, power, redemption, etc.
- **Relationships**: rival, ally, lover, mentor, debtor, etc.
- **Quirks**: behavioral details for flavor
- **Appearance**: physical descriptors

NPCs interact through relationship events, creating gossip and drama.

### Parties
- Adventuring companies and roaming bands
- Track fame, fatigue, wounds, goals
- Pursue rumors, explore dungeons, build reputations
- Fame affects reactions and spawns story opportunities

### Antagonists
Named villains with:
- **Type**: bandit-chief, orc-warlord, dark-wizard, vampire, dragon, cult-leader, etc.
- **Epithet**: "the Cruel", "Bonecruncher", "the Pallid"
- **Motivation**: Unique driving goal
- **Traits & Weaknesses**: Story hooks for their defeat
- **Notoriety**: How well-known; spawns rumors
- **Territory**: Where they operate

Antagonists take actions that affect settlements, spawn rumors, and create ongoing threats.

### Factions
- Focus: trade, martial, pious, arcane
- Attitudes toward settlements
- Wealth, influence, goals
- React to events (increase patrols, embargo, recruit, retaliate)

## Simulation Systems

### Travel
- Speed affected by terrain, fatigue, weather
- Encounters based on terrain, time of day, weather
- Signs/tracks hint at danger without combat
- Arrival scenes with atmospheric prose

### Enhanced Encounters
Rich encounters with:
- Named creatures for memorable fights
- Reaction rolls (friendly/cautious/hostile)
- Combat outcomes (victory/defeat/negotiation/flight)
- Consequences: delays, fatigue, wounds, treasure
- Story escalation for significant events

### Weather & Calendar
Fantasy calendar with:
- **Months**: Deepwinter, Thawmoon, Sowingtime, Rainmoon, etc.
- **Seasons**: Affect weather odds, travel, encounters
- **Moon Phases**: Full moon increases supernatural activity
- **Festivals**: Candlemas, Beltane, Midsummer, Harvest Home, etc.
- **Rare Events**: Eclipses, comets, earthquakes

Weather affects:
- Travel speed
- Encounter chances
- Atmospheric prose

### Consequence Chain System
Events spawn follow-up events:
- Combat → NPC reactions (flee, seek revenge, spread rumors)
- Caravan losses → Faction retaliation
- Discoveries → Rivals attracted
- Settlement violence → Mood shifts

Consequences are queued with delays, creating causality over time.

### Story Thread System
Emergent narratives tracked as ongoing threads:
- **Types**: hunt, feud, mystery, rescue, treasure, revenge, rise, fall, war, prophecy
- **Phases**: inciting, rising, climax, resolution, aftermath
- **Tension**: Builds through beats until resolution
- **Outcomes**: Multiple possible endings based on events

Stories spawn from significant events and progress over time.

## Prose & Narrative

### Prose Engine
Generates atmospheric text using:
- Time of day descriptors
- Terrain-specific sights, sounds, smells
- Settlement mood variations
- Weather conditions
- Character reactions

### Log Categories
- **town**: Settlement events, market beats, NPC drama
- **road**: Travel, encounters, arrivals, departures
- **dungeon**: Exploration, room events, discoveries
- **faction**: Antagonist actions, faction moves, story beats
- **weather**: Weather changes, festivals, calendar events
- **system**: Simulation meta-events

## Data & Persistence

- World state saved as JSON
- Logs written as JSONL + human-readable text
- Seeded RNG for reproducibility
- Enhanced state includes: calendar, antagonists, stories, consequence queue

## Running the Simulator

```bash
# Normal speed (1:1 real-time)
bun run start

# Accelerated (60x speed for testing)
SIM_TIME_SCALE=60 bun run start

# With custom seed
SIM_SEED=myseed bun run start
```

## Architecture

```
src/
├── index.ts          # Main loop, event handling
├── types.ts          # Core type definitions
├── config.ts         # Configuration & env vars
├── world.ts          # World generation
├── scheduler.ts      # Time management
├── events.ts         # Event bus
├── logging.ts        # Log output
├── rng.ts           # Seeded random
├── naming.ts        # Name generation
├── persistence.ts   # Save/load
│
├── prose.ts         # Atmospheric text generation
├── character.ts     # NPC depth & relationships
├── consequences.ts  # Cause-effect chains
├── calendar.ts      # Weather, seasons, festivals
├── antagonists.ts   # Named villains
├── encounters-enhanced.ts  # Rich encounters
├── stories.ts       # Emergent narratives
│
├── travel.ts        # Party movement
├── town.ts          # Settlement beats
├── trade.ts         # Caravan system
├── rumors.ts        # Information spread
├── factions.ts      # Faction behavior
├── dungeon.ts       # Dungeon exploration
├── stocking.ts      # Room generation
├── travelers.ts     # NPC travelers
└── npc.ts           # NPC utilities
```

## Future Enhancements

- **Dungeon Exploration Mode**: Detailed room-by-room delving
- **Mass Combat**: War Machine-style faction battles
- **Domain Management**: Strongholds, taxation, unrest
- **Magic System**: Spellcasters, artifacts, rituals
- **Religion**: Temples, divine favor, clerical events
- **Retainers**: Hireling system, loyalty, morale
- **Web Interface**: Real-time log viewer
- **AI Narration**: LLM-enhanced prose for key moments

## Sample Log Output

```
2026-01-15T09:00:00.000Z [road] @ Murkwell Forest [Valdris's Company] 
Valdris's Company clash with Blackhand's bandits — 
As rose light crept across the land, wolves prowled between ancient oaks. 
A band of scarred bandits, setting an ambush. Steel rang and blood was 
spilled, but they prevailed. The victors claim 35 coin worth of plunder.

2026-01-15T14:00:00.000Z [faction] 
A new tale begins: "The Hunt for Blackhand" — 
Valdris's Company stalks Blackhand across the region. A deadly game of 
cat and mouse unfolds near Murkwell Forest.

2026-01-16T06:00:00.000Z [weather] @ Thornwick 
The full moon rises — 
Silver light bathes the land. Strange things stir in the shadows.

2026-01-17T12:00:00.000Z [town] @ Thornwick 
Midsummer transforms Thornwick — 
The longest day. Grand markets, tournaments, and revelry. The temples 
are full. The taverns are fuller.
```
