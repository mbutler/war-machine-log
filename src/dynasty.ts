/**
 * LINEAGE & DYNASTY SYSTEM
 * 
 * Long-term play across generations:
 * - NPCs have children, age, and die of old age
 * - Inheritance of strongholds and titles
 * - Political marriages creating alliances
 * - Bastards and succession crises
 * - Family vendettas spanning decades
 * - Legacy goals that persist beyond death
 * 
 * REAL-TIME PACING:
 * - 1 real day = 1 game day (aging)
 * - Pregnancy: 9 months (270 days)
 * - Childhood: 0-13 (not active participants)
 * - Adolescence: 14-17 (can be squires/apprentices)
 * - Adulthood: 18+ (full participants)
 * - Old age: 60+ (declining stats, health events)
 * - Death by old age: 70-90 depending on class/race
 * - Courtship: 1-6 months
 * - Political negotiations: 2-8 weeks
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Settlement, NPC, Party, Faction, CharacterClass, Stronghold } from './types.ts';
import { randomName } from './naming.ts';
import { DeepNPC, Trait, Background, Motivation, RelationType, Relationship } from './character.ts';
import { ReactiveNPC, getSettlementState, getFactionState } from './causality.ts';
import { queueConsequence } from './consequences.ts';

// ============================================================================
// DYNASTY TYPES
// ============================================================================

export interface Bloodline {
  id: string;
  name: string;                // Family name
  motto?: string;              // House words
  founderId: string;           // Original ancestor
  currentHeadId?: string;      // Current head of family
  seat?: string;               // Primary stronghold/settlement
  reputation: number;          // -10 to 10 (how respected)
  wealth: number;              // Accumulated family wealth
  members: string[];           // NPC IDs
  deceasedMembers: string[];   // Dead member IDs (for history)
  alliances: string[];         // Other bloodline IDs
  enemies: string[];           // Rival bloodline IDs
  traits: Trait[];             // Hereditary traits
}

export interface DynasticNPC extends DeepNPC {
  // Lineage
  bloodlineId?: string;
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  childrenIds: string[];
  
  // Age
  birthDate: Date;
  deathDate?: Date;
  causeOfDeath?: string;
  
  // Succession
  heir?: string;               // Designated heir NPC ID
  titles: string[];            // Held titles
  claims: string[];            // Contested claims to titles
  
  // Marriage
  marriedAt?: Date;
  widowed: boolean;
  divorces: number;
  
  // Legitimacy
  legitimate: boolean;         // Born in wedlock?
  acknowledged: boolean;       // Recognized by parent?
  
  // Health
  healthCondition: 'healthy' | 'frail' | 'ill' | 'dying';
  lastHealthCheck?: Date;
}

export interface Pregnancy {
  id: string;
  motherId: string;
  fatherId: string;
  conceivedAt: Date;
  dueDate: Date;               // +270 days
  complications: boolean;
  twins: boolean;
}

export interface Marriage {
  id: string;
  spouse1Id: string;
  spouse2Id: string;
  marriedAt: Date;
  location: string;
  political: boolean;          // Was it arranged?
  allianceForged?: string;     // Bloodline ID if alliance marriage
  children: string[];          // Children from this marriage
  dissolved: boolean;
  dissolvedAt?: Date;
  dissolvedReason?: 'death' | 'divorce' | 'annulment';
}

export interface SuccessionCrisis {
  id: string;
  title: string;
  asset: string;               // What's being contested (stronghold, title, etc.)
  assetType: 'stronghold' | 'title' | 'wealth' | 'faction-leadership';
  deceasedId: string;          // Who died
  claimants: Claimant[];
  startedAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  winnerId?: string;
}

export interface Claimant {
  npcId: string;
  npcName: string;
  claimStrength: number;       // 1-10 (legitimacy, support)
  supporters: string[];        // NPC IDs backing this claim
  method: 'legal' | 'force' | 'marriage' | 'bribery';
}

export interface Courtship {
  id: string;
  suiterId: string;
  targetId: string;
  startedAt: Date;
  stage: 'interest' | 'courting' | 'betrothed' | 'rejected' | 'married';
  progress: number;            // 0-100
  obstacles: string[];
  gifts: number;               // Gold spent on gifts
}

export interface DynastyState {
  bloodlines: Bloodline[];
  marriages: Marriage[];
  pregnancies: Pregnancy[];
  successionCrises: SuccessionCrisis[];
  courtships: Courtship[];
  burials: BurialRecord[];
}

export interface BurialRecord {
  npcId: string;
  npcName: string;
  bloodlineId?: string;
  deathDate: Date;
  causeOfDeath: string;
  burialLocation: string;
  epitaph?: string;
  childrenLeft: number;
  wealthInherited: number;
}

// ============================================================================
// FAMILY NAMES & MOTTOS
// ============================================================================

const FAMILY_NAMES = [
  'Blackwood', 'Ironheart', 'Stormborn', 'Goldmane', 'Ravencrest',
  'Whitehall', 'Thornwood', 'Dragonbane', 'Oakheart', 'Silverton',
  'Darkwater', 'Brightblade', 'Wolfsbane', 'Firestone', 'Shadowmere',
  'Stonefist', 'Greycloak', 'Redmoor', 'Winterfell', 'Sunspear',
  'Highborn', 'Coldbrook', 'Swiftwind', 'Nightshade', 'Crowley',
];

const FAMILY_MOTTOS = [
  'Honor Above All', 'We Do Not Forget', 'Strength Through Unity',
  'From Darkness, Light', 'The Storm Comes', 'Unbowed, Unbroken',
  'Steel and Faith', 'Blood and Gold', 'First in Battle',
  'Our Word is Law', 'We Rise Again', 'The Night Remembers',
  'Fortune Favors the Bold', 'Loyalty Unto Death', 'Fire and Fury',
];

// ============================================================================
// LIFESPAN BY RACE/CLASS
// ============================================================================

interface LifespanConfig {
  adolescence: number;
  adulthood: number;
  elderlyStart: number;
  maxAge: number;
  healthDeclineRate: number;   // % per year after elderly
}

const LIFESPAN_BY_CLASS: Record<CharacterClass, LifespanConfig> = {
  'Fighter': { adolescence: 14, adulthood: 18, elderlyStart: 55, maxAge: 75, healthDeclineRate: 0.05 },
  'Cleric': { adolescence: 14, adulthood: 18, elderlyStart: 60, maxAge: 80, healthDeclineRate: 0.04 },
  'Magic-User': { adolescence: 14, adulthood: 18, elderlyStart: 65, maxAge: 90, healthDeclineRate: 0.03 },
  'Thief': { adolescence: 14, adulthood: 18, elderlyStart: 50, maxAge: 70, healthDeclineRate: 0.06 },
  'Dwarf': { adolescence: 30, adulthood: 40, elderlyStart: 200, maxAge: 350, healthDeclineRate: 0.01 },
  'Elf': { adolescence: 50, adulthood: 100, elderlyStart: 500, maxAge: 1000, healthDeclineRate: 0.005 },
  'Halfling': { adolescence: 20, adulthood: 30, elderlyStart: 80, maxAge: 120, healthDeclineRate: 0.03 },
  'Druid': { adolescence: 14, adulthood: 18, elderlyStart: 70, maxAge: 100, healthDeclineRate: 0.03 },
  'Mystic': { adolescence: 14, adulthood: 18, elderlyStart: 80, maxAge: 120, healthDeclineRate: 0.02 },
};

// ============================================================================
// BLOODLINE GENERATION
// ============================================================================

export function generateBloodline(
  rng: Random,
  founderId: string,
  founderName: string,
  seat?: string,
): Bloodline {
  const familyName = rng.pick(FAMILY_NAMES);
  
  return {
    id: `bloodline-${Date.now()}-${rng.int(10000)}`,
    name: familyName,
    motto: rng.chance(0.7) ? rng.pick(FAMILY_MOTTOS) : undefined,
    founderId,
    currentHeadId: founderId,
    seat,
    reputation: rng.int(11) - 5, // -5 to 5
    wealth: 100 + rng.int(400),
    members: [founderId],
    deceasedMembers: [],
    alliances: [],
    enemies: [],
    traits: [rng.pick(['ambitious', 'honorable', 'cunning', 'brave', 'cruel', 'charitable'] as Trait[])],
  };
}

// ============================================================================
// AGING & HEALTH
// ============================================================================

export function calculateAge(birthDate: Date, currentDate: Date): number {
  const diff = currentDate.getTime() - new Date(birthDate).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

export function tickAging(
  rng: Random,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const npc of world.npcs as DynasticNPC[]) {
    if (npc.alive === false || !npc.birthDate) continue;
    
    const age = calculateAge(npc.birthDate, worldTime);
    const charClass = npc.class ?? 'Fighter';
    const lifespan = LIFESPAN_BY_CLASS[charClass];
    
    // Daily health check for elderly
    if (age >= lifespan.elderlyStart) {
      const lastCheck = npc.lastHealthCheck ? new Date(npc.lastHealthCheck) : new Date(0);
      const daysSinceCheck = (worldTime.getTime() - lastCheck.getTime()) / (24 * 60 * 60 * 1000);
      
      if (daysSinceCheck >= 1) {
        npc.lastHealthCheck = worldTime;
        
        // Health decline chance
        const yearsOld = age - lifespan.elderlyStart;
        const declineChance = yearsOld * lifespan.healthDeclineRate;
        
        if (rng.chance(declineChance)) {
          // Health worsens
          if (npc.healthCondition === 'healthy') {
            npc.healthCondition = 'frail';
            if (npc.fame && npc.fame >= 3) {
              logs.push({
                category: 'town',
                summary: `${npc.name} grows frail with age`,
                details: `The years weigh heavy on the ${npc.role}. Their step slows, their grip weakens.`,
                location: npc.location,
                actors: [npc.name],
                worldTime,
                realTime: new Date(),
                seed: world.seed,
              });
            }
          } else if (npc.healthCondition === 'frail') {
            npc.healthCondition = 'ill';
            logs.push({
              category: 'town',
              summary: `${npc.name} falls ill`,
              details: `The ${npc.role} takes to their bed. Healers are summoned.`,
              location: npc.location,
              actors: [npc.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          } else if (npc.healthCondition === 'ill') {
            npc.healthCondition = 'dying';
            logs.push({
              category: 'town',
              summary: `${npc.name} is dying`,
              details: `The end approaches for the ${npc.role}. Family and rivals alike watch and wait.`,
              location: npc.location,
              actors: [npc.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          } else if (npc.healthCondition === 'dying') {
            // Death
            logs.push(...processNaturalDeath(rng, npc, 'old age', dynasty, world, worldTime));
          }
        }
        
        // Death chance at extreme old age
        if (age >= lifespan.maxAge - 10) {
          const deathChance = (age - (lifespan.maxAge - 10)) * 0.02;
          if (rng.chance(deathChance)) {
            logs.push(...processNaturalDeath(rng, npc, 'old age', dynasty, world, worldTime));
          }
        }
      }
    }
  }
  
  return logs;
}

// ============================================================================
// NATURAL DEATH & INHERITANCE
// ============================================================================

export function processNaturalDeath(
  rng: Random,
  npc: DynasticNPC,
  cause: string,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  npc.alive = false;
  npc.deathDate = worldTime;
  npc.causeOfDeath = cause;
  
  const bloodline = dynasty.bloodlines.find(b => b.id === npc.bloodlineId);
  
  // Record burial
  dynasty.burials.push({
    npcId: npc.id,
    npcName: npc.name,
    bloodlineId: npc.bloodlineId,
    deathDate: worldTime,
    causeOfDeath: cause,
    burialLocation: npc.location,
    childrenLeft: npc.childrenIds?.length ?? 0,
    wealthInherited: bloodline?.wealth ?? 0,
  });
  
  // Death announcement
  logs.push({
    category: 'town',
    summary: `${npc.name} has died`,
    details: `The ${npc.role} passes away from ${cause}. ${bloodline ? `The House of ${bloodline.name} mourns.` : 'They will be remembered.'}`,
    location: npc.location,
    actors: [npc.name],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  });
  
  // Noble deaths lower settlement mood - community mourns
  const settlement = world.settlements.find(s => s.name === npc.location);
  if (settlement && bloodline) {
    settlement.mood = Math.max(-5, settlement.mood - 1);
  }
  
  // Widower/widow
  if (npc.spouseId) {
    const spouse = world.npcs.find(n => n.id === npc.spouseId) as DynasticNPC;
    if (spouse && spouse.alive !== false) {
      spouse.widowed = true;
      spouse.spouseId = undefined;
      
      // Find and update marriage
      const marriage = dynasty.marriages.find(m =>
        (m.spouse1Id === npc.id || m.spouse2Id === npc.id) && !m.dissolved
      );
      if (marriage) {
        marriage.dissolved = true;
        marriage.dissolvedAt = worldTime;
        marriage.dissolvedReason = 'death';
      }
    }
  }
  
  // Update bloodline
  if (bloodline) {
    bloodline.members = bloodline.members.filter(m => m !== npc.id);
    bloodline.deceasedMembers.push(npc.id);
    
    // Was this the head of the family?
    if (bloodline.currentHeadId === npc.id) {
      logs.push(...processSuccession(rng, npc, bloodline, dynasty, world, worldTime));
    }
  }
  
  // Stronghold inheritance
  const ownedStrongholds = world.strongholds.filter(s => s.ownerId === npc.id);
  for (const stronghold of ownedStrongholds) {
    logs.push(...processStrongholdInheritance(rng, npc, stronghold, dynasty, world, worldTime));
  }
  
  return logs;
}

// ============================================================================
// SUCCESSION
// ============================================================================

export function processSuccession(
  rng: Random,
  deceased: DynasticNPC,
  bloodline: Bloodline,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Find heir
  let heir: DynasticNPC | undefined;
  
  // 1. Designated heir
  if (deceased.heir) {
    heir = world.npcs.find(n => n.id === deceased.heir && n.alive !== false) as DynasticNPC;
  }
  
  // 2. Eldest legitimate child
  if (!heir && deceased.childrenIds?.length) {
    const children = deceased.childrenIds
      .map(id => world.npcs.find(n => n.id === id) as DynasticNPC)
      .filter(c => c && c.alive !== false && c.legitimate)
      .sort((a, b) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
    
    if (children.length > 0) {
      heir = children[0];
    }
  }
  
  // 3. Eldest child (including illegitimate)
  if (!heir && deceased.childrenIds?.length) {
    const children = deceased.childrenIds
      .map(id => world.npcs.find(n => n.id === id) as DynasticNPC)
      .filter(c => c && c.alive !== false && c.acknowledged)
      .sort((a, b) => new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime());
    
    if (children.length > 0) {
      heir = children[0];
    }
  }
  
  // 4. Spouse
  if (!heir && deceased.spouseId) {
    heir = world.npcs.find(n => n.id === deceased.spouseId && n.alive !== false) as DynasticNPC;
  }
  
  // 5. Sibling
  if (!heir && deceased.fatherId) {
    const father = world.npcs.find(n => n.id === deceased.fatherId) as DynasticNPC;
    if (father?.childrenIds) {
      const siblings = father.childrenIds
        .map(id => world.npcs.find(n => n.id === id) as DynasticNPC)
        .filter(s => s && s.alive !== false && s.id !== deceased.id);
      
      if (siblings.length > 0) {
        heir = siblings[0];
      }
    }
  }
  
  if (heir) {
    bloodline.currentHeadId = heir.id;
    
    // Transfer titles
    if (deceased.titles?.length) {
      heir.titles = [...(heir.titles ?? []), ...deceased.titles];
    }
    
    logs.push({
      category: 'faction',
      summary: `${heir.name} becomes head of House ${bloodline.name}`,
      details: `Following the death of ${deceased.name}, ${heir.name} assumes leadership of the bloodline.`,
      location: heir.location,
      actors: [heir.name, deceased.name],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  } else {
    // Succession crisis!
    const crisis: SuccessionCrisis = {
      id: `crisis-${Date.now()}`,
      title: `Head of House ${bloodline.name}`,
      asset: bloodline.id,
      assetType: 'title',
      deceasedId: deceased.id,
      claimants: [],
      startedAt: worldTime,
      resolved: false,
    };
    
    // Find potential claimants
    for (const memberId of bloodline.members) {
      const member = world.npcs.find(n => n.id === memberId) as DynasticNPC;
      if (!member || member.alive === false) continue;
      
      const age = calculateAge(member.birthDate, worldTime);
      if (age < 16) continue; // Too young
      
      let claimStrength = 3;
      if (member.legitimate) claimStrength += 2;
      if (member.fatherId === deceased.id || member.motherId === deceased.id) claimStrength += 2;
      if (member.fame && member.fame >= 3) claimStrength += 1;
      if (member.level && member.level >= 5) claimStrength += 1;
      
      crisis.claimants.push({
        npcId: member.id,
        npcName: member.name,
        claimStrength,
        supporters: [],
        method: rng.pick(['legal', 'force', 'bribery']),
      });
    }
    
    if (crisis.claimants.length > 1) {
      dynasty.successionCrises.push(crisis);
      
      logs.push({
        category: 'faction',
        summary: `Succession crisis in House ${bloodline.name}!`,
        details: `With no clear heir, ${crisis.claimants.length} claimants vie for leadership. The house may tear itself apart.`,
        location: bloodline.seat ?? deceased.location,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    } else if (crisis.claimants.length === 1) {
      bloodline.currentHeadId = crisis.claimants[0].npcId;
    } else {
      // Bloodline extinct
      logs.push({
        category: 'faction',
        summary: `House ${bloodline.name} is extinct`,
        details: `With no living heirs, the ancient bloodline ends. Their seat and wealth fall to the wind.`,
        location: bloodline.seat ?? deceased.location,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return logs;
}

export function processStrongholdInheritance(
  rng: Random,
  deceased: DynasticNPC,
  stronghold: Stronghold,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Similar logic to succession
  let heir: DynasticNPC | undefined;
  
  if (deceased.heir) {
    heir = world.npcs.find(n => n.id === deceased.heir && n.alive !== false) as DynasticNPC;
  }
  
  if (!heir && deceased.childrenIds?.length) {
    const children = deceased.childrenIds
      .map(id => world.npcs.find(n => n.id === id) as DynasticNPC)
      .filter(c => c && c.alive !== false)
      .sort((a, b) => {
        // Legitimate first, then by age
        if (a.legitimate !== b.legitimate) return a.legitimate ? -1 : 1;
        return new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime();
      });
    
    if (children.length > 0) {
      heir = children[0];
    }
  }
  
  if (heir) {
    stronghold.ownerId = heir.id;
    
    logs.push({
      category: 'faction',
      summary: `${heir.name} inherits ${stronghold.name}`,
      details: `The fortress passes to a new master. ${heir.name} claims their birthright.`,
      location: stronghold.name,
      actors: [heir.name],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  } else {
    // Contested!
    const crisis: SuccessionCrisis = {
      id: `crisis-stronghold-${Date.now()}`,
      title: `Lordship of ${stronghold.name}`,
      asset: stronghold.id,
      assetType: 'stronghold',
      deceasedId: deceased.id,
      claimants: [],
      startedAt: worldTime,
      resolved: false,
    };
    
    // Nearby factions might claim it
    for (const faction of world.factions) {
      const fState = getFactionState(world, faction.id);
      if (fState.power >= 40 && rng.chance(0.3)) {
        crisis.claimants.push({
          npcId: faction.id,
          npcName: faction.name,
          claimStrength: Math.floor(fState.power / 20),
          supporters: [],
          method: 'force',
        });
      }
    }
    
    dynasty.successionCrises.push(crisis);
    
    logs.push({
      category: 'faction',
      summary: `${stronghold.name} falls into dispute`,
      details: `With no clear heir, the fortress attracts ambitious claimants. Conflict looms.`,
      location: stronghold.name,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }
  
  return logs;
}

// ============================================================================
// MARRIAGE & COURTSHIP
// ============================================================================

export function tickCourtships(
  rng: Random,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const courtship of dynasty.courtships) {
    if (courtship.stage === 'rejected' || courtship.stage === 'married') continue;
    
    const suitor = world.npcs.find(n => n.id === courtship.suiterId) as DynasticNPC;
    const target = world.npcs.find(n => n.id === courtship.targetId) as DynasticNPC;
    
    if (!suitor || suitor.alive === false || !target || target.alive === false) {
      courtship.stage = 'rejected';
      continue;
    }
    
    // Progress courtship (real-time: 1-6 months)
    // ~0.5% progress per hour = ~100% in 200 hours ≈ 8 days for fast courtship
    // Slower for political marriages
    const progressRate = courtship.obstacles.length > 0 ? 0.2 : 0.4;
    courtship.progress += progressRate;
    
    // Stage progression
    if (courtship.progress >= 30 && courtship.stage === 'interest') {
      courtship.stage = 'courting';
      logs.push({
        category: 'town',
        summary: `${suitor.name} courts ${target.name}`,
        details: `Gifts are exchanged. Time is spent together. The town gossips.`,
        location: target.location,
        actors: [suitor.name, target.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
    
    if (courtship.progress >= 70 && courtship.stage === 'courting') {
      courtship.stage = 'betrothed';
      logs.push({
        category: 'town',
        summary: `${suitor.name} and ${target.name} are betrothed`,
        details: `A formal agreement is made. The wedding will follow in due time.`,
        location: target.location,
        actors: [suitor.name, target.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
    
    if (courtship.progress >= 100 && courtship.stage === 'betrothed') {
      courtship.stage = 'married';
      logs.push(...performMarriage(rng, suitor, target, false, dynasty, world, worldTime));
    }
    
    // Random events during courtship
    if (rng.chance(0.02)) {
      if (rng.chance(0.3)) {
        // Obstacle appears
        const obstacles = ['a rival suitor', 'family objection', 'scandal', 'distance'];
        courtship.obstacles.push(rng.pick(obstacles));
        courtship.progress -= 10;
      } else if (courtship.progress > 20) {
        // Gift boosts progress
        courtship.gifts += 10 + rng.int(40);
        courtship.progress += 5;
      }
    }
  }
  
  return logs;
}

export function performMarriage(
  rng: Random,
  spouse1: DynasticNPC,
  spouse2: DynasticNPC,
  political: boolean,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Update spouses
  spouse1.spouseId = spouse2.id;
  spouse2.spouseId = spouse1.id;
  spouse1.marriedAt = worldTime;
  spouse2.marriedAt = worldTime;
  
  // Create marriage record
  const marriage: Marriage = {
    id: `marriage-${Date.now()}`,
    spouse1Id: spouse1.id,
    spouse2Id: spouse2.id,
    marriedAt: worldTime,
    location: spouse1.location,
    political,
    children: [],
    dissolved: false,
  };
  
  // Alliance between bloodlines?
  if (spouse1.bloodlineId && spouse2.bloodlineId && spouse1.bloodlineId !== spouse2.bloodlineId) {
    const bloodline1 = dynasty.bloodlines.find(b => b.id === spouse1.bloodlineId);
    const bloodline2 = dynasty.bloodlines.find(b => b.id === spouse2.bloodlineId);
    
    if (bloodline1 && bloodline2) {
      if (!bloodline1.alliances.includes(bloodline2.id)) {
        bloodline1.alliances.push(bloodline2.id);
      }
      if (!bloodline2.alliances.includes(bloodline1.id)) {
        bloodline2.alliances.push(bloodline1.id);
      }
      
      marriage.allianceForged = bloodline2.id;
      
      logs.push({
        category: 'faction',
        summary: `Houses ${bloodline1.name} and ${bloodline2.name} unite`,
        details: `The marriage of ${spouse1.name} and ${spouse2.name} forges an alliance between the bloodlines.`,
        location: marriage.location,
        actors: [spouse1.name, spouse2.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  dynasty.marriages.push(marriage);
  
  logs.push({
    category: 'town',
    summary: `${spouse1.name} and ${spouse2.name} are wed`,
    details: political 
      ? `A political union is sealed. The celebrations are formal and precise.`
      : `Love, or something like it, blooms. The celebrations continue well into the night.`,
    location: marriage.location,
    actors: [spouse1.name, spouse2.name],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  });
  
  // Weddings boost settlement mood - festivities!
  const settlement = world.settlements.find(s => s.name === marriage.location);
  if (settlement) {
    const bloodline1 = dynasty.bloodlines.find(b => b.id === spouse1.bloodlineId);
    const bloodline2 = dynasty.bloodlines.find(b => b.id === spouse2.bloodlineId);
    const nobleness = (bloodline1 ? 1 : 0) + (bloodline2 ? 1 : 0);
    settlement.mood = Math.min(5, settlement.mood + 1 + nobleness);
  }
  
  return logs;
}

// ============================================================================
// PREGNANCY & BIRTH
// ============================================================================

export function tickPregnancies(
  rng: Random,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const pregnancy of dynasty.pregnancies) {
    const mother = world.npcs.find(n => n.id === pregnancy.motherId) as DynasticNPC;
    
    if (!mother || mother.alive === false) {
      // Mother died during pregnancy
      dynasty.pregnancies = dynasty.pregnancies.filter(p => p.id !== pregnancy.id);
      continue;
    }
    
    // Due date reached
    if (new Date(pregnancy.dueDate) <= worldTime) {
      logs.push(...processBirth(rng, pregnancy, dynasty, world, worldTime));
    }
  }
  
  // Check for new pregnancies (married couples of childbearing age)
  for (const marriage of dynasty.marriages) {
    if (marriage.dissolved) continue;
    
    const spouse1 = world.npcs.find(n => n.id === marriage.spouse1Id) as DynasticNPC;
    const spouse2 = world.npcs.find(n => n.id === marriage.spouse2Id) as DynasticNPC;
    
    if (!spouse1 || !spouse2 || spouse1.alive === false || spouse2.alive === false) continue;
    
    // Determine who could be the mother (simplified: assume one is female if names don't indicate)
    const potentialMother = spouse1;
    const potentialFather = spouse2;
    
    // Already pregnant?
    if (dynasty.pregnancies.some(p => p.motherId === potentialMother.id)) continue;
    
    // Age check (18-45 for humans, scaled for other races)
    const motherAge = calculateAge(potentialMother.birthDate, worldTime);
    const charClass = potentialMother.class ?? 'Fighter';
    const lifespan = LIFESPAN_BY_CLASS[charClass];
    const fertileEnd = lifespan.elderlyStart * 0.7;
    
    if (motherAge < lifespan.adulthood || motherAge > fertileEnd) continue;
    
    // Chance of conception (real-time: ~10% per month of trying)
    // Per hour: 10% / 720 hours ≈ 0.014%
    if (rng.chance(0.00014)) {
      const dueDate = new Date(worldTime.getTime() + 270 * 24 * 60 * 60 * 1000); // 9 months
      
      dynasty.pregnancies.push({
        id: `pregnancy-${Date.now()}`,
        motherId: potentialMother.id,
        fatherId: potentialFather.id,
        conceivedAt: worldTime,
        dueDate,
        complications: rng.chance(0.1),
        twins: rng.chance(0.03),
      });
      
      if (potentialMother.fame && potentialMother.fame >= 2) {
        logs.push({
          category: 'town',
          summary: `${potentialMother.name} is with child`,
          details: `Happy news for the household. An heir is expected.`,
          location: potentialMother.location,
          actors: [potentialMother.name, potentialFather.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }
  
  return logs;
}

export function processBirth(
  rng: Random,
  pregnancy: Pregnancy,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  const mother = world.npcs.find(n => n.id === pregnancy.motherId) as DynasticNPC;
  const father = world.npcs.find(n => n.id === pregnancy.fatherId) as DynasticNPC;
  
  if (!mother) return logs;
  
  // Complications?
  if (pregnancy.complications && rng.chance(0.2)) {
    // Stillbirth or mother dies
    if (rng.chance(0.3)) {
      logs.push(...processNaturalDeath(rng, mother, 'childbirth', dynasty, world, worldTime));
    } else {
      logs.push({
        category: 'town',
        summary: `Tragedy strikes: ${mother.name} loses the child`,
        details: `Despite the healers' efforts, the baby does not survive.`,
        location: mother.location,
        actors: [mother.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
    
    dynasty.pregnancies = dynasty.pregnancies.filter(p => p.id !== pregnancy.id);
    return logs;
  }
  
  // Successful birth
  const childCount = pregnancy.twins ? 2 : 1;
  const children: DynasticNPC[] = [];
  
  for (let i = 0; i < childCount; i++) {
    const childName = randomName(rng);
    const child: DynasticNPC = {
      id: `npc-child-${Date.now()}-${i}`,
      name: childName,
      role: 'laborer', // Will change as they grow
      home: mother.home,
      location: mother.location,
      reputation: 0,
      fame: 0,
      alive: true,
      wounded: false,
      
      // Lineage
      bloodlineId: mother.bloodlineId ?? father?.bloodlineId,
      fatherId: father?.id,
      motherId: mother.id,
      childrenIds: [],
      
      // Age
      birthDate: worldTime,
      
      // Status
      legitimate: !!mother.spouseId && mother.spouseId === father?.id,
      acknowledged: true,
      healthCondition: 'healthy',
      
      titles: [],
      claims: [],
      widowed: false,
      divorces: 0,
    };
    
    // Inherit traits from parents
    if (mother.depth?.traits) {
      child.depth = {
        ...child.depth!,
        traits: [rng.pick(mother.depth.traits)],
        background: 'noble-exile', // Placeholder
        motivation: 'duty',
        relationships: [],
        memories: [],
        quirks: [],
      };
    }
    
    // Add to world
    world.npcs.push(child as NPC);
    children.push(child);
    
    // Update parent records
    if (!mother.childrenIds) mother.childrenIds = [];
    mother.childrenIds.push(child.id);
    
    if (father) {
      if (!father.childrenIds) father.childrenIds = [];
      father.childrenIds.push(child.id);
    }
    
    // Add to bloodline
    const bloodline = dynasty.bloodlines.find(b => b.id === child.bloodlineId);
    if (bloodline) {
      bloodline.members.push(child.id);
    }
    
    // Update marriage record
    const marriage = dynasty.marriages.find(m =>
      (m.spouse1Id === mother.id || m.spouse2Id === mother.id) && !m.dissolved
    );
    if (marriage) {
      marriage.children.push(child.id);
    }
  }
  
  dynasty.pregnancies = dynasty.pregnancies.filter(p => p.id !== pregnancy.id);
  
  const bloodline = dynasty.bloodlines.find(b => b.id === mother.bloodlineId);
  
  logs.push({
    category: 'town',
    summary: pregnancy.twins 
      ? `${mother.name} gives birth to twins!`
      : `${mother.name} gives birth`,
    details: bloodline 
      ? `An heir is born to House ${bloodline.name}. ${children.map(c => c.name).join(' and ')} ${pregnancy.twins ? 'enter' : 'enters'} the world.`
      : `${children[0].name} is born. A new life begins.`,
    location: mother.location,
    actors: [mother.name, ...children.map(c => c.name)],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  });
  
  // Noble births boost settlement mood - celebration!
  const settlement = world.settlements.find(s => s.name === mother.location);
  if (settlement && bloodline) {
    settlement.mood = Math.min(5, settlement.mood + 1);
  }
  
  return logs;
}

// ============================================================================
// SUCCESSION CRISIS RESOLUTION
// ============================================================================

export function tickSuccessionCrises(
  rng: Random,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const crisis of dynasty.successionCrises) {
    if (crisis.resolved) continue;
    
    // Crises take weeks to resolve (real-time: 2-8 weeks)
    const daysSinceStart = (worldTime.getTime() - new Date(crisis.startedAt).getTime()) / (24 * 60 * 60 * 1000);
    
    if (daysSinceStart < 14) continue; // Minimum 2 weeks
    
    // Resolution chance increases over time
    const resolutionChance = 0.01 + (daysSinceStart - 14) * 0.005;
    
    if (rng.chance(resolutionChance)) {
      // Determine winner
      let winner: Claimant | undefined;
      
      // Weight by claim strength and supporters
      let totalWeight = 0;
      for (const claimant of crisis.claimants) {
        totalWeight += claimant.claimStrength + claimant.supporters.length * 2;
      }
      
      let roll = rng.int(totalWeight);
      for (const claimant of crisis.claimants) {
        roll -= claimant.claimStrength + claimant.supporters.length * 2;
        if (roll < 0) {
          winner = claimant;
          break;
        }
      }
      
      if (!winner) winner = crisis.claimants[0];
      
      crisis.resolved = true;
      crisis.resolvedAt = worldTime;
      crisis.winnerId = winner.npcId;
      
      // Apply resolution
      if (crisis.assetType === 'stronghold') {
        const stronghold = world.strongholds.find(s => s.id === crisis.asset);
        if (stronghold) {
          stronghold.ownerId = winner.npcId;
        }
      } else if (crisis.assetType === 'title') {
        const bloodline = dynasty.bloodlines.find(b => b.id === crisis.asset);
        if (bloodline) {
          bloodline.currentHeadId = winner.npcId;
        }
      }
      
      logs.push({
        category: 'faction',
        summary: `${winner.npcName} wins the ${crisis.title}`,
        details: `After weeks of intrigue and ${winner.method === 'force' ? 'bloodshed' : 'maneuvering'}, the succession crisis is resolved.`,
        location: winner.npcName,
        actors: [winner.npcName],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      
      // Losers may become enemies
      for (const loser of crisis.claimants.filter(c => c.npcId !== winner!.npcId)) {
        if (rng.chance(0.3)) {
          const loserNpc = world.npcs.find(n => n.id === loser.npcId) as DynasticNPC;
          const winnerNpc = world.npcs.find(n => n.id === winner!.npcId) as DynasticNPC;
          
          if (loserNpc && winnerNpc && loserNpc.bloodlineId && winnerNpc.bloodlineId) {
            const loserBloodline = dynasty.bloodlines.find(b => b.id === loserNpc.bloodlineId);
            const winnerBloodline = dynasty.bloodlines.find(b => b.id === winnerNpc.bloodlineId);
            
            if (loserBloodline && winnerBloodline && loserBloodline.id !== winnerBloodline.id) {
              if (!loserBloodline.enemies.includes(winnerBloodline.id)) {
                loserBloodline.enemies.push(winnerBloodline.id);
              }
            }
          }
        }
      }
    }
  }
  
  return logs;
}

// ============================================================================
// MAIN TICK FUNCTION
// ============================================================================

export function tickDynasty(
  rng: Random,
  dynasty: DynastyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Aging and natural death
  logs.push(...tickAging(rng, dynasty, world, worldTime));
  
  // Pregnancies and births
  logs.push(...tickPregnancies(rng, dynasty, world, worldTime));
  
  // Courtships
  logs.push(...tickCourtships(rng, dynasty, world, worldTime));
  
  // Succession crises
  logs.push(...tickSuccessionCrises(rng, dynasty, world, worldTime));
  
  // Random dynastic events
  if (rng.chance(0.005)) {
    // Someone might start courting
    const eligibleBachelors = (world.npcs as DynasticNPC[]).filter(n =>
      n.alive !== false &&
      !n.spouseId &&
      n.birthDate &&
      calculateAge(n.birthDate, worldTime) >= 18 &&
      calculateAge(n.birthDate, worldTime) <= 50 &&
      (n.fame ?? 0) >= 2
    );
    
    const eligiblePartners = (world.npcs as DynasticNPC[]).filter(n =>
      n.alive !== false &&
      !n.spouseId &&
      n.birthDate &&
      calculateAge(n.birthDate, worldTime) >= 18 &&
      calculateAge(n.birthDate, worldTime) <= 45
    );
    
    if (eligibleBachelors.length > 0 && eligiblePartners.length > 1) {
      const suitor = rng.pick(eligibleBachelors);
      const target = rng.pick(eligiblePartners.filter(p => p.id !== suitor.id));
      
      if (target && !dynasty.courtships.some(c => c.suiterId === suitor.id)) {
        dynasty.courtships.push({
          id: `courtship-${Date.now()}`,
          suiterId: suitor.id,
          targetId: target.id,
          startedAt: worldTime,
          stage: 'interest',
          progress: 0,
          obstacles: [],
          gifts: 0,
        });
        
        logs.push({
          category: 'town',
          summary: `${suitor.name} shows interest in ${target.name}`,
          details: `Glances are exchanged. Inquiries are made. A courtship may be beginning.`,
          location: suitor.location,
          actors: [suitor.name, target.name],
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
// INITIALIZATION
// ============================================================================

export function createDynastyState(): DynastyState {
  return {
    bloodlines: [],
    marriages: [],
    pregnancies: [],
    successionCrises: [],
    courtships: [],
    burials: [],
  };
}

export function seedDynasty(
  rng: Random,
  world: WorldState,
  worldTime: Date,
): DynastyState {
  const dynasty = createDynastyState();
  
  // Create bloodlines for notable NPCs
  const notableNpcs = world.npcs.filter(n => 
    n.alive !== false && 
    ((n.fame ?? 0) >= 3 || (n.level ?? 0) >= 5)
  ) as DynasticNPC[];
  
  for (const npc of notableNpcs) {
    if (rng.chance(0.5)) {
      // Give them a bloodline
      const seat = world.strongholds.find(s => s.ownerId === npc.id)?.name;
      const bloodline = generateBloodline(rng, npc.id, npc.name, seat);
      dynasty.bloodlines.push(bloodline);
      
      (npc as DynasticNPC).bloodlineId = bloodline.id;
      (npc as DynasticNPC).birthDate = new Date(worldTime.getTime() - (25 + rng.int(40)) * 365 * 24 * 60 * 60 * 1000);
      (npc as DynasticNPC).childrenIds = [];
      (npc as DynasticNPC).titles = [(npc.level ?? 0) >= 9 ? 'Lord' : 'Esquire'];
      (npc as DynasticNPC).claims = [];
      (npc as DynasticNPC).legitimate = true;
      (npc as DynasticNPC).acknowledged = true;
      (npc as DynasticNPC).healthCondition = 'healthy';
      (npc as DynasticNPC).widowed = false;
      (npc as DynasticNPC).divorces = 0;
    }
  }
  
  // Initialize all NPCs with birth dates if they don't have them
  for (const npc of world.npcs) {
    const dynNpc = npc as DynasticNPC;
    if (!dynNpc.birthDate) {
      dynNpc.birthDate = new Date(worldTime.getTime() - (18 + rng.int(50)) * 365 * 24 * 60 * 60 * 1000);
      dynNpc.childrenIds = [];
      dynNpc.titles = [];
      dynNpc.claims = [];
      dynNpc.legitimate = true;
      dynNpc.acknowledged = true;
      dynNpc.healthCondition = 'healthy';
      dynNpc.widowed = false;
      dynNpc.divorces = 0;
    }
  }
  
  // Create some existing marriages
  const marriedNpcs: string[] = [];
  for (const npc of world.npcs as DynasticNPC[]) {
    if (marriedNpcs.includes(npc.id)) continue;
    if (!npc.birthDate) continue;
    
    const age = calculateAge(npc.birthDate, worldTime);
    if (age < 20 || age > 60) continue;
    
    if (rng.chance(0.3)) {
      // Find a spouse
      const potentialSpouses = (world.npcs as DynasticNPC[]).filter(s =>
        s.id !== npc.id &&
        !marriedNpcs.includes(s.id) &&
        s.alive !== false &&
        s.birthDate &&
        calculateAge(s.birthDate, worldTime) >= 18 &&
        calculateAge(s.birthDate, worldTime) <= 60 &&
        s.location === npc.location
      );
      
      if (potentialSpouses.length > 0) {
        const spouse = rng.pick(potentialSpouses);
        
        npc.spouseId = spouse.id;
        spouse.spouseId = npc.id;
        
        const marriedYearsAgo = rng.int(Math.min(age - 18, 20));
        const marriedAt = new Date(worldTime.getTime() - marriedYearsAgo * 365 * 24 * 60 * 60 * 1000);
        
        npc.marriedAt = marriedAt;
        spouse.marriedAt = marriedAt;
        
        marriedNpcs.push(npc.id, spouse.id);
        
        dynasty.marriages.push({
          id: `marriage-init-${dynasty.marriages.length}`,
          spouse1Id: npc.id,
          spouse2Id: spouse.id,
          marriedAt,
          location: npc.location,
          political: rng.chance(0.3),
          children: [],
          dissolved: false,
        });
      }
    }
  }
  
  return dynasty;
}

