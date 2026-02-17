/**
 * CHARACTER DEPTH SYSTEM
 * 
 * Gives NPCs, party members, and notable figures personality traits,
 * backgrounds, motivations, and relationships that drive emergent stories.
 */

import { Random } from './rng.ts';
import { NPC, NPCRole, Party, WorldState, LogEntry, CharacterClass } from './types.ts';
import { ReactiveNPC, NPCAgenda, NPCMemory } from './causality.ts';
import { randomName } from './naming.ts';

// Helper to get settlement name from ID
function getSettlementName(world: WorldState | undefined, settlementId: string): string {
  if (!world) return settlementId;
  const settlement = world.settlements.find((s) => s.id === settlementId);
  return settlement?.name ?? settlementId;
}

// Personality traits that affect behavior and interactions
export type Trait =
  | 'ambitious'
  | 'cautious'
  | 'greedy'
  | 'honorable'
  | 'cruel'
  | 'charitable'
  | 'cowardly'
  | 'brave'
  | 'cunning'
  | 'naive'
  | 'pious'
  | 'skeptical'
  | 'loyal'
  | 'treacherous'
  | 'romantic'
  | 'pragmatic';

export type Background =
  | 'noble-exile'
  | 'veteran-soldier'
  | 'escaped-slave'
  | 'disgraced-priest'
  | 'failed-merchant'
  | 'orphan-thief'
  | 'hedge-wizard'
  | 'wandering-bard'
  | 'reformed-bandit'
  | 'retired-adventurer'
  | 'foreign-exile'
  | 'guild-dropout'
  | 'farmhand-turned-guard'
  | 'shipwreck-survivor'
  | 'plague-orphan';

export type Motivation =
  | 'wealth'
  | 'revenge'
  | 'power'
  | 'redemption'
  | 'knowledge'
  | 'love'
  | 'duty'
  | 'survival'
  | 'fame'
  | 'home'
  | 'justice'
  | 'freedom';

export type RelationType =
  | 'rival'
  | 'ally'
  | 'lover'
  | 'enemy'
  | 'mentor'
  | 'student'
  | 'debtor'
  | 'creditor'
  | 'kin'
  | 'betrayer'
  | 'betrayed';

export interface Relationship {
  targetId: string;
  targetName: string;
  type: RelationType;
  strength: number; // 1-5, intensity of relationship
  history?: string; // Brief description of the relationship's origin
}

export interface CharacterDepth {
  traits: Trait[];
  background: Background;
  motivation: Motivation;
  secretMotivation?: Motivation; // Hidden agenda
  relationships: Relationship[];
  memories: string[]; // Notable past events this character remembers
  quirks: string[]; // Behavioral quirks for flavor
}

// Extended NPC type with depth
export interface DeepNPC extends NPC, Partial<ReactiveNPC> {
  depth?: CharacterDepth;
  age?: number;
  title?: string;
  appearance?: string;
  secretsKnown?: string[]; // Information they might share or conceal
}

const TRAIT_POOL: Trait[] = [
  'ambitious', 'cautious', 'greedy', 'honorable', 'cruel', 'charitable',
  'cowardly', 'brave', 'cunning', 'naive', 'pious', 'skeptical',
  'loyal', 'treacherous', 'romantic', 'pragmatic',
];

const BACKGROUND_POOL: Background[] = [
  'noble-exile', 'veteran-soldier', 'escaped-slave', 'disgraced-priest',
  'failed-merchant', 'orphan-thief', 'hedge-wizard', 'wandering-bard',
  'reformed-bandit', 'retired-adventurer', 'foreign-exile', 'guild-dropout',
  'farmhand-turned-guard', 'shipwreck-survivor', 'plague-orphan',
];

const MOTIVATION_POOL: Motivation[] = [
  'wealth', 'revenge', 'power', 'redemption', 'knowledge', 'love',
  'duty', 'survival', 'fame', 'home', 'justice', 'freedom',
];

const QUIRKS = [
  'speaks in proverbs',
  'constantly counts coins',
  'never sits with back to door',
  'hums old war songs',
  'refuses to eat meat',
  'collects small bones',
  'always wears a lucky charm',
  'tells the same three stories',
  'trusts no one who smiles too easily',
  'prays before every meal',
  'sleeps with a blade in hand',
  'fears deep water',
  'cannot resist a wager',
  'speaks to animals as if they understand',
  'always knows which way is north',
  'never reveals their true name',
  'keeps a journal in cipher',
  'has recurring nightmares',
  'laughs at inappropriate moments',
  'quotes ancient philosophers',
];

const APPEARANCES = [
  'scarred face and knowing eyes',
  'surprisingly young features',
  'weathered hands that speak of hard labor',
  'an aristocratic bearing despite rough clothes',
  'a nervous tic in the left eye',
  'graying at the temples despite apparent youth',
  'missing two fingers on the left hand',
  'a limp from an old wound',
  'elaborate tattoos visible at wrist and neck',
  'eyes of mismatched color',
  'a brand mark, poorly concealed',
  'the bearing of one who has worn armor',
  'ink-stained fingers of a scholar',
  'calluses of a lifetime of sword work',
  'the cautious movements of one used to danger',
];

const BACKGROUND_DESCRIPTIONS: Record<Background, string[]> = {
  'noble-exile': [
    'Once held lands and title, now holds only bitter memories.',
    'A name that once commanded respect, now spoken only in whispers.',
    'Fled the court one step ahead of the executioner.',
  ],
  'veteran-soldier': [
    'Served in campaigns that history books will never mention.',
    'Carries the weight of comrades buried in foreign soil.',
    'The discipline of the camp never quite left them.',
  ],
  'escaped-slave': [
    'Bears scars that clothing cannot hide.',
    'Freedom is sweeter for those who have known chains.',
    'Some nights, they still dream of the pens.',
  ],
  'disgraced-priest': [
    'Once spoke with divine authority; now the gods are silent.',
    'Faith shattered by what was witnessed in the inner sanctum.',
    'Excommunicated for asking the wrong questions.',
  ],
  'failed-merchant': [
    'A fortune lost to pirates, partners, or poor judgment.',
    'Still calculates profit margins out of habit.',
    'Knows the value of everything and the price of failure.',
  ],
  'orphan-thief': [
    'The streets were their only teacher, and a harsh one.',
    'Nimble fingers and nimbler excuses kept them alive.',
    'Trust is a luxury they could never afford.',
  ],
  'hedge-wizard': [
    'Magics learned from old books and older practitioners.',
    'Not powerful enough for the academies, not ignorant enough for peace.',
    'The Art exacts its price in strange dreams and stranger hungers.',
  ],
  'wandering-bard': [
    'Has a song for every occasion and a lie for every authority.',
    'Traveled roads that maps forgot.',
    'Knows more secrets than any spy, and sells none of them cheap.',
  ],
  'reformed-bandit': [
    'Once took from travelers what the road refused to provide.',
    'The past has a way of catching up on dark nights.',
    'Reformation sits uneasily on old sins.',
  ],
  'retired-adventurer': [
    'Survived dungeons that claimed better warriors.',
    'Knows that every treasure has a price beyond gold.',
    'The quiet life proved harder than the adventuring one.',
  ],
  'foreign-exile': [
    'From lands these people cannot even pronounce.',
    'Strange customs make strangers; strange accents make suspects.',
    'Home is a word that now means only heartache.',
  ],
  'guild-dropout': [
    "Couldn't stomach the politics, or the politics couldn't stomach them.",
    'Still knows the secret signs, but no longer answers them.',
    'Some bridges burn hotter than others.',
  ],
  'farmhand-turned-guard': [
    'Trading plow for spear seemed like advancement at the time.',
    'Simple origins, complicated present.',
    'The fields were honest work; this is just work.',
  ],
  'shipwreck-survivor': [
    'The sea took everything but life, and nearly that.',
    'Sometimes hears the waves in their sleep.',
    'Knows the true face of the deep, and fears it still.',
  ],
  'plague-orphan': [
    'The sickness that took their family left strange gifts.',
    'Death visited early, and never quite left.',
    'Knows the smell of rot and the sound of bells too well.',
  ],
};

export function generateCharacterDepth(rng: Random, role?: NPCRole): CharacterDepth {
  // Pick 2-3 traits, potentially conflicting for interesting characters
  const traitCount = 2 + rng.int(2);
  const traits: Trait[] = [];
  for (let i = 0; i < traitCount; i++) {
    const trait = rng.pick(TRAIT_POOL);
    if (!traits.includes(trait)) traits.push(trait);
  }

  const background = rng.pick(BACKGROUND_POOL);
  const motivation = rng.pick(MOTIVATION_POOL);
  const secretMotivation = rng.chance(0.3) ? rng.pick(MOTIVATION_POOL) : undefined;

  // 1-3 quirks
  const quirkCount = 1 + rng.int(3);
  const quirks: string[] = [];
  for (let i = 0; i < quirkCount; i++) {
    const q = rng.pick(QUIRKS);
    if (!quirks.includes(q)) quirks.push(q);
  }

  return {
    traits,
    background,
    motivation,
    secretMotivation,
    relationships: [],
    memories: [],
    quirks,
  };
}

export function generateAppearance(rng: Random): string {
  return rng.pick(APPEARANCES);
}

export function generateTitle(rng: Random, role: NPCRole): string {
  const TITLES: Record<NPCRole, string[]> = {
    merchant: ['Master', 'Goodman', 'Trader', 'Merchant-Factor', 'Chandler'],
    guard: ['Sergeant', 'Corporal', 'Watch-Captain', 'Armsman', 'Guardsman'],
    scout: ['Ranger', 'Tracker', 'Outrider', 'Path-Finder', 'Woods-Guide'],
    priest: ['Brother', 'Sister', 'Prior', 'Vicar', 'Acolyte', 'Deacon'],
    bard: ['Minstrel', 'Skald', 'Troubadour', 'Cantor', 'Rhapsode'],
    laborer: ['Goodman', 'Porter', 'Dockhand', 'Digger', 'Hauler'],
  };
  return rng.pick(TITLES[role] ?? ['Citizen']);
}

export function describeBackground(rng: Random, background: Background): string {
  return rng.pick(BACKGROUND_DESCRIPTIONS[background]);
}

// Create a relationship between two NPCs
export function createRelationship(
  rng: Random,
  sourceNpc: DeepNPC,
  targetNpc: DeepNPC,
  world?: WorldState,
): Relationship {
  const types: RelationType[] = ['rival', 'ally', 'enemy', 'mentor', 'student', 'debtor', 'creditor', 'betrayer', 'betrayed'];
  // Add romance only sometimes
  if (rng.chance(0.15)) types.push('lover');
  if (rng.chance(0.1)) types.push('kin');

  const type = rng.pick(types);
  const strength = 1 + rng.int(5);
  const homeName = getSettlementName(world, sourceNpc.home);

  const HISTORY_TEMPLATES: Record<RelationType, string[]> = {
    rival: [
      `Competed for the same position in ${homeName}.`,
      'An old grudge over a matter of honor.',
      'Both loved the same person, once.',
    ],
    ally: [
      'Survived a dangerous journey together.',
      'Owe each other debts that gold cannot repay.',
      'Shared a cell, or a foxhole, or both.',
    ],
    lover: [
      'A passion that scandalized the town.',
      'Met under strange circumstances; love was stranger still.',
      'Some say the affair still smolders.',
    ],
    enemy: [
      `Blood spilled between them in ${homeName}.`,
      'Words were said that cannot be unsaid.',
      'Only one of them can have what they both want.',
    ],
    mentor: [
      'Taught them everything worth knowing.',
      'Saw potential where others saw nothing.',
      'The old ways, passed down in secret.',
    ],
    student: [
      'The most promising pupil in years.',
      'Still learning, still surprising.',
      'Will surpass the master, given time.',
    ],
    debtor: [
      'Borrowed gold at the worst possible moment.',
      'The debt was financial; the cost was higher.',
      'Interest compounds, and so does resentment.',
    ],
    creditor: [
      'Extended credit when no one else would.',
      'Expects repayment, with interest.',
      'Gold is owed, and gold will be had.',
    ],
    kin: [
      'The family resemblance is unmistakable.',
      'Blood ties that neither can deny.',
      'Estranged, but kin nonetheless.',
    ],
    betrayer: [
      'Sold them out for gold, or fear, or both.',
      'The knife came from behind, as always.',
      'Trust, once given, was spectacularly misplaced.',
    ],
    betrayed: [
      'Still bears the scars of misplaced faith.',
      'Forgiveness is not forthcoming.',
      'Watches old friends with new suspicion.',
    ],
  };

  return {
    targetId: targetNpc.id,
    targetName: targetNpc.name,
    type,
    strength,
    history: rng.pick(HISTORY_TEMPLATES[type]),
  };
}

// Seed relationships across NPC population
export function seedRelationships(rng: Random, npcs: DeepNPC[], world?: WorldState): void {
  // Each NPC gets 1-3 relationships
  for (const npc of npcs) {
    if (!npc.depth) continue;
    const relationshipCount = 1 + rng.int(3);
    const candidates = npcs.filter((n) => n.id !== npc.id);

    for (let i = 0; i < relationshipCount && candidates.length > 0; i++) {
      const target = rng.pick(candidates);
      if (!target.depth) continue;

      // Don't duplicate relationships
      if (npc.depth.relationships.some((r) => r.targetId === target.id)) continue;

      const relationship = createRelationship(rng, npc, target, world);
      npc.depth.relationships.push(relationship);

      // Create reciprocal relationship sometimes (not always symmetric)
      if (rng.chance(0.6)) {
        const RECIPROCAL: Record<RelationType, RelationType> = {
          rival: 'rival',
          ally: 'ally',
          lover: 'lover',
          enemy: 'enemy',
          mentor: 'student',
          student: 'mentor',
          debtor: 'creditor',
          creditor: 'debtor',
          kin: 'kin',
          betrayer: 'betrayed',
          betrayed: 'betrayer',
        };
        target.depth.relationships.push({
          targetId: npc.id,
          targetName: npc.name,
          type: RECIPROCAL[relationship.type],
          strength: relationship.strength,
          history: relationship.history,
        });
      }
    }
  }
}

// Generate a character introduction log entry when they become notable
export function introduceCharacter(npc: DeepNPC, worldTime: Date, seed: string, world?: WorldState): LogEntry {
  const depth = npc.depth;
  const title = npc.title ?? '';
  const appearance = npc.appearance ?? 'an unremarkable appearance';
  const homeName = getSettlementName(world, npc.home);

  let details = `${title} ${npc.name}, a ${npc.role} of ${homeName}.`;
  if (depth) {
    details += ` ${describeBackground({ pick: () => depth.background } as Random, depth.background)}`;
    if (depth.quirks.length) {
      details += ` They say they ${depth.quirks[0]}.`;
    }
  }
  if (appearance) {
    details = `With ${appearance}. ${details}`;
  }

  return {
    category: 'town',
    summary: `A notable figure: ${npc.name}`,
    details,
    location: npc.location,
    actors: [npc.name],
    worldTime,
    realTime: new Date(),
    seed,
  };
}

// Generate relationship drama event
export function relationshipEvent(
  rng: Random,
  npc: DeepNPC,
  world: WorldState,
  worldTime: Date,
): LogEntry | null {
  const depth = npc.depth;
  if (!depth || !depth.relationships.length) return null;

  const relationship = rng.pick(depth.relationships);
  const DRAMA: Record<RelationType, { summaries: string[]; details: string[] }> = {
    rival: {
      summaries: [
        `${npc.name} and ${relationship.targetName} exchange pointed words`,
        `Old rivalry flares between ${npc.name} and ${relationship.targetName}`,
      ],
      details: [
        'Neither would yield. The tension was palpable.',
        'Onlookers sensed violence in the air, barely held back.',
      ],
    },
    ally: {
      summaries: [
        `${npc.name} and ${relationship.targetName} seen conferring`,
        `${npc.name} backs ${relationship.targetName} in public dispute`,
      ],
      details: [
        'Old bonds proved their worth once again.',
        'Their alliance is noted—and envied—by others.',
      ],
    },
    lover: {
      summaries: [
        `Whispers of ${npc.name} and ${relationship.targetName} meeting in secret`,
        `${npc.name} seen leaving ${relationship.targetName}'s lodgings at dawn`,
      ],
      details: [
        'The affair continues, discretion be damned.',
        'Some say passion; others say scandal.',
      ],
    },
    enemy: {
      summaries: [
        `${npc.name} barely avoids confrontation with ${relationship.targetName}`,
        `Violence threatened between ${npc.name} and ${relationship.targetName}`,
      ],
      details: [
        'Blood may yet be spilled between them.',
        'The feud grows more dangerous by the day.',
      ],
    },
    mentor: {
      summaries: [
        `${npc.name} instructs ${relationship.targetName}`,
        `${npc.name} takes ${relationship.targetName} under their wing`,
      ],
      details: [
        'Wisdom passed from one generation to the next.',
        'The student shows promise—or perhaps stubborn foolishness.',
      ],
    },
    student: {
      summaries: [
        `${npc.name} seeks guidance from ${relationship.targetName}`,
        `${npc.name} demonstrates new skills learned from ${relationship.targetName}`,
      ],
      details: [
        'The lessons take root.',
        'Not every student surpasses the master, but hope remains.',
      ],
    },
    debtor: {
      summaries: [
        `${npc.name} negotiates terms with creditor ${relationship.targetName}`,
        `${relationship.targetName} presses ${npc.name} for payment`,
      ],
      details: [
        'Gold owed sits heavy on both parties.',
        'The debt strains whatever else exists between them.',
      ],
    },
    creditor: {
      summaries: [
        `${npc.name} demands repayment from ${relationship.targetName}`,
        `${npc.name} grows impatient with ${relationship.targetName}'s excuses`,
      ],
      details: [
        'Patience has limits, even for gold.',
        'The ledger must balance, one way or another.',
      ],
    },
    kin: {
      summaries: [
        `${npc.name} meets with kinsman ${relationship.targetName}`,
        `Family business draws ${npc.name} and ${relationship.targetName} together`,
      ],
      details: [
        'Blood calls to blood, for good or ill.',
        'Some family ties bind; others chafe.',
      ],
    },
    betrayer: {
      summaries: [
        `${npc.name} avoids ${relationship.targetName}'s gaze in the market`,
        `${relationship.targetName} confronts ${npc.name} about old treachery`,
      ],
      details: [
        'Guilt—or its absence—speaks loudly.',
        'Some betrayals can never be undone.',
      ],
    },
    betrayed: {
      summaries: [
        `${npc.name} watches ${relationship.targetName} with cold eyes`,
        `${npc.name} speaks publicly of ${relationship.targetName}'s treachery`,
      ],
      details: [
        'The wound festers still.',
        'Forgiveness is not in their nature.',
      ],
    },
  };

  const drama = DRAMA[relationship.type];
  if (!drama) return null;

  // Contextual weighting: if there is a war or raid nearby, drama intensifies
  const settlement = world.settlements.find(s => s.name === npc.location);
  const isDangerous = settlement && (world.settlementStates?.[settlement.name]?.safety ?? 5) < 0;

  let summary = rng.pick(drama.summaries);
  let details = rng.pick(drama.details);

  if (isDangerous && rng.chance(0.5)) {
    details += ` Amidst the growing danger in ${npc.location}, their ${relationship.type} feels all the more pressing.`;
  }

  return {
    category: 'town',
    summary,
    details,
    location: npc.location,
    actors: [npc.name, relationship.targetName],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  };
}

// Upgrade basic NPC to DeepNPC with full character depth
export function deepenNPC(rng: Random, npc: NPC): DeepNPC {
  const roleToClass: Record<NPCRole, CharacterClass[]> = {
    guard: ['Fighter', 'Dwarf', 'Halfling'],
    priest: ['Cleric', 'Elf'],
    scout: ['Thief', 'Elf', 'Halfling'],
    bard: ['Thief', 'Magic-User'],
    merchant: ['Thief', 'Fighter'],
    laborer: ['Fighter', 'Dwarf'],
  };

  const charClass = rng.pick(roleToClass[npc.role] || ['Fighter']);
  const level = 1 + rng.int(12); // Some high level NPCs for name-level play

  const deepNpc: DeepNPC = {
    ...npc,
    class: charClass,
    level: level,
    xp: 0,
    spells: charClass === 'Magic-User' || charClass === 'Elf' || charClass === 'Cleric' ? [] : undefined,
    depth: generateCharacterDepth(rng, npc.role),
    age: 18 + rng.int(50),
    title: generateTitle(rng, npc.role),
    appearance: generateAppearance(rng),
    secretsKnown: [],
    memories: [],
    agendas: [],
    morale: 0,
    loyalty: rng.chance(0.7) ? `faction-${rng.int(3)}` : undefined, // Assign to a random initial faction
  };

  // Add starting spells for casters
  if (deepNpc.spells) {
    if (charClass === 'Magic-User' || charClass === 'Elf') {
      deepNpc.spells = ['Read Magic', 'Sleep', 'Magic Missile'].slice(0, 1 + rng.int(2));
    } else if (charClass === 'Cleric') {
      deepNpc.spells = ['Cure Light Wounds', 'Protection from Evil'].slice(0, 1 + rng.int(2));
    }
  }

  // Seed agendas based on level/class
  if (deepNpc.level && deepNpc.level >= 9) {
    deepNpc.agendas!.push({
      type: 'stronghold',
      priority: 8,
      progress: rng.int(50),
      description: `Establish a seat of power`,
    });
  }

  if (deepNpc.spells) {
    deepNpc.agendas!.push({
      type: 'research',
      priority: 5,
      progress: rng.int(30),
      description: `Unlock deeper magical secrets`,
    });
  }

  return deepNpc;
}

