# BECMI Real-Time Simulator Plan

## Goals
- Always-on BECMI-inspired world that runs in 1:1 real time (server clock is game clock).
- Generate sparse, flavorful logs of notable events (town life, travel, encounters, factions).
- Scalable: add depth via pluggable subsystems without rewrites.
- Deterministic runs via seeded RNG; accelerated mode for automated tests.

## Time Model
- Wall clock = world clock. Smallest cadence for the overworld loop is the 10-minute turn (10 real minutes). Encounter mode can temporarily use 10-second rounds but auto-resolves quickly.
- Cadences:
  - Per-turn (10 min): travel progress, encounter checks, light/noise/search states.
  - Hourly: settlement beats (markets, crime, rumors), weather drift.
  - Daily: weather roll, upkeep, rest, hooks; faction/domain ticks.
  - Weekly/Seasonal: economy pulses, festivals, taxation/unrest.
- Modes: real-time 1:1 and accelerated test mode (configurable multiplier, e.g., 1 real second = 10 in-world minutes) with identical logic paths.

## World Scope (initial)
- Hex scale: 6-mile hexes; starter region 6x6 to 10x10 hexes.
- Seed 2–4 settlements (1 “capital/market”, villages/hamlets) and 1 starter dungeon.
- Actors: 1 adventuring party, 1–2 roaming NPC bands, a few named faction leaders.
- Use `data/places.ts` and `data/names.ts` for all place/people naming.

## Subsystems (pluggable)
- Core loop: scheduler keyed to wall clock; event queue; publishes ticks to subsystems.
- World state:
  - Hexes: terrain, road/river, feature tags, danger level.
  - Settlements: population, ruler, garrison, market profile, services, mood.
  - Dungeons: levels, rooms, stocking, control faction.
  - Factions: attitudes, resources, goals.
  - Actors: parties/bands with inventories, goals, locations, current activity.
  - Environment: calendar, season, weather.
- Generators (BECMI-guided):
  - Terrain/hex map, settlement stats/markets, dungeon layouts/stocking, encounter tables by terrain, treasure, rumors/hooks.
- Systems (incrementally deepened):
  - Travel/navigation (terrain costs, getting lost, foraging).
  - Encounter chance (day/night odds), reaction (2d6), morale, surprise; abstract combat resolution.
  - Exploration states (cautious/normal/hurried), light/noise, wandering checks.
  - Town beats: markets, crime, disputes, festivals, hiring/retainers.
  - Factions: goal planning (expand, trade, raid, intrigue), attitude shifts.
  - Domain/economy: taxation, unrest, supply/demand pulses, trade routes (later).
  - Magic/religion hooks: services, omens, rare events.

## Logging & Narrative
- Append-only text + JSONL:
  - `timestamp_real`, `timestamp_world`, `category` (town, road, dungeon, faction, weather), `actors`, `location`, `summary`, `details`, `seed`.
- Style: default “chronicle”; support profiles later (gazetteer, bardic, war chronicle).
- Rate limits per channel to avoid spam; prioritize notable actors/places/factions.
- Occasional vignettes for high-salience moments; otherwise terse lines.

## Data & Persistence
- Preference: SQLite for core state (safe updates), JSONL for logs. Configurable file-based state for early simplicity.
- Seeded RNG with subsystem-specific streams to keep outcomes stable across runs/replays.
- Snapshot/restore: serialize world state + RNG positions for tests and fast-forwarding.

## Testing & Automation
- Accelerated mode for CI/regression (time multiplier).
- Deterministic seeds; golden log snippets for expectations.
- Property tests:
  - Encounter rates within table bands by terrain and time-of-day.
  - Travel distances per terrain/encumbrance match BECMI rates.
  - Reaction/morale distributions within expected ranges.
  - State invariants (no negative populations/resources; actor positions in-bounds).
- Scenario tests: fixed seed → advance N days → assert counts (encounters/day, town events), survival of parties, presence of at least one notable hook.
- Metrics counters exposed alongside logs (encounters by terrain, deaths, town events) for assertions.

## Milestones
1) MVP loop
   - Real-time + accelerated scheduler, event bus.
   - Single region, 2–4 settlements, 1 dungeon, 1 party, 1 roaming band.
   - Travel + encounter odds + reaction/morale; abstract combat; daily weather.
   - Logging contract implemented; JSONL + text streaming.
2) Encounters & exploration depth
   - Dungeon stocking (rooms/treasure/traps), wilderness encounter tables, signs/tracks, cautious vs hurried travel, light/noise.
3) Town life & economy beats
   - Markets, crime/disputes, hiring/retainer availability, supply/demand pulses, rumors.
4) Factions & goals
   - Faction resources/goals, attitude matrix, diplomacy shifts, small conflicts.
5) Domains & war machine
   - Strongholds, taxation/unrest, mass combat abstraction for faction clashes.
6) Polishing & narrative styles
   - Style profiles, rate limiting, filters, UI/API hook later.

## Extensibility Notes
- Keep subsystems event-driven; avoid tight coupling.
- Use configuration for region size, cadences, verbosity, and time multiplier.
- All names/places sourced from `data/names.ts` and `data/places.ts` to stay consistent.

