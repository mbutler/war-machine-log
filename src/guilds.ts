/**
 * THIEVES' GUILD UNDERGROUND
 * 
 * A shadow economy running parallel to legitimate commerce:
 * - Guild hierarchy with masters and cells
 * - Heists targeting caravans, vaults, and nobles
 * - Fencing stolen goods, laundering wealth
 * - Turf wars between rival guilds
 * - Blackmail and secrets as currency
 * - Assassinations as faction tools
 * 
 * REAL-TIME PACING:
 * - Heist planning: 3-7 days minimum for a serious job
 * - Heist execution: 2-8 hours depending on complexity
 * - Fencing goods: 1-4 weeks to move hot merchandise
 * - Turf war cycles: weeks to months
 * - Assassinations: 1-3 weeks to plan and execute
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Settlement, NPC, Party, Faction, Good } from './types.ts';
import { randomName } from './naming.ts';
import { getSettlementState, getFactionState, processWorldEvent, WorldEvent } from './causality.ts';
import { queueConsequence } from './consequences.ts';

// ============================================================================
// GUILD TYPES
// ============================================================================

export type GuildRank = 'apprentice' | 'operative' | 'lieutenant' | 'guildmaster';

export type OperationType = 
  | 'heist'           // Steal from a specific target
  | 'pickpocket'      // Street-level theft
  | 'burglary'        // Breaking and entering
  | 'fence'           // Selling stolen goods
  | 'blackmail'       // Extortion with secrets
  | 'assassination'   // Targeted killing
  | 'protection'      // Extortion racket
  | 'smuggling'       // Moving contraband
  | 'counterfeiting'  // Fake coins/documents
  | 'kidnapping';     // Ransom

export interface ThievesGuild {
  id: string;
  name: string;
  epithet: string;           // "the Shadow Hand", "Blood Coins"
  territory: string[];       // Settlements they control
  headquarters: string;      // Main settlement
  
  // Hierarchy
  guildmasterId: string;     // NPC ID
  lieutenants: string[];     // NPC IDs
  operatives: GuildMember[];
  
  // Resources
  treasury: number;          // Gold in coffers
  infamy: number;            // 0-100, how feared/respected
  heat: number;              // 0-100, how much attention from law
  
  // Intelligence
  secrets: Secret[];
  informants: string[];      // NPC IDs who provide info
  
  // Rivals
  enemies: string[];         // Other guild IDs
  allies: string[];          // Guild or faction IDs
  
  // State
  active: boolean;
  foundedAt: Date;
}

export interface GuildMember {
  npcId: string;
  name: string;
  rank: GuildRank;
  specialty: OperationType;
  skill: number;             // 1-10
  loyalty: number;           // 2-12
  heistsCompleted: number;
  arrested: number;
  joinedAt: Date;
}

export interface Secret {
  id: string;
  targetId: string;          // Who it's about
  targetName: string;
  type: 'scandal' | 'crime' | 'affair' | 'debt' | 'conspiracy' | 'identity';
  severity: number;          // 1-10, how damaging
  knownBy: string[];         // Guild IDs and NPC IDs who know
  discoveredAt: Date;
  monetaryValue: number;     // What it's worth in blackmail
  usedForBlackmail: boolean;
}

export interface GuildOperation {
  id: string;
  guildId: string;
  type: OperationType;
  status: 'planning' | 'active' | 'completed' | 'failed' | 'discovered';
  
  // Planning phase
  planningStarted: Date;
  planningCompletes: Date;
  
  // Execution phase
  executionStarted?: Date;
  executionCompletes?: Date;
  
  // Target
  targetType: 'caravan' | 'vault' | 'noble' | 'merchant' | 'guild' | 'temple' | 'person';
  targetId: string;
  targetName: string;
  targetLocation: string;
  
  // Participants
  leaderId: string;          // GuildMember who runs it
  teamIds: string[];         // Other members involved
  
  // Stakes
  estimatedTake: number;     // Expected gold
  actualTake?: number;       // What they got
  riskLevel: number;         // 1-10
  
  // Results
  casualties: string[];      // Members lost
  discovered: boolean;       // Was the guild identified?
  witnesses: string[];       // NPCs who saw
}

export interface GuildState {
  guilds: ThievesGuild[];
  operations: GuildOperation[];
  hotGoods: HotGoods[];      // Stolen merchandise awaiting fencing
}

export interface HotGoods {
  id: string;
  guildId: string;
  stolenFrom: string;
  stolenAt: Date;
  type: string;              // Description of goods
  value: number;             // True value
  fenceValue: number;        // What a fence will pay (30-60% of value)
  heat: number;              // How recognizable (affects fencing difficulty)
  fencedAt?: Date;
}

// ============================================================================
// GUILD NAMES
// ============================================================================

const GUILD_NAMES = [
  'Shadow Hand', 'Black Masks', 'Night Knives', 'Silent Coin',
  'Velvet Glove', 'Iron Rats', 'Golden Shadows', 'Crimson Purse',
  'Twilight Fingers', 'Whisper Guild', 'Dark Lantern', 'Pale Hand',
  'Silver Serpents', 'Dead Man\'s Purse', 'Ghost Coin',
];

const GUILD_EPITHETS = [
  'masters of the underworld', 'rulers of the shadows',
  'keepers of secrets', 'merchants of the night',
  'princes of thieves', 'children of the dark',
];

// ============================================================================
// GUILD GENERATION
// ============================================================================

export function generateGuild(
  rng: Random,
  settlement: string,
  world: WorldState,
  worldTime: Date,
): ThievesGuild {
  const name = rng.pick(GUILD_NAMES);
  
  // Create guildmaster NPC if not exists
  const guildmasterName = randomName(rng);
  
  const guild: ThievesGuild = {
    id: `guild-${Date.now()}-${rng.int(10000)}`,
    name: `The ${name}`,
    epithet: rng.pick(GUILD_EPITHETS),
    territory: [settlement],
    headquarters: settlement,
    guildmasterId: `guildmaster-${Date.now()}`,
    lieutenants: [],
    operatives: [],
    treasury: 100 + rng.int(500),
    infamy: 10 + rng.int(30),
    heat: rng.int(20),
    secrets: [],
    informants: [],
    enemies: [],
    allies: [],
    active: true,
    foundedAt: worldTime,
  };
  
  // Generate initial operatives (5-12)
  const operativeCount = 5 + rng.int(8);
  for (let i = 0; i < operativeCount; i++) {
    guild.operatives.push({
      npcId: `thief-${Date.now()}-${i}`,
      name: randomName(rng),
      rank: i < 2 ? 'lieutenant' : (i < 5 ? 'operative' : 'apprentice'),
      specialty: rng.pick(['heist', 'pickpocket', 'burglary', 'fence', 'smuggling'] as OperationType[]),
      skill: 3 + rng.int(5),
      loyalty: 7 + rng.int(3),
      heistsCompleted: rng.int(10),
      arrested: rng.int(2),
      joinedAt: new Date(worldTime.getTime() - rng.int(365 * 24 * 60 * 60 * 1000)), // Up to 1 year ago
    });
  }
  
  // Mark lieutenants
  guild.lieutenants = guild.operatives.filter(o => o.rank === 'lieutenant').map(o => o.npcId);
  
  return guild;
}

// ============================================================================
// HEIST PLANNING & EXECUTION
// ============================================================================

export function planHeist(
  rng: Random,
  guild: ThievesGuild,
  targetType: GuildOperation['targetType'],
  targetId: string,
  targetName: string,
  targetLocation: string,
  estimatedValue: number,
  guildState: GuildState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Planning time based on target (in hours)
  // Real-time: 3-7 days for serious heists
  const PLANNING_TIME: Record<GuildOperation['targetType'], { min: number; max: number }> = {
    'caravan': { min: 48, max: 96 },       // 2-4 days
    'vault': { min: 120, max: 240 },       // 5-10 days
    'noble': { min: 96, max: 168 },        // 4-7 days
    'merchant': { min: 48, max: 96 },      // 2-4 days
    'guild': { min: 168, max: 336 },       // 7-14 days (hitting another guild)
    'temple': { min: 120, max: 240 },      // 5-10 days
    'person': { min: 24, max: 72 },        // 1-3 days (pickpocket/mugging)
  };
  
  const timing = PLANNING_TIME[targetType];
  const planningHours = timing.min + rng.int(timing.max - timing.min);
  
  // Select team
  const availableOperatives = guild.operatives.filter(o => o.rank !== 'apprentice');
  if (availableOperatives.length === 0) {
    // No operatives available - can't plan heist
    return logs;
  }
  const teamSize = Math.min(availableOperatives.length, 2 + rng.int(3)); // 2-4 members
  const team = availableOperatives.slice(0, teamSize);
  const leader = team.sort((a, b) => b.skill - a.skill)[0];
  
  const riskLevel = targetType === 'vault' ? 8 + rng.int(3) :
                    targetType === 'noble' ? 6 + rng.int(3) :
                    targetType === 'guild' ? 9 + rng.int(2) :
                    targetType === 'temple' ? 7 + rng.int(3) :
                    4 + rng.int(4);
  
  const operation: GuildOperation = {
    id: `op-${Date.now()}-${rng.int(10000)}`,
    guildId: guild.id,
    type: 'heist',
    status: 'planning',
    planningStarted: worldTime,
    planningCompletes: new Date(worldTime.getTime() + planningHours * 60 * 60 * 1000),
    targetType,
    targetId,
    targetName,
    targetLocation,
    leaderId: leader.npcId,
    teamIds: team.map(t => t.npcId),
    estimatedTake: estimatedValue,
    riskLevel,
    casualties: [],
    discovered: false,
    witnesses: [],
  };
  
  guildState.operations.push(operation);
  
  const daysApprox = Math.round(planningHours / 24);
  logs.push({
    category: 'town',
    summary: `${guild.name} plans a job against ${targetName}`,
    details: `The ${guild.epithet} have set their sights on a ${targetType}. ${leader.name} leads the planning. It will take approximately ${daysApprox} days to prepare.`,
    location: guild.headquarters,
    actors: [guild.name, leader.name],
    worldTime,
    realTime: new Date(),
    seed: '',
  });
  
  return logs;
}

export function executeHeist(
  rng: Random,
  operation: GuildOperation,
  guild: ThievesGuild,
  guildState: GuildState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Calculate success chance
  const teamSkill = operation.teamIds.reduce((sum, id) => {
    const member = guild.operatives.find(o => o.npcId === id);
    return sum + (member?.skill ?? 3);
  }, 0) / operation.teamIds.length;
  
  // Base success: 50% + skill bonus - risk penalty
  const successChance = 0.5 + (teamSkill / 20) - (operation.riskLevel / 20);
  const success = rng.chance(successChance);
  
  // Execution time (2-8 hours)
  const executionHours = 2 + rng.int(7);
  operation.executionStarted = worldTime;
  operation.executionCompletes = new Date(worldTime.getTime() + executionHours * 60 * 60 * 1000);
  operation.status = 'active';
  
  if (success) {
    operation.status = 'completed';
    
    // How much did they actually get?
    const takeMultiplier = 0.6 + rng.next() * 0.8; // 60-140% of estimate
    operation.actualTake = Math.floor(operation.estimatedTake * takeMultiplier);
    
    guild.treasury += operation.actualTake;
    guild.infamy += 2;
    
    // Settlement impact - crime increases unease
    const settlement = world.settlements.find(s => s.name === operation.targetLocation);
    if (settlement) {
      settlement.mood = Math.max(-5, settlement.mood - 1);
    }
    
    // Update member stats
    for (const memberId of operation.teamIds) {
      const member = guild.operatives.find(o => o.npcId === memberId);
      if (member) member.heistsCompleted++;
    }
    
    // Was it clean or did they leave evidence?
    operation.discovered = rng.chance(0.3 - teamSkill / 30);
    if (operation.discovered) {
      guild.heat += 10 + rng.int(10);
    }
    
    // Add to hot goods
    guildState.hotGoods.push({
      id: `goods-${Date.now()}`,
      guildId: guild.id,
      stolenFrom: operation.targetName,
      stolenAt: worldTime,
      type: operation.targetType === 'caravan' ? 'trade goods' : 
            operation.targetType === 'noble' ? 'jewelry and valuables' :
            operation.targetType === 'vault' ? 'coin and treasures' :
            'stolen merchandise',
      value: operation.actualTake,
      fenceValue: Math.floor(operation.actualTake * (0.3 + rng.next() * 0.3)), // 30-60%
      heat: operation.discovered ? 80 + rng.int(20) : 20 + rng.int(30),
    });
    
    logs.push({
      category: 'town',
      summary: `${guild.name} pulls off a heist on ${operation.targetName}`,
      details: `${operation.actualTake} gold worth of goods vanish in the night. ${operation.discovered ? 'Suspicion falls on known criminal elements.' : 'The perpetrators leave no trace.'}`,
      location: operation.targetLocation,
      actors: [guild.name],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    
  } else {
    operation.status = 'failed';
    operation.discovered = true;
    guild.heat += 20 + rng.int(20);
    
    // Casualties?
    for (const memberId of operation.teamIds) {
      if (rng.chance(0.2)) {
        const member = guild.operatives.find(o => o.npcId === memberId);
        if (member) {
          operation.casualties.push(memberId);
          
          if (rng.chance(0.5)) {
            // Killed
            guild.operatives = guild.operatives.filter(o => o.npcId !== memberId);
            logs.push({
              category: 'town',
              summary: `${member.name} slain during botched heist`,
              details: `The ${operation.targetType} was better protected than expected. ${member.name} paid the ultimate price.`,
              location: operation.targetLocation,
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          } else {
            // Arrested
            member.arrested++;
            logs.push({
              category: 'town',
              summary: `${member.name} arrested for attempted theft`,
              details: `The watch drags away a member of ${guild.name}. How much will they talk?`,
              location: operation.targetLocation,
              actors: [member.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
      }
    }
    
    if (operation.casualties.length === 0) {
      logs.push({
        category: 'town',
        summary: `${guild.name}'s heist on ${operation.targetName} fails`,
        details: `Alarms are raised. The thieves flee empty-handed into the night.`,
        location: operation.targetLocation,
        actors: [guild.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return logs;
}

// ============================================================================
// FENCING STOLEN GOODS
// ============================================================================

export function tickFencing(
  rng: Random,
  guildState: GuildState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const goods of guildState.hotGoods) {
    if (goods.fencedAt) continue;
    
    const guild = guildState.guilds.find(g => g.id === goods.guildId);
    if (!guild) continue;
    
    // Time since theft
    const hoursSinceTheft = (worldTime.getTime() - new Date(goods.stolenAt).getTime()) / (60 * 60 * 1000);
    
    // Heat cools over time (real-time: ~2 weeks for hot goods to cool)
    const coolingPerHour = 0.3;
    goods.heat = Math.max(0, goods.heat - coolingPerHour);
    
    // Fencing chance increases as heat decreases
    // Real-time: 1-4 weeks to fence depending on heat
    if (hoursSinceTheft >= 24 && goods.heat < 50) {
      // Attempt to fence
      const fenceChance = (100 - goods.heat) / 200; // 25-50% per check
      
      if (rng.chance(fenceChance)) {
        goods.fencedAt = worldTime;
        guild.treasury += goods.fenceValue;
        
        logs.push({
          category: 'town',
          summary: `${guild.name} moves stolen goods`,
          details: `The ${goods.type} from ${goods.stolenFrom} finally finds a buyer. ${goods.fenceValue} gold changes hands in a shadowy transaction.`,
          location: guild.headquarters,
          actors: [guild.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }
  
  // Clean up fenced goods
  guildState.hotGoods = guildState.hotGoods.filter(g => !g.fencedAt);
  
  return logs;
}

// ============================================================================
// BLACKMAIL & SECRETS
// ============================================================================

export function discoverSecret(
  rng: Random,
  guild: ThievesGuild,
  targetId: string,
  targetName: string,
  world: WorldState,
  worldTime: Date,
): Secret | null {
  const SECRET_TYPES: Array<{ type: Secret['type']; severity: number; value: number }> = [
    { type: 'affair', severity: 5 + rng.int(3), value: 50 + rng.int(200) },
    { type: 'debt', severity: 3 + rng.int(4), value: 30 + rng.int(100) },
    { type: 'crime', severity: 6 + rng.int(4), value: 100 + rng.int(300) },
    { type: 'scandal', severity: 4 + rng.int(4), value: 50 + rng.int(150) },
    { type: 'conspiracy', severity: 8 + rng.int(3), value: 200 + rng.int(500) },
    { type: 'identity', severity: 7 + rng.int(4), value: 150 + rng.int(350) },
  ];
  
  const template = rng.pick(SECRET_TYPES);
  
  return {
    id: `secret-${Date.now()}-${rng.int(10000)}`,
    targetId,
    targetName,
    type: template.type,
    severity: template.severity,
    knownBy: [guild.id],
    discoveredAt: worldTime,
    monetaryValue: template.value,
    usedForBlackmail: false,
  };
}

export function attemptBlackmail(
  rng: Random,
  guild: ThievesGuild,
  secret: Secret,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  if (secret.usedForBlackmail) return logs;
  
  // Success based on severity and target's resources
  const successChance = 0.4 + secret.severity / 20;
  const success = rng.chance(successChance);
  
  if (success) {
    secret.usedForBlackmail = true;
    guild.treasury += secret.monetaryValue;
    guild.heat += 5;
    
    logs.push({
      category: 'town',
      summary: `${secret.targetName} pays for silence`,
      details: `${guild.name} knows about the ${secret.type}. ${secret.monetaryValue} gold buys discretion—for now.`,
      location: guild.headquarters,
      actors: [guild.name, secret.targetName],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    
  } else {
    // Target refuses or reports to authorities
    guild.heat += 15;
    
    if (rng.chance(0.3)) {
      // Target becomes enemy
      logs.push({
        category: 'town',
        summary: `${secret.targetName} refuses ${guild.name}'s demands`,
        details: `The blackmail attempt backfires. ${secret.targetName} vows revenge against the underworld.`,
        location: guild.headquarters,
        actors: [guild.name, secret.targetName],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return logs;
}

// ============================================================================
// ASSASSINATION CONTRACTS
// ============================================================================

export function planAssassination(
  rng: Random,
  guild: ThievesGuild,
  targetId: string,
  targetName: string,
  targetLocation: string,
  clientId: string,
  payment: number,
  guildState: GuildState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Find best assassin in guild
  const assassins = guild.operatives.filter(o => o.specialty === 'assassination' || o.skill >= 7);
  if (assassins.length === 0) {
    logs.push({
      category: 'town',
      summary: `${guild.name} declines assassination contract`,
      details: `No operative skilled enough for such delicate work.`,
      location: guild.headquarters,
      worldTime,
      realTime: new Date(),
      seed: '',
    });
    return logs;
  }
  
  const assassin = assassins.sort((a, b) => b.skill - a.skill)[0];
  
  // Planning time: 7-21 days for assassination
  const planningHours = 168 + rng.int(336); // 7-21 days
  
  const operation: GuildOperation = {
    id: `assassin-${Date.now()}`,
    guildId: guild.id,
    type: 'assassination',
    status: 'planning',
    planningStarted: worldTime,
    planningCompletes: new Date(worldTime.getTime() + planningHours * 60 * 60 * 1000),
    targetType: 'person',
    targetId,
    targetName,
    targetLocation,
    leaderId: assassin.npcId,
    teamIds: [assassin.npcId],
    estimatedTake: payment,
    riskLevel: 9, // Assassination is always high risk
    casualties: [],
    discovered: false,
    witnesses: [],
  };
  
  guildState.operations.push(operation);
  
  const daysApprox = Math.round(planningHours / 24);
  logs.push({
    category: 'faction',
    summary: `A contract is taken on ${targetName}`,
    details: `${guild.name} accepts the job. ${assassin.name} begins preparations. The target has approximately ${daysApprox} days to live.`,
    location: guild.headquarters,
    worldTime,
    realTime: new Date(),
    seed: '',
  });
  
  return logs;
}

export function executeAssassination(
  rng: Random,
  operation: GuildOperation,
  guild: ThievesGuild,
  guildState: GuildState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  const assassin = guild.operatives.find(o => o.npcId === operation.leaderId);
  if (!assassin) return logs;
  
  // Success chance: high skill needed
  const successChance = 0.3 + (assassin.skill / 15);
  const success = rng.chance(successChance);
  
  if (success) {
    operation.status = 'completed';
    operation.actualTake = operation.estimatedTake;
    guild.treasury += operation.estimatedTake;
    guild.infamy += 10;
    assassin.heistsCompleted++;
    
    // Clean kill?
    operation.discovered = rng.chance(0.4);
    if (operation.discovered) {
      guild.heat += 30;
    }
    
    // Kill the target
    const targetNpc = world.npcs.find(n => n.id === operation.targetId || n.name === operation.targetName);
    if (targetNpc) {
      targetNpc.alive = false;
      
      // Process as assassination event
      const event: WorldEvent = {
        id: `assassination-${Date.now()}`,
        type: 'assassination',
        timestamp: worldTime,
        location: operation.targetLocation,
        actors: [guild.name],
        victims: [operation.targetName],
        perpetrators: [guild.name],
        magnitude: 8,
        witnessed: operation.discovered,
        data: { cause: 'contract killing' },
      };
      
      // Don't process here to avoid circular dependency - queue it
      queueConsequence({
        type: 'spawn-event',
        triggerEvent: `Assassination of ${operation.targetName}`,
        turnsUntilResolution: 1,
        data: event,
        priority: 5,
      });
    }
    
    logs.push({
      category: 'town',
      summary: `${operation.targetName} found dead`,
      details: operation.discovered 
        ? `Poison. Blade. No witnesses—almost. Word on the street points to ${guild.name}.`
        : `A sudden death. Natural causes, they say. But those who know, know better.`,
      location: operation.targetLocation,
      actors: [operation.targetName],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    
  } else {
    operation.status = 'failed';
    operation.discovered = true;
    guild.heat += 40;
    
    // Did the assassin survive?
    if (rng.chance(0.4)) {
      guild.operatives = guild.operatives.filter(o => o.npcId !== assassin.npcId);
      operation.casualties.push(assassin.npcId);
      
      logs.push({
        category: 'town',
        summary: `Assassination attempt on ${operation.targetName} foiled`,
        details: `${assassin.name} is slain in the attempt. ${guild.name}'s involvement is exposed.`,
        location: operation.targetLocation,
        actors: [operation.targetName, assassin.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    } else {
      assassin.arrested++;
      
      logs.push({
        category: 'town',
        summary: `Assassination attempt on ${operation.targetName} foiled`,
        details: `The would-be killer escapes into the shadows. ${operation.targetName} lives—for now.`,
        location: operation.targetLocation,
        actors: [operation.targetName],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return logs;
}

// ============================================================================
// GUILD WARS
// ============================================================================

export function tickGuildWars(
  rng: Random,
  guildState: GuildState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const guild of guildState.guilds) {
    if (!guild.active) continue;
    
    // Check for conflict with other guilds in same territory
    for (const otherGuild of guildState.guilds) {
      if (otherGuild.id === guild.id || !otherGuild.active) continue;
      
      const sharedTerritory = guild.territory.filter(t => otherGuild.territory.includes(t));
      if (sharedTerritory.length === 0) continue;
      
      // Existing enemies are more likely to fight
      const isEnemy = guild.enemies.includes(otherGuild.id);
      const conflictChance = isEnemy ? 0.05 : 0.01;
      
      if (rng.chance(conflictChance)) {
        const territory = rng.pick(sharedTerritory);
        
        // Small skirmish
        const guildStrength = guild.operatives.length + guild.infamy / 10;
        const otherStrength = otherGuild.operatives.length + otherGuild.infamy / 10;
        
        const guildWins = (guildStrength + rng.int(10)) > (otherStrength + rng.int(10));
        const winner = guildWins ? guild : otherGuild;
        const loser = guildWins ? otherGuild : guild;
        
        // Casualties
        const loserCasualties = 1 + rng.int(2);
        for (let i = 0; i < loserCasualties && loser.operatives.length > 2; i++) {
          const victim = loser.operatives[loser.operatives.length - 1];
          loser.operatives.pop();
          
          if (rng.chance(0.5)) {
            logs.push({
              category: 'town',
              summary: `${victim.name} killed in guild war`,
              details: `The streets of ${territory} run red as ${guild.name} and ${otherGuild.name} clash.`,
              location: territory,
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
        
        // Mark as enemies if not already
        if (!guild.enemies.includes(otherGuild.id)) {
          guild.enemies.push(otherGuild.id);
          otherGuild.enemies.push(guild.id);
        }
        
        // Winner gains territory if they dominate
        if (winner.operatives.length > loser.operatives.length * 2) {
          loser.territory = loser.territory.filter(t => t !== territory);
          
          logs.push({
            category: 'faction',
            summary: `${winner.name} drives ${loser.name} from ${territory}`,
            details: `The guild war ends decisively. ${territory} belongs to ${winner.name} now.`,
            location: territory,
            actors: [winner.name, loser.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    }
  }
  
  return logs;
}

// ============================================================================
// PROTECTION RACKETS
// ============================================================================

export function tickProtectionRackets(
  rng: Random,
  guildState: GuildState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Monthly collection on the 1st
  if (worldTime.getUTCDate() !== 1) return logs;
  
  for (const guild of guildState.guilds) {
    if (!guild.active) continue;
    
    for (const territory of guild.territory) {
      const settlement = world.settlements.find(s => s.name === territory);
      if (!settlement) continue;
      
      // Collection amount based on settlement size and guild infamy
      const baseCollection = settlement.type === 'city' ? 100 :
                            settlement.type === 'town' ? 50 : 20;
      const collection = Math.floor(baseCollection * (1 + guild.infamy / 100));
      
      guild.treasury += collection;
      guild.heat += 2;
      
      // Rare resistance
      if (rng.chance(0.05)) {
        const merchant = randomName(rng);
        
        if (rng.chance(0.3)) {
          // Merchant fights back
          logs.push({
            category: 'town',
            summary: `Merchant refuses ${guild.name}'s "protection"`,
            details: `${merchant} stands up to the guild. A brave but perhaps foolish act.`,
            location: territory,
            actors: [merchant, guild.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          // Consequences queued
          queueConsequence({
            type: 'spawn-event',
            triggerEvent: `${merchant} defiance`,
            turnsUntilResolution: 24 + rng.int(48),
            data: {
              category: 'town',
              summary: `${merchant}'s shop burns`,
              details: `A midnight fire. No one is surprised. The message is clear.`,
              location: territory,
            },
            priority: 3,
          });
        }
      }
    }
  }
  
  return logs;
}

// ============================================================================
// MAIN TICK FUNCTION
// ============================================================================

export function tickGuilds(
  rng: Random,
  guildState: GuildState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Process active operations
  for (const operation of guildState.operations) {
    const guild = guildState.guilds.find(g => g.id === operation.guildId);
    if (!guild || !guild.active) continue;
    
    // Check if planning is complete
    if (operation.status === 'planning' && new Date(operation.planningCompletes) <= worldTime) {
      if (operation.type === 'heist') {
        logs.push(...executeHeist(rng, operation, guild, guildState, world, worldTime));
      } else if (operation.type === 'assassination') {
        logs.push(...executeAssassination(rng, operation, guild, guildState, world, worldTime));
      }
    }
  }
  
  // Remove completed/failed operations older than 7 days
  guildState.operations = guildState.operations.filter(op => 
    op.status === 'planning' || op.status === 'active' ||
    (worldTime.getTime() - new Date(op.planningStarted).getTime()) < 7 * 24 * 60 * 60 * 1000
  );
  
  // Fence stolen goods
  logs.push(...tickFencing(rng, guildState, world, worldTime));
  
  // Protection rackets
  logs.push(...tickProtectionRackets(rng, guildState, world, worldTime));
  
  // Guild wars
  logs.push(...tickGuildWars(rng, guildState, world, worldTime));
  
  // Heat decay (real-time: ~1 week to halve heat)
  for (const guild of guildState.guilds) {
    guild.heat = Math.max(0, guild.heat - 0.5);
  }
  
  // Random events
  if (rng.chance(0.02)) {
    const activeGuilds = guildState.guilds.filter(g => g.active);
    if (activeGuilds.length > 0) {
      const guild = rng.pick(activeGuilds);
      
      // Maybe discover a secret
      if (guild.informants.length > 0 || rng.chance(0.3)) {
        const targets = world.npcs.filter(n => 
          n.alive !== false && 
          (n.fame ?? 0) >= 2 &&
          !guild.secrets.some(s => s.targetId === n.id)
        );
        
        if (targets.length > 0) {
          const target = rng.pick(targets);
          const secret = discoverSecret(rng, guild, target.id, target.name, world, worldTime);
          
          if (secret) {
            guild.secrets.push(secret);
            
            logs.push({
              category: 'town',
              summary: `${guild.name} uncovers a secret about ${target.name}`,
              details: `The ${secret.type} will fetch a pretty price—one way or another.`,
              location: guild.headquarters,
              actors: [guild.name, target.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
      }
      
      // Maybe start a new operation
      if (guild.treasury >= 50 && guildState.operations.filter(o => o.guildId === guild.id && o.status === 'planning').length < 2) {
        // Pick a target
        const territory = rng.pick(guild.territory);
        const settlement = world.settlements.find(s => s.name === territory);
        
        if (settlement) {
          const caravans = world.caravans.filter(c => c.location === territory || c.route.some(r => {
            const s = world.settlements.find(s => s.id === r);
            return s?.name === territory;
          }));
          
          if (caravans.length > 0 && rng.chance(0.5)) {
            const caravan = rng.pick(caravans);
            logs.push(...planHeist(
              rng, guild, 'caravan', caravan.id, caravan.name,
              territory, 100 + rng.int(200), guildState, worldTime
            ));
          } else {
            // Target a merchant
            const merchantValue = 50 + rng.int(150);
            logs.push(...planHeist(
              rng, guild, 'merchant', `merchant-${Date.now()}`, 
              `a ${territory} merchant`, territory, merchantValue, guildState, worldTime
            ));
          }
        }
      }
    }
  }
  
  return logs;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function createGuildState(): GuildState {
  return {
    guilds: [],
    operations: [],
    hotGoods: [],
  };
}

export function seedGuilds(
  rng: Random,
  world: WorldState,
  worldTime: Date,
): GuildState {
  const state = createGuildState();
  
  // Create guilds in larger settlements
  for (const settlement of world.settlements) {
    if (settlement.type === 'city') {
      // Cities get 2 guilds (rivals)
      state.guilds.push(generateGuild(rng, settlement.name, world, worldTime));
      if (rng.chance(0.7)) {
        const secondGuild = generateGuild(rng, settlement.name, world, worldTime);
        state.guilds.push(secondGuild);
        // They're rivals
        state.guilds[state.guilds.length - 2].enemies.push(secondGuild.id);
        secondGuild.enemies.push(state.guilds[state.guilds.length - 2].id);
      }
    } else if (settlement.type === 'town' && rng.chance(0.6)) {
      // Towns have 60% chance of a guild
      state.guilds.push(generateGuild(rng, settlement.name, world, worldTime));
    }
  }
  
  return state;
}

