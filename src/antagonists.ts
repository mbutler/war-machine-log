/**
 * ANTAGONIST SYSTEM
 * 
 * Named villains, memorable foes, and recurring threats that create
 * persistent story arcs. Unlike generic encounter fodder, antagonists:
 * - Have names, motivations, and personalities
 * - Remember their defeats and plan revenge
 * - Grow stronger or weaker based on events
 * - Create ongoing story threads
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Terrain, HexCoord, LogCategory } from './types.ts';
import { randomName } from './naming.ts';
import { queueConsequence } from './consequences.ts';

export type AntagonistType =
  | 'bandit-chief'
  | 'orc-warlord'
  | 'dark-wizard'
  | 'vampire'
  | 'dragon'
  | 'cult-leader'
  | 'corrupt-noble'
  | 'renegade-knight'
  | 'beast-lord'
  | 'necromancer'
  | 'fey-lord'
  | 'demon-bound'
  // Naval antagonists
  | 'pirate-captain'
  | 'sea-raider'
  | 'kraken-cult'
  | 'ghost-ship'
  | 'sea-witch';

export interface Antagonist {
  id: string;
  name: string;
  epithet: string; // "the Cruel", "Bonecruncher", etc.
  type: AntagonistType;
  threat: number; // 1-10, how dangerous
  territory: string; // Settlement or region name
  lair?: string; // Specific location
  motivation: string;
  notoriety: number; // How well-known; affects rumors
  defeats: number; // Times defeated but escaped
  victories: number; // Times they've won
  lastSeen?: Date;
  nemeses: string[]; // Party/NPC ids who have history with this antagonist
  followers: number; // Minion count
  treasure: number; // Accumulated wealth (quest reward factor)
  alive: boolean;
  traits: string[];
  weaknesses: string[];
}

// Epithets by antagonist type
const EPITHETS: Record<AntagonistType, string[]> = {
  'bandit-chief': ['the Red', 'Blackhand', 'the Grinning', 'Scar', 'Goldtooth', 'the Wolf'],
  'orc-warlord': ['Bonecruncher', 'the Brutal', 'Skullsplitter', 'Bloodaxe', 'the Destroyer'],
  'dark-wizard': ['the Pallid', 'of the Black Tower', 'the Whisperer', 'Shadowbane', 'the Unbound'],
  'vampire': ['the Immortal', 'of the Crimson Kiss', 'Nightwalker', 'the Thirsty', 'the Ancient'],
  'dragon': ['the Magnificent', 'Flamescale', 'the Terror', 'Goldhoarth', 'the Sleeping Death'],
  'cult-leader': ['the Prophet', 'the Enlightened', 'Voice of the Deep', 'the Chosen', 'the Reborn'],
  'corrupt-noble': ['the Grasping', 'Silvertongue', 'the Ambitious', 'of the Iron Purse', 'the Betrayer'],
  'renegade-knight': ['the Fallen', 'Oathbreaker', 'the Dishonored', 'Black Shield', 'the Condemned'],
  'beast-lord': ['of the Wild', 'the Untamed', 'Packmaster', 'the Feral', 'Beastcaller'],
  'necromancer': ['the Pale', 'Gravebinder', 'of the Charnel House', 'the Deathless', 'Bonewarden'],
  'fey-lord': ['the Mercurial', 'of the Twilight Court', 'the Enchanter', 'Dreamweaver', 'the Fair Folk\'s Champion'],
  'demon-bound': ['the Damned', 'Hellsworn', 'of the Burning Pact', 'the Tormented', 'Soultrader'],
  // Naval antagonists
  'pirate-captain': ['Blacksail', 'the Scourge', 'of the Crimson Tide', 'Stormchaser', 'the Corsair King', 'Deadwater'],
  'sea-raider': ['the Reaver', 'Wavebreaker', 'of the Northern Fleet', 'Ironprow', 'the Sea Wolf', 'Saltblood'],
  'kraken-cult': ['Voice of the Deep', 'the Tentacled One', 'Deepcaller', 'the Drowned Prophet', 'Ink-Touched'],
  'ghost-ship': ['the Eternal', 'of the Phantom Fleet', 'Never-Sinking', 'the Damned Voyage', 'Deathwatch'],
  'sea-witch': ['of the Sunken Isle', 'Storm-Sister', 'the Tide-Turner', 'Saltweaver', 'the Siren\'s Bane'],
};

const MOTIVATIONS: Record<AntagonistType, string[]> = {
  'bandit-chief': [
    'Wealth stolen from the rich and kept from the poor',
    'Revenge on the authorities who wronged them',
    'Building an empire of outlaws',
    'Survival in a cruel world',
  ],
  'orc-warlord': [
    'Glory in battle and dominion over the weak',
    'Uniting the tribes under one banner',
    'Driving the softskins from ancestral lands',
    'Pleasing the dark gods with slaughter',
  ],
  // Naval antagonists
  'pirate-captain': [
    'Plunder enough gold to retire as a king',
    'Vengeance on the navy that betrayed them',
    'Building a pirate republic free from all law',
    'Finding the legendary treasure of a lost fleet',
  ],
  'sea-raider': [
    'Glory and plunder in the old ways',
    'Claiming coastal lands for their people',
    'Sacrifices to appease the sea gods',
    'Testing their strength against softened southerners',
  ],
  'kraken-cult': [
    'Awakening the great beast from the deep',
    'Drowning the surface world in endless waves',
    'Gaining the favor of things that should not be',
    'Preparing the way for the masters below',
  ],
  'ghost-ship': [
    'Breaking the curse that binds the crew',
    'Collecting souls to replace the damned',
    'Eternal hunting of those who wronged them in life',
    'Completing the voyage they were denied',
  ],
  'sea-witch': [
    'Dominion over all who sail',
    'Revenge on the sailors who wronged them',
    'Gathering power from drowned souls',
    'Summoning leviathans to do their bidding',
  ],
  'dark-wizard': [
    'Forbidden knowledge at any cost',
    'Power over life and death',
    'Revenge on the academy that expelled them',
    'Ascending to godhood',
  ],
  'vampire': [
    'Building a dynasty of the undead',
    'Reclaiming lost nobility',
    'An endless feast of blood',
    'Finding a cure—or spreading the curse',
  ],
  'dragon': [
    'Accumulating a hoard beyond measure',
    'Ruling as a god over lesser beings',
    'Ancient grudges against humanity',
    'Simple, terrible hunger',
  ],
  'cult-leader': [
    'Awakening a slumbering deity',
    'Preparing the world for transformation',
    'Gathering power through faithful',
    'Fleeing a doom only they can see',
  ],
  'corrupt-noble': [
    'Absolute power over the region',
    'Wealth beyond counting',
    'Destroying rival houses',
    'Ascending to royalty',
  ],
  'renegade-knight': [
    'Vengeance on those who betrayed their honor',
    'Proving that might makes right',
    'Carving out a domain by the sword',
    'Finding redemption through blood',
  ],
  'beast-lord': [
    'Driving civilization from the wild places',
    'Protecting the beasts from hunters',
    'Ruling a kingdom of fang and claw',
    'Becoming one with the primal spirits',
  ],
  'necromancer': [
    'Conquering death itself',
    'Raising an army that never tires',
    'Speaking with those long dead',
    'Punishing the living for ancient wrongs',
  ],
  'fey-lord': [
    'Reclaiming lands stolen by mortals',
    'Playing games with human lives',
    'Fulfilling ancient bargains',
    'Escaping the ennui of eternity',
  ],
  'demon-bound': [
    'Fulfilling a hellish contract',
    'Spreading corruption to delay their damnation',
    'Breaking free of infernal bonds',
    'Serving dark masters for promised power',
  ],
};

const TRAITS: Record<AntagonistType, string[]> = {
  'bandit-chief': ['cunning tactician', 'inspires fierce loyalty', 'knows every back road', 'never fights fair'],
  'orc-warlord': ['brutally strong', 'surprisingly clever', 'leads from the front', 'respects worthy foes'],
  'dark-wizard': ['commands fell magic', 'always prepared', 'paranoid and secretive', 'speaks in riddles'],
  'vampire': ['supernaturally charming', 'centuries of experience', 'patient as the grave', 'rage beneath the calm'],
  'dragon': ['ancient and wise', 'pride is their weakness', 'treasure-obsessed', 'respects courage'],
  'cult-leader': ['magnetic personality', 'truly believes', 'sees omens everywhere', 'protects the inner circle'],
  'corrupt-noble': ['politically connected', 'buys loyalty', 'never gets hands dirty', 'underestimates commoners'],
  'renegade-knight': ['master combatant', 'broken honor haunts them', 'attracts other outcasts', 'seeks death in battle'],
  'beast-lord': ['fights with animal fury', 'commands beasts', 'hates civilization', 'respects natural law'],
  'necromancer': ['surrounded by undead', 'fears true death', 'hoards knowledge', 'once was idealistic'],
  'fey-lord': ['bound by their word', 'capricious moods', 'allergic to iron', 'cannot lie outright'],
  'demon-bound': ['hellfire at their call', 'desperate and dangerous', 'seeks victims constantly', 'bound by the contract'],
  // Naval antagonists
  'pirate-captain': ['knows every cove', 'crew would die for them', 'master sailor', 'surprisingly honorable to their code'],
  'sea-raider': ['born on the waves', 'berserker fury', 'strike fast and vanish', 'worship the old sea gods'],
  'kraken-cult': ['speak with sea creatures', 'breathe underwater', 'inhuman patience', 'madness grants insight'],
  'ghost-ship': ['cannot truly die', 'passes through storms', 'crew feels no pain', 'draws other lost ships'],
  'sea-witch': ['commands weather', 'knows drowned secrets', 'binds sailors to service', 'ageless and bitter'],
};

const WEAKNESSES: Record<AntagonistType, string[]> = {
  'bandit-chief': ['gold can buy their followers', 'enemies among their own', 'wanted by law'],
  'orc-warlord': ['tribal rivalries', 'superstitious', 'can be challenged to single combat'],
  'dark-wizard': ['spells require preparation', 'physical frailty', 'obsessive over research'],
  'vampire': ['sunlight', 'running water', 'holy symbols', 'must be invited in'],
  'dragon': ['vulnerable underbelly', 'pride can be manipulated', 'long slumber cycles'],
  'cult-leader': ['the prophecy has flaws', 'rival cults', 'depends on followers\' faith'],
  'corrupt-noble': ['paper trail of crimes', 'enemies at court', 'cowardly in person'],
  'renegade-knight': ['old comrades', 'sense of honor still lingers', 'death wish'],
  'beast-lord': ['cannot enter settlements', 'beasts can be calmed or frightened', 'isolated'],
  'necromancer': ['destroy the phylactery', 'consecrated ground', 'the dead sometimes rebel'],
  'fey-lord': ['cold iron', 'broken promises', 'cannot enter uninvited'],
  'demon-bound': ['holy water', 'true names', 'the contract has loopholes'],
  // Naval antagonists
  'pirate-captain': ['letters of marque can sway them', 'crew loyalty has limits', 'trapped on land', 'old rivals among pirates'],
  'sea-raider': ['ice in their homeland', 'gods demand costly sacrifices', 'divided clans', 'vulnerable on land'],
  'kraken-cult': ['the beast demands feeding', 'other cults oppose them', 'surface dwellers are needed', 'symbols of the sun god'],
  'ghost-ship': ['the original log tells their doom', 'holy ground blocks them', 'bound to certain waters', 'can be put to rest'],
  'sea-witch': ['must touch seawater daily', 'iron shackles', 'old lovers remember the truth', 'the drowned can rebel'],
};

// Generate a new antagonist
export function generateAntagonist(
  rng: Random,
  type: AntagonistType,
  territory: string,
  threat: number = 3 + rng.int(5),
): Antagonist {
  const name = randomName(rng);
  const epithet = rng.pick(EPITHETS[type]);

  const allTraits = TRAITS[type];
  const pickedTraits: string[] = [];
  for (let i = 0; i < 2 && allTraits.length > 0; i++) {
    const t = rng.pick(allTraits);
    if (!pickedTraits.includes(t)) pickedTraits.push(t);
  }

  const allWeaknesses = WEAKNESSES[type];
  const pickedWeaknesses: string[] = [];
  for (let i = 0; i < 2 && allWeaknesses.length > 0; i++) {
    const w = rng.pick(allWeaknesses);
    if (!pickedWeaknesses.includes(w)) pickedWeaknesses.push(w);
  }

  return {
    id: `antagonist-${Date.now()}-${rng.int(10000)}`,
    name,
    epithet,
    type,
    threat,
    territory,
    motivation: rng.pick(MOTIVATIONS[type]),
    notoriety: 1 + rng.int(3),
    defeats: 0,
    victories: 0,
    nemeses: [],
    followers: 5 + rng.int(threat * 10),
    treasure: 100 * threat + rng.int(500),
    alive: true,
    traits: pickedTraits,
    weaknesses: pickedWeaknesses,
  };
}

// Antagonist introduction - when they first become known
export function introduceAntagonist(
  antagonist: Antagonist,
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];

  const INTRO_TEMPLATES = [
    `A new threat arises: ${antagonist.name} ${antagonist.epithet}`,
    `${antagonist.name} ${antagonist.epithet} makes their presence known`,
    `Word spreads of ${antagonist.name} ${antagonist.epithet}`,
    `The shadow of ${antagonist.name} ${antagonist.epithet} falls over the region`,
  ];

  const TYPE_DESCRIPTIONS: Record<AntagonistType, string[]> = {
    'bandit-chief': [
      `A ruthless outlaw who commands a growing band of cutthroats.`,
      `Their gang has been preying on travelers and caravans.`,
    ],
    'orc-warlord': [
      `The tribes rally to a new war-chief. Raids have intensified.`,
      `Orc banners have been seen where they were not seen before.`,
    ],
    'dark-wizard': [
      `Strange lights and stranger disappearances mark their domain.`,
      `Wizards whisper of forbidden arts practiced in secret.`,
    ],
    'vampire': [
      `The pale sickness spreads. Livestock found drained.`,
      `An old castle has new occupants who shun the day.`,
    ],
    'dragon': [
      `Fire in the hills. Flocks decimated overnight.`,
      `The old stories speak of such terrors. Now they live again.`,
    ],
    'cult-leader': [
      `A new faith spreads among the desperate and dispossessed.`,
      `Rituals in the night. Converts who speak in tongues.`,
    ],
    'corrupt-noble': [
      `Taxes rise. Justice is bought and sold. The law protects only the wealthy.`,
      `Those who speak against them disappear. Those who comply grow poor.`,
    ],
    'renegade-knight': [
      `A warrior who abandoned oaths now carves a bloody path.`,
      `Former comrades weep for what they must hunt.`,
    ],
    'beast-lord': [
      `The forests grow dangerous. Animals attack without provocation.`,
      `Hunters become the hunted. Something commands the wild things.`,
    ],
    'necromancer': [
      `Graves disturbed. The dead walk. Children have nightmares.`,
      `Old tombs have been opened. What was taken? What was released?`,
    ],
    'fey-lord': [
      `Time runs strange near the old stones. Travelers vanish for years.`,
      `The Fair Folk hold court in the twilight, and mortals are their toys.`,
    ],
    'demon-bound': [
      `Sulfur and screaming in the night. Bargains offered at crossroads.`,
      `Someone has made a pact. The price will be paid by many.`,
    ],
  };

  logs.push({
    category: 'faction',
    summary: rng.pick(INTRO_TEMPLATES),
    details: rng.pick(TYPE_DESCRIPTIONS[antagonist.type]),
    location: antagonist.territory,
    actors: [`${antagonist.name} ${antagonist.epithet}`],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  });

  // Spawn rumors about the new threat
  queueConsequence({
    type: 'spawn-rumor',
    triggerEvent: `${antagonist.name} appearance`,
    turnsUntilResolution: 1 + rng.int(6),
    data: {
      origin: antagonist.territory,
      target: antagonist.territory,
      kind: 'threat',
      text: `Travelers speak of ${antagonist.name} ${antagonist.epithet}. ${antagonist.motivation}.`,
    },
    priority: 4,
  });

  return logs;
}

// Antagonist action - they do something in the world
export function antagonistAct(
  antagonist: Antagonist,
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  if (!antagonist.alive) return logs;

  // Action depends on type and notoriety
  const ACTIONS: Record<AntagonistType, { summary: string; details: string }[]> = {
    'bandit-chief': [
      { summary: `${antagonist.name}'s gang raids a caravan`, details: 'Goods seized, drivers left bound on the road.' },
      { summary: `${antagonist.name} expands their territory`, details: 'New hideouts established. More recruits join.' },
      { summary: `${antagonist.name} offers "protection"`, details: 'Villages face a choice: pay tribute or burn.' },
    ],
    'orc-warlord': [
      { summary: `${antagonist.name}'s horde raids the frontier`, details: 'Farms burned. Captives taken.' },
      { summary: `${antagonist.name} demands tribute`, details: 'Submit or be destroyed, the messengers say.' },
      { summary: `${antagonist.name} defeats a rival chief`, details: 'The horde grows stronger. Warbands unite.' },
    ],
    'dark-wizard': [
      { summary: `${antagonist.name} conducts a dark ritual`, details: 'Strange lights in the sky. Animals flee.' },
      { summary: `Agents of ${antagonist.name} gather components`, details: 'Graverobbing. Herb theft. Missing children.' },
      { summary: `${antagonist.name} curses a village`, details: 'Crops wither. Wells run foul. Prayers go unanswered.' },
    ],
    'vampire': [
      { summary: `${antagonist.name} claims another victim`, details: 'Pale. Drained. The marks are unmistakable.' },
      { summary: `${antagonist.name} turns a new thrall`, details: 'Another joins the undying court.' },
      { summary: `${antagonist.name} hosts a midnight ball`, details: 'Nobles attend. Some do not return.' },
    ],
    'dragon': [
      { summary: `${antagonist.name} demands tribute`, details: 'Gold and livestock, or the village burns.' },
      { summary: `${antagonist.name} is seen on the wing`, details: 'Terror grips all who witness the passage.' },
      { summary: `${antagonist.name} destroys a settlement`, details: 'Fire and ruin. Few survivors.' },
    ],
    'cult-leader': [
      { summary: `${antagonist.name} gains new followers`, details: 'The desperate find purpose. The faithful grow.' },
      { summary: `${antagonist.name} performs a public miracle`, details: 'Believers multiply. Skeptics are troubled.' },
      { summary: `${antagonist.name} declares a prophecy`, details: 'The end times approach. Only the faithful will be saved.' },
    ],
    'corrupt-noble': [
      { summary: `${antagonist.name} seizes more land`, details: 'Legal pretexts, backed by armed men.' },
      { summary: `${antagonist.name} silences a critic`, details: 'An accident. Everyone knows. No one speaks.' },
      { summary: `${antagonist.name} hosts a lavish feast`, details: 'While the common folk starve, nobles toast.' },
    ],
    'renegade-knight': [
      { summary: `${antagonist.name} challenges a champion`, details: 'Another body. Another notch on a bloodied blade.' },
      { summary: `${antagonist.name} takes a keep by force`, details: 'No quarter given. No surrender accepted.' },
      { summary: `${antagonist.name} recruits dispossessed knights`, details: 'A fellowship of the fallen forms.' },
    ],
    'beast-lord': [
      { summary: `${antagonist.name}'s beasts attack travelers`, details: 'Wolves. Bears. Worse. They hunt together.' },
      { summary: `${antagonist.name} drives settlers from the forest`, details: 'Homesteads abandoned. The wild reclaims.' },
      { summary: `${antagonist.name} corrupts tame animals`, details: 'Dogs turn on masters. Horses bolt into the wild.' },
    ],
    'necromancer': [
      { summary: `${antagonist.name} raises the dead`, details: 'A cemetery stands empty. Its occupants walk.' },
      { summary: `${antagonist.name} binds a powerful spirit`, details: 'The hauntings begin. None can rest.' },
      { summary: `${antagonist.name} seeks ancient tombs`, details: 'Old graves are opened. Old evils released.' },
    ],
    'fey-lord': [
      { summary: `${antagonist.name} steals a child`, details: 'A changeling left in the cradle.' },
      { summary: `${antagonist.name} enchants a grove`, details: 'Those who enter forget the way out.' },
      { summary: `${antagonist.name} makes a bargain`, details: 'A mortal gets their wish. The price comes due.' },
    ],
    'demon-bound': [
      { summary: `${antagonist.name} offers dark bargains`, details: 'Desperate souls sign away more than they know.' },
      { summary: `${antagonist.name} spreads corruption`, details: 'Madness. Violence. The taint spreads.' },
      { summary: `${antagonist.name} summons a lesser demon`, details: 'The pact demands servants. Servants are provided.' },
    ],
  };

  const action = rng.pick(ACTIONS[antagonist.type]);
  
  // Increase notoriety
  antagonist.notoriety = Math.min(10, antagonist.notoriety + 1);
  antagonist.lastSeen = worldTime;
  antagonist.followers = (antagonist.followers ?? 0) + rng.int(3);
  antagonist.treasure = (antagonist.treasure ?? 0) + rng.int(10);
  
  // Log the action
  logs.push({
    category: 'faction',
    summary: action.summary,
    details: action.details,
    location: antagonist.territory,
    actors: [`${antagonist.name} ${antagonist.epithet}`],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  });

  // === DEEP CAUSALITY: Antagonist actions have real world effects ===
  
  // Settlement suffers from antagonist presence
  const settlement = world.settlements.find(s => s.name === antagonist.territory);
  if (settlement) {
    // Direct mood impact
    settlement.mood = Math.max(-5, settlement.mood - 1);
    
    // Supply theft/destruction for certain types
    if (['bandit-chief', 'orc-warlord', 'dragon'].includes(antagonist.type) && rng.chance(0.5)) {
      const goods = Object.keys(settlement.supply) as (keyof typeof settlement.supply)[];
      const targetGood = rng.pick(goods);
      const stolen = Math.min(settlement.supply[targetGood], 2 + rng.int(5));
      settlement.supply[targetGood] -= stolen;
      
      if (stolen > 0) {
        logs.push({
          category: 'town',
          summary: `${antagonist.territory} suffers losses`,
          details: `${antagonist.name}'s depredations cost the settlement dearly. Supplies dwindle.`,
          location: antagonist.territory,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }
  
  // Cult leaders convert NPCs
  if (antagonist.type === 'cult-leader' && rng.chance(0.3)) {
    const npcsHere = world.npcs.filter(n => n.location === antagonist.territory && n.alive !== false);
    if (npcsHere.length > 0) {
      const convert = rng.pick(npcsHere);
      convert.reputation = Math.max(-3, convert.reputation - 1);
      
      logs.push({
        category: 'town',
        summary: `${convert.name} falls under ${antagonist.name}'s influence`,
        details: `The ${convert.role}'s eyes hold a new fervor. They speak of the prophet's wisdom.`,
        location: antagonist.territory,
        actors: [convert.name, antagonist.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  // Vampires kill NPCs
  if (antagonist.type === 'vampire' && rng.chance(0.2)) {
    const npcsHere = world.npcs.filter(n => n.location === antagonist.territory && n.alive !== false);
    if (npcsHere.length > 0) {
      const victim = rng.pick(npcsHere);
      victim.alive = false;
      
      logs.push({
        category: 'town',
        summary: `${victim.name} found dead in ${antagonist.territory}`,
        details: `Pale. Drained. The marks of ${antagonist.name}'s feeding are unmistakable.`,
        location: antagonist.territory,
        actors: [victim.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      
      // Queue NPC reactions
      queueConsequence({
        type: 'settlement-change',
        triggerEvent: `${victim.name}'s death`,
        turnsUntilResolution: 1,
        data: {
          settlementName: antagonist.territory,
          change: 'mood-shift',
          magnitude: -2,
        },
        priority: 3,
      });
    }
  }
  
  // Dragons destroy resources
  if (antagonist.type === 'dragon' && rng.chance(0.2)) {
    if (settlement) {
      const goods = Object.keys(settlement.supply) as (keyof typeof settlement.supply)[];
      for (const good of goods) {
        settlement.supply[good] = Math.max(0, settlement.supply[good] - rng.int(3));
      }
      settlement.mood = Math.max(-5, settlement.mood - 2);
      
      logs.push({
        category: 'town',
        summary: `${antagonist.name} burns ${antagonist.territory}`,
        details: `Fire rains from above. The settlement counts its dead and mourns its losses.`,
        location: antagonist.territory,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }

  // General consequences
  if (rng.chance(0.3)) {
    queueConsequence({
      type: 'settlement-change',
      triggerEvent: action.summary,
      turnsUntilResolution: 2,
      data: {
        settlementName: antagonist.territory,
        change: 'mood-shift',
        magnitude: -1,
      },
      priority: 2,
    });
  }
  
  // Spawn rumors about antagonist activity
  if (antagonist.notoriety >= 3 && rng.chance(0.4)) {
    for (const s of world.settlements) {
      if (s.name !== antagonist.territory && rng.chance(0.3)) {
        queueConsequence({
          type: 'spawn-rumor',
          triggerEvent: action.summary,
          turnsUntilResolution: 3 + rng.int(6),
          data: {
            origin: s.name,
            target: antagonist.territory,
            kind: 'monster-sign',
            text: `Travelers speak of ${antagonist.name} ${antagonist.epithet}. The roads grow dangerous.`,
          },
          priority: 3,
        });
      }
    }
  }

  return logs;
}

// Seed initial antagonists for the world
export function seedAntagonists(rng: Random, world: WorldState): Antagonist[] {
  const antagonists: Antagonist[] = [];

  // Start with 1-3 antagonists
  const count = 1 + rng.int(3);
  const types: AntagonistType[] = [
    'bandit-chief', 'bandit-chief', // More common
    'orc-warlord',
    'dark-wizard',
    'cult-leader',
    'corrupt-noble',
    'beast-lord',
    'necromancer',
  ];

  for (let i = 0; i < count; i++) {
    const type = rng.pick(types);
    const territory = rng.pick(world.settlements).name;
    const threat = 2 + rng.int(4); // Start at lower threat
    antagonists.push(generateAntagonist(rng, type, territory, threat));
  }

  return antagonists;
}


