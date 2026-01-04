/**
 * RETAINER & HIRELING SYSTEM
 * 
 * BECMI name-level play revolves around followers. This module handles:
 * - Henchmen with loyalty scores and breaking points
 * - Specialists (sages, armorers, animal trainers)
 * - Morale checks during combat/hardship
 * - Desertion, betrayal, or heroic sacrifice events
 * - Retainers can inherit leadership if party members die
 * 
 * REAL-TIME PACING:
 * - Hiring process: 1-3 days to find suitable candidates
 * - Monthly pay: loyalty check on the 1st of each month
 * - Loyalty recovery: ~1 point per week of good treatment
 * - Training a new skill: 2-4 weeks
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Party, NPC, Settlement, CharacterClass } from './types.ts';
import { randomName } from './naming.ts';
import { getPartyState } from './causality.ts';

// ============================================================================
// RETAINER TYPES
// ============================================================================

export type RetainerType = 
  | 'man-at-arms'      // Basic fighter
  | 'torchbearer'      // Low-level helper
  | 'porter'           // Carries gear
  | 'squire'           // Aspiring knight
  | 'acolyte'          // Aspiring cleric
  | 'apprentice'       // Aspiring magic-user
  | 'scout'            // Wilderness guide
  | 'sergeant'         // Commands other retainers
  | 'bodyguard'        // Personal protection
  | 'herald';          // Diplomacy and announcements

export type SpecialistType =
  | 'sage'             // Knowledge and research
  | 'armorer'          // Equipment maintenance, crafting
  | 'weaponsmith'      // Weapon crafting
  | 'animal-trainer'   // Mounts and beasts
  | 'alchemist'        // Potions and compounds
  | 'engineer'         // Siege weapons, fortifications
  | 'spy'              // Intelligence gathering
  | 'assassin'         // Targeted elimination
  | 'captain'          // Ship captain
  | 'navigator';       // Overland/sea navigation

export interface Retainer {
  id: string;
  name: string;
  type: RetainerType | SpecialistType;
  level: number;           // 0-4 for most, specialists have skill level
  class?: CharacterClass;  // For combat retainers
  hp: number;
  maxHp: number;
  
  // Loyalty system (2-12, like BECMI morale)
  loyalty: number;
  loyaltyModifier: number; // From employer's CHA, treatment, etc.
  
  // Employment
  employerId: string;      // Party or NPC ID
  hiredAt: Date;
  lastPaid: Date;
  monthlyWage: number;     // In gold pieces
  
  // State
  alive: boolean;
  wounded: boolean;
  location: string;
  
  // History
  previousEmployers: string[];
  betrayals: number;       // Times they've betrayed employers
  heroicActs: number;      // Times they've shown exceptional loyalty
  
  // Specialist-specific
  specialty?: string;      // Area of expertise for sages, etc.
  projectProgress?: number; // 0-100 for ongoing work
  projectType?: string;
}

export interface RetainerRoster {
  retainers: Retainer[];
  pendingHires: PendingHire[];
  desertions: DesertionRecord[];
}

export interface PendingHire {
  id: string;
  type: RetainerType | SpecialistType;
  settlement: string;
  searchStarted: Date;
  searchCompletes: Date;  // 1-3 days later
  candidates: Retainer[];
  requesterId: string;
}

export interface DesertionRecord {
  retainerId: string;
  retainerName: string;
  employerId: string;
  reason: string;
  timestamp: Date;
  betrayal: boolean;      // Did they betray or just leave?
  stolenGoods?: number;   // Gold value of what they took
}

// ============================================================================
// WAGE TABLES (Monthly, in gold pieces)
// ============================================================================

const MONTHLY_WAGES: Record<RetainerType | SpecialistType, number> = {
  'torchbearer': 1,
  'porter': 2,
  'man-at-arms': 4,
  'squire': 3,
  'acolyte': 2,
  'apprentice': 2,
  'scout': 10,
  'sergeant': 20,
  'bodyguard': 25,
  'herald': 15,
  'sage': 200,
  'armorer': 100,
  'weaponsmith': 100,
  'animal-trainer': 50,
  'alchemist': 300,
  'engineer': 150,
  'spy': 125,
  'assassin': 500,
  'captain': 250,
  'navigator': 150,
};

// How long to find each type (hours)
const SEARCH_TIME: Record<RetainerType | SpecialistType, { min: number; max: number }> = {
  'torchbearer': { min: 4, max: 12 },      // Few hours
  'porter': { min: 4, max: 12 },
  'man-at-arms': { min: 12, max: 48 },     // Half day to 2 days
  'squire': { min: 24, max: 72 },          // 1-3 days
  'acolyte': { min: 24, max: 72 },
  'apprentice': { min: 24, max: 72 },
  'scout': { min: 24, max: 72 },
  'sergeant': { min: 48, max: 120 },       // 2-5 days
  'bodyguard': { min: 48, max: 120 },
  'herald': { min: 24, max: 72 },
  'sage': { min: 168, max: 504 },          // 1-3 weeks
  'armorer': { min: 72, max: 168 },        // 3-7 days
  'weaponsmith': { min: 72, max: 168 },
  'animal-trainer': { min: 72, max: 168 },
  'alchemist': { min: 168, max: 504 },     // 1-3 weeks
  'engineer': { min: 168, max: 336 },      // 1-2 weeks
  'spy': { min: 72, max: 168 },            // 3-7 days
  'assassin': { min: 168, max: 672 },      // 1-4 weeks (rare, dangerous to find)
  'captain': { min: 168, max: 336 },       // 1-2 weeks (need port)
  'navigator': { min: 72, max: 168 },
};

// ============================================================================
// RETAINER GENERATION
// ============================================================================

export function generateRetainer(
  rng: Random,
  type: RetainerType | SpecialistType,
  settlement: string,
  worldTime: Date,
): Retainer {
  const isSpecialist = ['sage', 'armorer', 'weaponsmith', 'animal-trainer', 'alchemist', 
                        'engineer', 'spy', 'assassin', 'captain', 'navigator'].includes(type);
  
  const level = isSpecialist ? 1 + rng.int(4) : rng.int(3); // Specialists 1-4, others 0-2
  const baseHp = isSpecialist ? 6 + rng.int(8) : 4 + rng.int(6);
  
  // Combat retainers get classes
  let charClass: CharacterClass | undefined;
  if (['man-at-arms', 'squire', 'sergeant', 'bodyguard'].includes(type)) {
    charClass = 'Fighter';
  } else if (type === 'acolyte') {
    charClass = 'Cleric';
  } else if (type === 'apprentice') {
    charClass = 'Magic-User';
  } else if (type === 'scout') {
    charClass = rng.pick(['Thief', 'Elf', 'Halfling']);
  }
  
  // Base loyalty 7, modified by personality
  const baseLoyalty = 7 + rng.int(3) - 1; // 6-9
  
  // Specialist specialties
  let specialty: string | undefined;
  if (type === 'sage') {
    specialty = rng.pick(['history', 'arcana', 'religion', 'nature', 'geography', 'languages', 'monsters', 'artifacts']);
  } else if (type === 'animal-trainer') {
    specialty = rng.pick(['horses', 'dogs', 'hawks', 'war-beasts', 'exotic']);
  } else if (type === 'engineer') {
    specialty = rng.pick(['fortifications', 'siege-weapons', 'bridges', 'mines']);
  }
  
  return {
    id: `retainer-${Date.now()}-${rng.int(10000)}`,
    name: randomName(rng),
    type,
    level,
    class: charClass,
    hp: baseHp,
    maxHp: baseHp,
    loyalty: baseLoyalty,
    loyaltyModifier: 0,
    employerId: '',
    hiredAt: worldTime,
    lastPaid: worldTime,
    monthlyWage: MONTHLY_WAGES[type],
    alive: true,
    wounded: false,
    location: settlement,
    previousEmployers: [],
    betrayals: rng.chance(0.05) ? 1 : 0, // 5% have a shady past
    heroicActs: 0,
    specialty,
  };
}

// ============================================================================
// HIRING PROCESS
// ============================================================================

export function startHiringSearch(
  rng: Random,
  type: RetainerType | SpecialistType,
  settlement: string,
  requesterId: string,
  worldTime: Date,
  roster: RetainerRoster,
): LogEntry[] {
  const logs: LogEntry[] = [];
  const searchTime = SEARCH_TIME[type];
  const hours = searchTime.min + rng.int(searchTime.max - searchTime.min);
  
  const pendingHire: PendingHire = {
    id: `hire-${Date.now()}`,
    type,
    settlement,
    searchStarted: worldTime,
    searchCompletes: new Date(worldTime.getTime() + hours * 60 * 60 * 1000),
    candidates: [],
    requesterId,
  };
  
  roster.pendingHires.push(pendingHire);
  
  const daysApprox = Math.round(hours / 24 * 10) / 10;
  logs.push({
    category: 'town',
    summary: `Search begins for a ${type} in ${settlement}`,
    details: `Word is put out. Inquiries are made. It will take approximately ${daysApprox} days to find suitable candidates.`,
    location: settlement,
    worldTime,
    realTime: new Date(),
    seed: '',
  });
  
  return logs;
}

export function tickHiring(
  rng: Random,
  roster: RetainerRoster,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const pending of roster.pendingHires) {
    if (new Date(pending.searchCompletes) <= worldTime && pending.candidates.length === 0) {
      // Search complete - generate 1-3 candidates
      const candidateCount = 1 + rng.int(3);
      const settlement = world.settlements.find(s => s.name === pending.settlement);
      
      // Larger settlements have better candidates
      const sizeBonus = settlement?.type === 'city' ? 2 : settlement?.type === 'town' ? 1 : 0;
      
      for (let i = 0; i < candidateCount; i++) {
        const candidate = generateRetainer(rng, pending.type, pending.settlement, worldTime);
        candidate.level = Math.min(candidate.level + sizeBonus, 5);
        pending.candidates.push(candidate);
      }
      
      const requester = world.parties.find(p => p.id === pending.requesterId) ?? 
                        world.npcs.find(n => n.id === pending.requesterId);
      
      logs.push({
        category: 'town',
        summary: `${candidateCount} ${pending.type} candidates found in ${pending.settlement}`,
        details: `After days of inquiry, ${candidateCount} potential ${pending.type}s have been identified. ${requester?.name ?? 'The employer'} must choose.`,
        location: pending.settlement,
        actors: pending.candidates.map(c => c.name),
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return logs;
}

export function hireRetainer(
  retainer: Retainer,
  employerId: string,
  roster: RetainerRoster,
  worldTime: Date,
  world: WorldState,
): LogEntry[] {
  const logs: LogEntry[] = [];

  // Prevent double-hiring - check if retainer is already employed
  if (retainer.employerId) {
    logs.push({
      category: 'town',
      summary: `${retainer.name} is already employed`,
      details: `Cannot hire ${retainer.name} as they already serve another master.`,
      location: retainer.location,
      actors: [retainer.name],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    return logs;
  }

  retainer.employerId = employerId;
  retainer.hiredAt = worldTime;
  retainer.lastPaid = worldTime;
  
  // Remove from pending if applicable
  for (const pending of roster.pendingHires) {
    pending.candidates = pending.candidates.filter(c => c.id !== retainer.id);
  }
  roster.pendingHires = roster.pendingHires.filter(p => p.candidates.length > 0 || new Date(p.searchCompletes) > worldTime);
  
  // Add to roster
  roster.retainers.push(retainer);
  
  const employer = world.parties.find(p => p.id === employerId) ?? 
                   world.npcs.find(n => n.id === employerId);
  
  logs.push({
    category: 'town',
    summary: `${retainer.name} enters service of ${employer?.name ?? 'a new master'}`,
    details: `The ${retainer.type} agrees to ${retainer.monthlyWage} gold per month. Loyalty will be tested in the days ahead.`,
    location: retainer.location,
    actors: [retainer.name, employer?.name ?? 'Unknown'],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  });
  
  return logs;
}

// ============================================================================
// LOYALTY SYSTEM
// ============================================================================

export function loyaltyCheck(
  rng: Random,
  retainer: Retainer,
  situation: 'combat' | 'danger' | 'unpaid' | 'employer-wounded' | 'better-offer' | 'hardship',
  world: WorldState,
  worldTime: Date,
): { passed: boolean; logs: LogEntry[] } {
  const logs: LogEntry[] = [];
  
  // Situation modifiers
  const SITUATION_MODS: Record<typeof situation, number> = {
    'combat': -2,
    'danger': -1,
    'unpaid': -3,
    'employer-wounded': -2,
    'better-offer': -2,
    'hardship': -1,
  };
  
  const modifier = SITUATION_MODS[situation] + retainer.loyaltyModifier;
  const roll = 2 + rng.int(11); // 2d6 equivalent: 2-12
  const target = retainer.loyalty + modifier;
  const passed = roll <= target;
  
  if (!passed) {
    // Determine what happens
    const severity = target - roll; // How badly they failed
    
    if (severity <= -4 || situation === 'better-offer') {
      // Betrayal
      retainer.betrayals++;
      const stolenGold = rng.int(50) + 10;
      
      logs.push({
        category: 'town',
        summary: `${retainer.name} betrays their employer!`,
        details: `The ${retainer.type}'s loyalty breaks. They flee with ${stolenGold} gold, their oath forgotten.`,
        location: retainer.location,
        actors: [retainer.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      
      // Record desertion
      const record: DesertionRecord = {
        retainerId: retainer.id,
        retainerName: retainer.name,
        employerId: retainer.employerId,
        reason: situation,
        timestamp: worldTime,
        betrayal: true,
        stolenGoods: stolenGold,
      };
      
      retainer.alive = false; // Remove from active service
      
    } else if (severity <= -2) {
      // Desertion (no theft)
      logs.push({
        category: 'road',
        summary: `${retainer.name} deserts`,
        details: `Unable to face the ${situation}, the ${retainer.type} slips away in the night.`,
        location: retainer.location,
        actors: [retainer.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      
      retainer.alive = false;
      
    } else {
      // Wavering - loyalty drops but they stay
      retainer.loyalty = Math.max(2, retainer.loyalty - 1);
      
      logs.push({
        category: 'road',
        summary: `${retainer.name}'s loyalty wavers`,
        details: `The ${retainer.type} grumbles and hesitates. Their commitment is shaken.`,
        location: retainer.location,
        actors: [retainer.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return { passed, logs };
}

// ============================================================================
// MONTHLY PAY & MAINTENANCE
// ============================================================================

export function tickRetainerPayday(
  rng: Random,
  roster: RetainerRoster,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Check if it's the 1st of the month
  if (worldTime.getUTCDate() !== 1) return logs;
  
  for (const retainer of roster.retainers) {
    if (!retainer.alive || !retainer.employerId) continue;
    
    const employer = world.parties.find(p => p.id === retainer.employerId);
    const employerNpc = world.npcs.find(n => n.id === retainer.employerId);
    
    // Check if employer can pay
    const partyState = employer ? getPartyState(world, employer.id) : null;
    const canPay = partyState ? (partyState.resources ?? 0) >= retainer.monthlyWage : true;
    
    if (canPay) {
      retainer.lastPaid = worldTime;
      if (partyState) {
        partyState.resources = (partyState.resources ?? 0) - retainer.monthlyWage;
      }
      
      // Occasional loyalty boost for consistent pay
      if (rng.chance(0.1)) {
        retainer.loyalty = Math.min(12, retainer.loyalty + 1);
      }
    } else {
      // Missed payment - loyalty check
      const check = loyaltyCheck(rng, retainer, 'unpaid', world, worldTime);
      logs.push(...check.logs);
      
      if (check.passed) {
        logs.push({
          category: 'town',
          summary: `${retainer.name} accepts late payment`,
          details: `Though wages are delayed, the ${retainer.type} remains loyal—for now.`,
          location: retainer.location,
          actors: [retainer.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }
  
  return logs;
}

// ============================================================================
// HEROIC ACTIONS & SACRIFICE
// ============================================================================

export function retainerHeroicAct(
  rng: Random,
  retainer: Retainer,
  actType: 'save-employer' | 'hold-line' | 'sacrifice',
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  retainer.heroicActs++;
  retainer.loyalty = Math.min(12, retainer.loyalty + 2);
  
  const HEROIC_DESCRIPTIONS: Record<typeof actType, string[]> = {
    'save-employer': [
      `${retainer.name} throws themselves between their master and danger!`,
      `${retainer.name} drags their wounded employer to safety.`,
      `${retainer.name}'s quick thinking saves the day.`,
    ],
    'hold-line': [
      `${retainer.name} holds the line while others retreat.`,
      `${retainer.name} refuses to give ground.`,
      `${retainer.name} buys precious time with blood and steel.`,
    ],
    'sacrifice': [
      `${retainer.name} gives their life so others may live.`,
      `${retainer.name} falls, but their sacrifice is not in vain.`,
      `${retainer.name}'s last act is one of selfless courage.`,
    ],
  };
  
  const desc = rng.pick(HEROIC_DESCRIPTIONS[actType]);
  
  if (actType === 'sacrifice') {
    retainer.alive = false;
    retainer.hp = 0;
  } else if (rng.chance(0.3)) {
    retainer.wounded = true;
    retainer.hp = Math.max(1, retainer.hp - rng.int(retainer.maxHp / 2));
  }
  
  logs.push({
    category: 'road',
    summary: desc,
    details: actType === 'sacrifice' 
      ? `The ${retainer.type}'s name will be remembered. Their loyalty was beyond question.`
      : `The ${retainer.type}'s heroism inspires all who witness it. Their bond to their employer deepens.`,
    location: retainer.location,
    actors: [retainer.name],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  });
  
  return logs;
}

// ============================================================================
// INHERITANCE - When all party members die
// ============================================================================

export function checkPartyInheritance(
  rng: Random,
  party: Party,
  roster: RetainerRoster,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Check if all party members are dead
  const allDead = party.members.every(m => m.hp <= 0);
  if (!allDead) return logs;
  
  // Find retainers who served this party
  const partyRetainers = roster.retainers.filter(r => 
    r.employerId === party.id && r.alive
  ).sort((a, b) => {
    // Priority: highest loyalty, then level, then heroic acts
    if (b.loyalty !== a.loyalty) return b.loyalty - a.loyalty;
    if (b.level !== a.level) return b.level - a.level;
    return b.heroicActs - a.heroicActs;
  });
  
  if (partyRetainers.length === 0) {
    logs.push({
      category: 'road',
      summary: `${party.name} falls—none remain`,
      details: `With no heir and no loyal retainer to carry on, the company passes into legend.`,
      location: party.location,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    return logs;
  }
  
  // Best retainer inherits
  const heir = partyRetainers[0];
  
  // Promote to party member
  const newMember = {
    name: heir.name,
    class: heir.class ?? 'Fighter',
    level: Math.max(1, heir.level),
    hp: heir.hp,
    maxHp: heir.maxHp,
  };
  
  // Replace dead members with survivor + any other high-loyalty retainers
  party.members = [newMember];
  
  for (const r of partyRetainers.slice(1, 3)) {
    if (r.loyalty >= 9 && r.class) {
      party.members.push({
        name: r.name,
        class: r.class,
        level: Math.max(1, r.level),
        hp: r.hp,
        maxHp: r.maxHp,
      });
      r.alive = false; // Remove from retainer roster
    }
  }
  
  heir.alive = false; // Remove from retainer roster
  
  logs.push({
    category: 'road',
    summary: `${heir.name} inherits leadership of ${party.name}`,
    details: `From the ashes of tragedy, a new leader rises. The ${heir.type} ${heir.name} gathers the survivors and vows to continue.`,
    location: party.location,
    actors: [heir.name, party.name],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  });
  
  return logs;
}

// ============================================================================
// SPECIALIST PROJECTS
// ============================================================================

export function tickSpecialistProjects(
  rng: Random,
  roster: RetainerRoster,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const retainer of roster.retainers) {
    if (!retainer.alive || !retainer.projectType) continue;
    
    // Progress per hour depends on type
    // Real-time: Most projects take 1-4 weeks
    const progressPerHour: Record<string, number> = {
      'research': 0.3,      // ~2 weeks for 100%
      'craft-armor': 0.2,   // ~3 weeks
      'craft-weapon': 0.25, // ~2.5 weeks
      'train-animal': 0.15, // ~4 weeks
      'brew-potion': 0.5,   // ~1 week
      'build-engine': 0.1,  // ~6 weeks
      'gather-intel': 0.4,  // ~1.5 weeks
    };
    
    const progress = progressPerHour[retainer.projectType] ?? 0.2;
    retainer.projectProgress = (retainer.projectProgress ?? 0) + progress;
    
    if (retainer.projectProgress >= 100) {
      // Project complete
      retainer.projectProgress = 0;
      const projectType = retainer.projectType;
      retainer.projectType = undefined;
      
      logs.push({
        category: 'town',
        summary: `${retainer.name} completes their ${projectType}`,
        details: `After weeks of dedicated work, the ${retainer.type}'s ${projectType} project is finished.`,
        location: retainer.location,
        actors: [retainer.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return logs;
}

// ============================================================================
// MAIN TICK FUNCTION
// ============================================================================

export function tickRetainers(
  rng: Random,
  roster: RetainerRoster,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Process hiring searches
  logs.push(...tickHiring(rng, roster, world, worldTime));
  
  // Monthly payroll
  logs.push(...tickRetainerPayday(rng, roster, world, worldTime));
  
  // Specialist projects
  logs.push(...tickSpecialistProjects(rng, roster, world, worldTime));
  
  // Random events (rare)
  if (rng.chance(0.01)) {
    const activeRetainers = roster.retainers.filter(r => r.alive);
    if (activeRetainers.length > 0) {
      const retainer = rng.pick(activeRetainers);
      
      // Random loyalty event
      if (rng.chance(0.5) && retainer.loyalty <= 6) {
        // Low loyalty retainer might cause trouble
        const check = loyaltyCheck(rng, retainer, 'hardship', world, worldTime);
        logs.push(...check.logs);
      } else if (rng.chance(0.3) && retainer.loyalty >= 10) {
        // High loyalty retainer might do something heroic
        logs.push(...retainerHeroicAct(rng, retainer, 'hold-line', world, worldTime));
      }
    }
  }
  
  // Check for party inheritance
  for (const party of world.parties) {
    logs.push(...checkPartyInheritance(rng, party, roster, world, worldTime));
  }
  
  return logs;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function createRetainerRoster(): RetainerRoster {
  return {
    retainers: [],
    pendingHires: [],
    desertions: [],
  };
}

