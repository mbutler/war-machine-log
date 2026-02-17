# BECMI D&D Rules Compliance Audit

This document audits the current JavaScript implementation against the official BECMI Rules Cyclopedia to identify discrepancies, missing features, incorrect implementations, and areas requiring compliance fixes. The goal is 100% compliance with official rules.

## Key Findings Summary

### Major Missing Components:
- **Spell Casting Effects & Resolution** - Spell lists and slot progressions exist, but most individual spell effects, ranges, durations, and saving throw interactions are not yet encoded
- **Advanced / Optional Subsystems** - Weapon mastery, general skills, expanded combat modes (two-weapon fighting, detailed unarmed, naval/aerial/underwater combat), and planar/Immortal rules are not modeled

### Partially Implemented but Needing Work:
- **Thief Special Abilities** - Backstab, scroll reading/casting abilities missing
- **Class Restrictions** - Weapon restrictions (e.g., clerics can't use edged weapons) not fully enforced
- **Morale & Loyalty Outside Dungeons** - Dungeon monster morale is implemented with BECMI triggers; retainer/hireling morale and broader campaign-scale morale still need coverage
- **Weather Effects** - Wilderness weather is generated and displayed, but its mechanical impact on travel and encounters is limited

### Well Implemented:
- **Experience Point System** - XP tables for all classes (including demihumans and optional classes), character `xp` field, prime requisite XP bonuses, monster XP awards, and automatic level-up are implemented
- **Demihuman Mechanics** - Demihuman saving throws are implemented with correct progressions; demihuman THAC0 uses fighter progression (attack-rank equivalent) but needs numeric verification
- **Ability Modifiers** - Ability score modifier table is implemented and used throughout character generation and derived stats
- **Spell Lists & Slots** - Magic-User, Cleric, and Druid spell lists and slot progressions exist and are wired into character spellbooks
- **Thief Skill Tables** - Basic thief skill percentages through level 14 are implemented and adjusted by Dexterity
- **Dungeon & Wilderness Encounters** - BECMI-style dungeon and wilderness encounter tables, surprise, reaction, and encounter distance are implemented and integrated with the Calendar and Ledger systems

### Implementation Priority

**High Priority** (core functionality):
- Spell casting mechanics and effects
- Thief special abilities and class-based restrictions
- Magic item identification and curse handling
- Cross-module XP / treasure award tooling (outside the dungeon delver)

**Medium Priority** (gameplay features):
- Equipment & encumbrance verification (weights, loads, and movement bands)
- Morale and loyalty rules for retainers, hirelings, and armies
- Weather effects on wilderness travel and encounters
- Urban encounter procedures and NPC management

**Low Priority** (advanced features):
- Optional rules (weapon mastery, general skills, two-weapon fighting, detailed unarmed combat)
- Naval/aerial/underwater combat, planar rules, and Immortal paths

## Character Classes

### Class Definitions
**Status: Partial Compliance**

#### Issues Found:
1. **Missing Classes**: Half-Elf class is mentioned in the table of contents but not implemented. The code has "halfling" but the rules use "halfing" (appears to be a typo in the rules for "halfling").
2. **Optional Classes**: Druid and Mystic classes are implemented as optional classes; their requirements and progression should be re-verified against the RC.
3. **Class Requirements**: Current requirements in `classes.ts` appear correct but need verification against full class descriptions.
4. **Prime Requisites**: The prime requisite handling (including dual primes like Elf STR/INT and Mystic STR/DEX/WIS) needs verification.

#### Current Implementation:
```typescript
// From src/rules/tables/classes.ts
export const CLASS_DEFINITIONS: Record<string, ClassDefinition> = {
  cleric: { key: "cleric", name: "Cleric", hd: 6, req: { wis: 9 }, prime: "wis", type: "human" },
  fighter: { key: "fighter", name: "Fighter", hd: 8, req: { str: 9 }, prime: "str", type: "human" },
  magicuser: { key: "magicuser", name: "Magic-User", hd: 4, req: { int: 9 }, prime: "int", type: "human" },
  thief: { key: "thief", name: "Thief", hd: 4, req: { dex: 9 }, prime: "dex", type: "human" },
  dwarf: { key: "dwarf", name: "Dwarf", hd: 8, req: { con: 9 }, prime: "str", type: "demihuman" },
  elf: { key: "elf", name: "Elf", hd: 6, req: { int: 9, str: 9 }, prime: "str_int", type: "demihuman" },
  halfling: { key: "halfling", name: "Halfling", hd: 6, req: { dex: 9, con: 9 }, prime: "str_dex", type: "demihuman" },
};
```

#### Required Changes:
1. Implement Half-Elf class (if it's a valid class) or clearly document that it is not supported
2. Verify Druid and Mystic implementations (requirements, hit dice, progression) against the RC
3. Verify and correct prime requisite handling for multi-stat classes
4. Re-confirm prime requisite XP bonus thresholds (5% for 13–15, 10% for 16–18) for all classes

### Experience Tables
**Status: Implemented – Needs Verification & Tooling**

#### Issues Found:
1. **Table Verification**: Experience point tables for all classes (human, demihuman, and optional) are implemented but should be cross-checked against the RC values.
2. **Demihuman High-Level Progression**: Demihuman XP tables extend beyond classic level caps; this should be reviewed against the RC’s attack-rank guidance to confirm intended behavior.
3. **Non-Dungeon XP Awards**: Dungeon monster XP and prime requisite bonuses are applied automatically, but there is no dedicated UI/flow for XP from role-playing, objectives, or treasure outside the dungeon delver.

#### Current Implementation:
- `Character` includes an `xp: number` field.
- XP tables for all classes are defined in `experience.ts`.
- XP awards for dungeon monsters are computed from HD and special abilities and divided among surviving party members.
- Prime requisite XP bonuses (5%/10%) are applied when XP is added.

#### Required Changes:
1. Audit all XP table values against the RC.
2. Decide and document how demihuman progression beyond classic caps should behave (levels vs attack ranks).
3. Add tooling/flows to grant XP from treasure, goals, and role-play outside the dungeon module.

### Hit Dice
**Status: Basic Implementation**

#### Issues Found:
1. **Constitution Bonuses**: Hit die rolls include CON bonuses but post-9th level rules may not be correctly implemented
2. **Post-9th Level**: Rules specify +1 hp/level after 9th for clerics, +2 hp/level after 9th for fighters, but CON bonuses stop applying

#### Required Changes:
1. Verify post-9th level HP calculation is correct
2. Ensure CON bonuses only apply to rolled HP, not fixed post-9th bonuses

### Saving Throws
**Status: Implemented – Needs Verification**

#### Issues Found:
1. **Table Verification Needed**: Human and demihuman class tables should be verified against official values.
2. **High-Level Demihuman Benefits**: Special demihuman saving-throw benefits at high XP totals (e.g., reduced damage from spells or breath) are not modeled.

#### Current Implementation:
- Saving throw tables exist for Fighter, Cleric, Magic-User, Thief, Dwarf, Elf, and Halfling.
- `generateCharacter` computes saving throws per class and level using these tables.

#### Official Rules Discrepancies:
**Dwarf Saving Throws** (levels 1-3/4-6/7-9/10-12):
- Death/Poison: 8/6/4/2
- Wands: 9/7/5/3
- Paralysis/Stone: 10/8/6/4
- Breath: 13/10/7/4
- Spells: 12/9/6/3
- Special: At 1,400,000 XP, half damage from spells, quarter if save successful

**Elf Saving Throws** (levels 1-3/4-6/7-9/10):
- Death/Poison: 12/8/4/2
- Wands: 13/10/7/4
- Paralysis/Stone: 13/10/7/4
- Breath: 15/11/7/3
- Spells: 15/11/7/3
- Special: At 1,600,000 XP, half damage from breath, quarter if save successful

**Halfling Saving Throws**: Need to locate in rules

#### Required Changes:
1. Verify all saving throw tracks against the RC tables for each class.
2. Add special saving throw bonuses for high-level demihumans (optional).
3. Document how saving throws are intended to be used across modules (Dungeon, Lab, etc.).

### THAC0 (To Hit Armor Class 0)
**Status: Implemented – Needs Verification**

#### Issues Found:
1. **Attack Ranks System**: Demihumans in the code use fighter THAC0 progression directly; this approximates RC attack ranks but should be reviewed for XP thresholds and caps.
2. **Table Verification**: Existing THAC0 values need verification against official tables.

#### Current Implementation:
- THAC0 progression tables exist for Fighter, Cleric, Magic-User, and Thief.
- Demihuman THAC0 is derived using the fighter table via the generator’s `computeThac0` function.

#### Official Rules - Demihuman Attack Ranks:
**Dwarf Attack Ranks**: After 12th level, dwarves gain attack ranks every 100,000 XP
- Attack ranks use fighter THAC0 equivalent (e.g., attack rank 1 = fighter level 1, etc.)

**Elf Attack Ranks**: After 10th level, elves gain attack ranks every 200,000 XP
- Limited to 5th level spells but can continue improving combat ability

**Halfling Attack Ranks**: After 8th level, halflings gain attack ranks every 150,000 XP

#### Required Changes:
1. Verify THAC0 progressions against the RC for all classes.
2. Decide whether to expose demihuman “attack ranks” explicitly or continue mapping them to fighter-equivalent levels.
3. If explicit attack ranks are desired, add attack-rank tracking and XP thresholds.

## Ability Scores

### Ability Modifiers
**Status: Implemented – Needs Verification**

#### Issues Found:
1. **Effect Coverage**: Ability modifiers are implemented, but their use across all derived stats (attack rolls, damage, reaction, etc.) should be rechecked for completeness.

#### Current Implementation:
- Ability modifier ranges (1–18) and modifiers (−3 to +3) are implemented in `abilityMods.ts`.
- These modifiers are used in character generation for hit points, AC, thief skills, retainer limits/morale, and other derived fields.

#### Required Changes:
1. Verify all ability score effects (hit probability, damage, reaction rolls, etc.) against the RC.
2. Ensure ability modifiers are applied consistently in all subsystems that reference abilities.

## Spells

### Spell Lists
**Status: Partially Implemented - Basic Lists Exist**

#### Current Implementation:
-- Magic-User spell lists implemented (9 levels, appears complete)
-- Cleric spell lists implemented (7 levels)
-- Druid spell lists implemented for optional Druid class
-- Spell slot tables implemented for cleric and magic-user classes
-- Spellbook and slot structures exist on the character schema

#### Issues Found:
1. **Spell Descriptions**: No spell descriptions, effects, ranges, durations implemented
2. **Casting Mechanics**: No actual spell casting system (range, duration, effects)
3. **Mystic Abilities**: Mystic special abilities are not modeled as a distinct subsystem.
4. **Spell Verification**: Need to verify spell lists against official rules
5. **Demihuman Limits**: Elven spell level limits (max 5th level) not enforced

#### Official Rules Requirements:
- Magic-Users: 9 spell levels, specific spells per level
- Clerics: 7 spell levels (no 8th/9th level spells)
- Druids: Separate spell list (optional class)
- Mystics: Separate spell list (optional class)
- Elves: Limited to 5th level magic-user spells

#### Required Changes:
1. Add complete spell descriptions (effects, ranges, durations, components) for a prioritized subset of common spells, expanding over time.
2. Implement spell casting mechanics and resolution (including saving throws and resistances).
3. Model Mystic class abilities (if desired) as a distinct subsystem.
4. Verify all spell names and placements against official rules.
5. Implement elf spell level restrictions (5th level max).

### Spell Progression
**Status: Partial Implementation**

#### Issues Found:
1. **Slot Tracking**: Basic slot arrays exist but need verification against official tables
2. **Demihuman Limits**: Elves limited to 5th level spells, not implemented

#### Required Changes:
1. Verify spell slot tables against official rules
2. Implement spell level limits for demihumans
3. Add spell progression for optional classes (druid, mystic)

## Thief Skills

### Thief Skills and Special Abilities
**Status: Partially Implemented - Basic Tables Exist**

#### Current Implementation:
- Thief skill tables implemented (14 levels, 9 skills: OL, FT, RT, CW, MS, HS, PP, HN, RL)
- Skill progression appears to follow official patterns

#### Issues Found:
1. **Skill Verification**: Need to verify skill percentages against official tables
2. **Backstab**: Thief backstab ability not implemented
3. **Special Abilities**: Thief special abilities (read languages from scrolls, cast MU spells from scrolls at 10th level) not implemented
4. **Thief Tools**: Requirements for thieves' tools not enforced

#### Official Rules Requirements:
**Thief Skills** (need verification):
- Open Locks (OL)
- Find/Remove Traps (FT/RT)
- Climb Walls (CW)
- Move Silently (MS)
- Hide in Shadows (HS)
- Pick Pockets (PP)
- Hear Noise (HN)
- Read Languages (RL) - starts at 4th level

**Special Abilities**:
- Backstab (x2 damage at 1st-4th, x3 at 5th-8th, x4 at 9th-12th, x5 at 13th+)
- Read languages from scrolls/books at 4th level
- Cast magic-user spells from scrolls at 10th level (10% chance of backfire)
- Thieves' tools required for most skills

#### Required Changes:
1. Verify thief skill percentages against official tables
2. Implement backstab mechanics with level-based multipliers
3. Add special thief abilities (scroll reading, spell casting)
4. Implement thieves' tools requirements
5. Add skill failure mechanics and consequences

## Equipment

### Weapons & Armor
**Status: Needs Verification**

#### Issues Found:
1. **Missing Equipment Tables**: Equipment definitions exist but need verification against official costs and stats
2. **Weapon Mastery**: Not implemented (optional rule for fighters)
3. **Class Restrictions**: Weapon restrictions by class not fully implemented

#### Required Changes:
1. Verify all equipment costs, weights, damage values
2. Implement weapon mastery system (optional)
3. Add class-based weapon restrictions (clerics can't use edged weapons)

### Adventuring Gear
**Status: Needs Verification**

#### Issues Found:
1. **Incomplete Gear List**: Basic equipment exists but comprehensive adventuring gear may be missing

#### Required Changes:
1. Verify complete equipment list against rules
2. Add missing adventuring gear items

## Combat

### Attack Rolls
**Status: Basic Implementation**

#### Issues Found:
1. **THAC0 System**: Basic implementation exists but demihuman attack ranks missing
2. **Two-Weapon Fighting**: Optional rule not implemented
3. **Unarmed Combat**: Rules exist but may not be implemented

#### Required Changes:
1. Complete THAC0 implementation for all classes
2. Add optional two-weapon fighting rules
3. Implement unarmed combat mechanics

### Initiative
**Status: Implemented in Dungeon Delver – Not Global**

#### Issues Found:
1. **Scope**: Side-based 1d6 initiative is implemented for dungeon encounters, but other modules (wilderness, siege, naval, etc.) do not currently use this system.
2. **Modifiers**: Optional DEX and situational modifiers to initiative are not modeled.

#### Required Changes:
1. Decide whether to centralize initiative rules and expose them to other combat modes.
2. Add optional DEX/situational modifiers if closer RC fidelity is desired.

### Morale
**Status: Implemented for Dungeon Monsters – Retainer & Campaign Morale Pending**

#### Issues Found:
1. **Monster Morale**: Dungeon monsters use a BECMI-style morale check (2d6 vs morale score) keyed to standard triggers (first hit, first death, 1/4 HP, 1/2 incapacitated), but values and modifiers should be rechecked.
2. **Retainer Morale**: Characters and retainers track morale values, but a full RC-compliant loyalty/morale subsystem (including modifiers over time) is not implemented.

#### Required Changes:
1. Verify monster morale triggers and adjustments against the RC.
2. Implement a clearer retainer/hireling morale & loyalty system, integrated with Calendar, Ledger (wages), and Dominion where appropriate.

## Dungeon Exploration

### Wandering Monsters
**Status: Implemented – Needs Verification**

#### Issues Found:
1. **Encounter Frequencies**: Wandering monster checks are made on a schedule in the dungeon delver; exact frequencies and chances should be audited against the RC.
2. **Turn Structure**: Turn tracking and calendar integration exist, but finer-grained exploration procedures (mapping, listening at doors, etc.) are still simplified.

#### Required Changes:
1. Verify wandering monster tables and check frequencies against the RC.
2. Expand or document dungeon exploration procedures where needed.

### Treasure Generation
**Status: Partial Implementation**

#### Issues Found:
1. **Treasure Types**: Basic treasure generation exists but needs verification against official tables
2. **Magic Item Generation**: May be incomplete or missing

#### Required Changes:
1. Verify treasure tables (A-L types)
2. Complete magic item generation
3. Add gem and jewelry value tables

## Wilderness Exploration

### Travel Rules
**Status: Implemented – Optional Spot-Checks Only**

#### Issues Found:
1. **Movement Rates**: Hex-based movement with terrain costs and **encumbrance-driven daily movement points** is implemented; values now mirror RC "Traveling Rates by Terrain" for foot travel (assuming 6-mile hexes), but should still be numerically spot-checked.
2. **Encounters**: Wilderness encounter tables, forage rules, and water refilling are implemented; they still need a full audit against the RC.

#### Required Changes:
1. Optionally spot-check terrain movement costs and the encumbrance-based daily movement allowances vs RC (including “Traveling Rates by Terrain”).

### Weather
**Status: Implemented – Optional Enhancements Only**

#### Issues Found:
1. **Weather Generation**: Daily weather (temperature, wind, precipitation) is generated per climate and displayed in the Wilderness UI; wind probabilities now follow the RC Optional Water Movement 2d6 table, but distributions could be tuned further if desired.
2. **Mechanical Effects**: Weather now directly modifies overland movement costs (rain/snow and high winds/gales slow travel); encounter chances are not yet weather-dependent.

#### Required Changes:
1. Optionally extend weather mechanics to affect encounter chances and visibility (currently only travel speed is affected).

## Stronghold & Dominion Rules

### Stronghold Construction
**Status: Basic Implementation**

#### Issues Found:
1. **Cost Calculations**: Basic stronghold building exists but needs verification
2. **Special Benefits**: Castle benefits and income generation may be incomplete

#### Required Changes:
1. Verify stronghold construction costs
2. Implement castle income and benefits
3. Add stronghold management rules

### Dominion Management
**Status: Partial Implementation**

#### Issues Found:
1. **Taxation**: Basic tax system exists but may not match official rules
2. **Population Growth**: Population mechanics need verification

#### Required Changes:
1. Verify taxation and income rules
2. Complete population growth mechanics
3. Add dominion event system

## Merchant & Trade Rules

### Trade Mechanics
**Status: Implementation Exists**

#### Status: Needs Verification
1. **Profit Calculations**: Merchant system exists but needs verification against official trade rules

#### Required Changes:
1. Verify trade good prices and profit margins
2. Check caravan costs and risks

## Siege Rules

### Siege Mechanics
**Status: Implementation Exists**

#### Status: Needs Verification
1. **Combat Calculations**: Siege system exists but needs verification against official rules

#### Required Changes:
1. Verify siege engine effects and costs
2. Check troop quality modifiers

## Calendar & Time

### Time Tracking
**Status: Basic Implementation**

#### Issues Found:
1. **Calendar System**: Basic calendar exists but holiday and festival system may be incomplete

#### Required Changes:
1. Implement complete holiday and festival calendar
2. Add seasonal effects on activities

## Advanced RC Systems Not Yet Modeled

The following systems are present in the Rules Cyclopedia but are not currently modeled (or are only lightly represented) in the simulator. They are good candidates for future expansion and are largely optional in actual play:

- **Weapon Mastery**  
  - Mastery ranks per weapon (Basic → Grand Master), with attack/damage/AC/special effect changes.  
  - Would integrate most naturally with the Party and Dungeon modules and optional combat detail level.

- **General Skills**  
  - Non-combat skills tied to abilities (Riding, Navigation, Survival, etc.).  
  - A generic skill check engine could be used by Dungeon, Wilderness, Merchant, and Dominion for more rules-driven outcomes.

- **Expanded Combat Modes**  
  - **Two-weapon fighting** and more detailed **unarmed combat**.  
  - **Naval, aerial, and underwater combat** beyond the existing wilderness/ocean travel abstraction.

- **Urban Encounters & NPC Management**  
  - City encounter tables, social complications, and more detailed rules for hirelings, mercenaries, and specialists.  
  - Would tie into Merchant, Dominion, Stronghold, and Ledger systems.

- **Planes & Immortality**  
  - Planar traits that affect magic and movement.  
  - Paths to Immortality and post-Immortal play, likely integrated with Calendar and Dominion as high-level campaign options.

## Critical Issues Requiring Immediate Attention

1. **Spell Casting Mechanics**: Spell lists and slots exist, but a rules-aware spell effect and resolution engine is still missing.
2. **Thief Special Abilities**: Backstab, scroll reading/casting abilities, and tool requirements remain unimplemented.
3. **Class Restrictions**: Weapon and armor restrictions (e.g., clerics and edged weapons) are only partially enforced.
4. **Morale & Loyalty Outside Dungeons**: Monster morale is implemented for dungeon encounters; retainer/hireling morale and broader campaign morale/loyalty systems are still open.

## Rules Questions Requiring Decisions

1. **Half-Elf Class**: The rules mention Half-Elf in the table of contents but provide minimal detail. Is this a complete class that should be implemented?
2. **Optional Rules**: Which optional rules should be included (Druid/Mystic classes, weapon mastery, two-weapon fighting, morale, etc.)?
3. **Magic Item Identification**: How should magic item identification work (current implementation unclear)?
4. **Hireling Loyalty**: How should retainer/hireling loyalty be handled beyond basic morale?

## Implementation Priority

### High Priority (Core BECMI Functionality)
1. **Spell Casting**: Implement spell effects, casting mechanics, and spell descriptions.
2. **Thief Abilities & Class Restrictions**: Implement backstab, scroll use, and enforce class-based weapon/armor rules.
3. **XP & Treasure Tooling**: Provide robust XP award tools (monsters, treasure, goals) that feed into the existing XP/leveling system.

### Medium Priority (Gameplay Features)
1. **Morale & Loyalty**: Implement full retainer/hireling loyalty rules and refine monster morale where needed.
2. **Equipment & Encumbrance**: Verify equipment tables and wire encumbrance more tightly into movement and survival.
3. **Weather & Wilderness**: Add mechanical weather effects and verify wilderness encounters/travel vs RC.
4. **Urban & NPC Systems**: Add city encounter procedures and richer hireling/mercenary/specialist management.

### Low Priority (Advanced/Optional Features)
1. **Optional Rules**: Weapon mastery, general skills, two-weapon fighting, detailed unarmed combat.
2. **Advanced Magic**: Complete magic item creation, identification, artifacts, and demihuman clan relics.
3. **Planes & Immortality**: Planar rules and Immortal paths for very high-level play.
4. **Calendar Details**: Holiday events, seasonal effects, and campaign-scale event tables.
