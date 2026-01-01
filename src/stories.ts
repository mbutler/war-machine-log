/**
 * EMERGENT STORY THREAD SYSTEM
 * 
 * Story threads are ongoing narratives that emerge from simulation events.
 * They track:
 * - Quest-like objectives that arise naturally
 * - Multi-party conflicts and their progression
 * - Mysteries that unfold over time
 * - Character arcs for NPCs and parties
 * 
 * Unlike scripted quests, these emerge entirely from gameplay and
 * can resolve in multiple ways based on what happens.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Party, NPC, Settlement, Faction } from './types.ts';
import { Antagonist } from './antagonists.ts';
import { queueConsequence } from './consequences.ts';
import { randomName } from './naming.ts';

export type StoryType =
  | 'hunt' // Party pursuing a threat
  | 'feud' // Conflict between parties/factions
  | 'mystery' // Something to uncover
  | 'rescue' // Someone needs saving
  | 'treasure' // Wealth to be claimed
  | 'revenge' // Someone seeking payback
  | 'rise' // Someone's ascent to power/fame
  | 'fall' // Someone's decline
  | 'romance' // Love story
  | 'war' // Large-scale conflict brewing
  | 'plague' // Spreading disaster
  | 'prophecy'; // Foretold events unfolding

export type StoryPhase =
  | 'inciting' // Just begun
  | 'rising' // Building tension
  | 'climax' // Critical moment approaching
  | 'resolution' // Wrapping up
  | 'aftermath'; // Consequences playing out

export interface StoryThread {
  id: string;
  type: StoryType;
  title: string;
  summary: string;
  phase: StoryPhase;
  actors: string[]; // Party/NPC/Faction names involved
  location: string; // Primary setting
  startedAt: Date;
  lastUpdated: Date;
  tension: number; // 0-10, how close to climax
  beats: StoryBeat[]; // Events in this story
  potentialOutcomes: string[]; // Ways this might end
  resolved: boolean;
  resolution?: string;
}

export interface StoryBeat {
  timestamp: Date;
  summary: string;
  tensionChange: number;
}

// Story templates for generating new threads
interface StoryTemplate {
  type: StoryType;
  titles: string[];
  summaries: (actors: string[], location: string) => string[];
  outcomes: string[];
}

const STORY_TEMPLATES: StoryTemplate[] = [
  {
    type: 'hunt',
    titles: ['The Hunt for %ACTOR%', 'Tracking the %ACTOR%', '%ACTOR%\'s Last Stand'],
    summaries: (actors, location) => [
      `${actors[0]} stalks ${actors[1] ?? 'a dangerous quarry'} across the region.`,
      `A deadly game of cat and mouse unfolds near ${location}.`,
    ],
    outcomes: [
      'The quarry is slain.',
      'The quarry escapes to parts unknown.',
      'The hunters become the hunted.',
      'An unexpected alliance forms.',
    ],
  },
  {
    type: 'feud',
    titles: ['Blood Between %ACTOR% and %ACTOR%', 'The %LOCATION% Vendetta', 'Old Grievances'],
    summaries: (actors, location) => [
      `Bad blood between ${actors[0]} and ${actors[1] ?? 'their enemies'} threatens to spill over.`,
      `${location} becomes the stage for an escalating conflict.`,
    ],
    outcomes: [
      'One side is destroyed utterly.',
      'A fragile peace is negotiated.',
      'Both sides are weakened; a third party profits.',
      'The feud spreads, drawing in new participants.',
    ],
  },
  {
    type: 'mystery',
    titles: ['The %LOCATION% Mystery', 'Secrets of %ACTOR%', 'What Lurks Beneath'],
    summaries: (actors, location) => [
      `Strange events in ${location} demand explanation.`,
      `${actors[0]} uncovers clues to something best left buried.`,
    ],
    outcomes: [
      'The truth is revealed—and it\'s worse than imagined.',
      'The mystery remains unsolved; some doors are better left closed.',
      'A hidden conspiracy is exposed.',
      'The investigation claims lives before answers emerge.',
    ],
  },
  {
    type: 'rescue',
    titles: ['The Rescue of %ACTOR%', 'Into the %LOCATION%', 'Against All Odds'],
    summaries: (actors, location) => [
      `${actors[1] ?? 'Someone important'} has been taken. ${actors[0]} must act.`,
      `A desperate mission into ${location} begins.`,
    ],
    outcomes: [
      'The captive is saved, battered but alive.',
      'The rescue comes too late.',
      'The captive is rescued, but at terrible cost.',
      'The captor is defeated; the captive was bait.',
    ],
  },
  {
    type: 'treasure',
    titles: ['The %LOCATION% Hoard', '%ACTOR%\'s Fortune', 'Riches and Ruin'],
    summaries: (actors, location) => [
      `Word of treasure in ${location} draws fortune-seekers.`,
      `${actors[0]} races rivals to claim the prize.`,
    ],
    outcomes: [
      'The treasure is claimed. Wealth flows.',
      'The treasure was cursed. Misfortune follows.',
      'The treasure was a trap. Bodies pile up.',
      'The treasure proves smaller than legend suggested.',
    ],
  },
  {
    type: 'revenge',
    titles: ['%ACTOR%\'s Vengeance', 'Debts Paid in Blood', 'The Reckoning'],
    summaries: (actors, location) => [
      `${actors[0]} has sworn to make ${actors[1] ?? 'someone'} pay.`,
      `An old wrong demands answer. Blood will flow in ${location}.`,
    ],
    outcomes: [
      'Vengeance is achieved. The avenger finds no peace.',
      'The target proves too strong. The avenger falls.',
      'Revenge begets revenge. The cycle continues.',
      'Forgiveness prevails. Both parties find closure.',
    ],
  },
  {
    type: 'rise',
    titles: ['The Rise of %ACTOR%', 'From Nothing to Everything', 'A Star Ascends'],
    summaries: (actors, location) => [
      `${actors[0]} is becoming someone to watch.`,
      `Power and fame gather around a rising figure in ${location}.`,
    ],
    outcomes: [
      'They achieve their ambition and more.',
      'They overreach and crash down.',
      'They attract powerful enemies.',
      'They become what they once despised.',
    ],
  },
  {
    type: 'fall',
    titles: ['The Fall of %ACTOR%', 'How the Mighty Crumble', 'Twilight'],
    summaries: (actors, location) => [
      `${actors[0]}'s power wanes. Vultures circle.`,
      `What was once mighty in ${location} totters on the brink.`,
    ],
    outcomes: [
      'The fall is complete. Nothing remains.',
      'A desperate comeback succeeds.',
      'They fall, but take enemies with them.',
      'They accept their fate with grace.',
    ],
  },
  {
    type: 'war',
    titles: ['The %LOCATION% War', 'Drums of War', 'The Coming Storm'],
    summaries: (actors, location) => [
      `${actors[0]} and ${actors[1] ?? 'their enemies'} mass for conflict.`,
      `War clouds gather over ${location}. The common folk suffer.`,
    ],
    outcomes: [
      'One side achieves total victory.',
      'Stalemate grinds both sides down.',
      'A greater threat forces alliance.',
      'The war spreads beyond control.',
    ],
  },
  {
    type: 'prophecy',
    titles: ['The Foretelling', 'Signs and Portents', 'What Was Written'],
    summaries: (actors, location) => [
      `Ancient prophecy stirs. ${actors[0]} may be the key.`,
      `The seers spoke of ${location}. The time is now.`,
    ],
    outcomes: [
      'The prophecy is fulfilled as foretold.',
      'The prophecy is averted at great cost.',
      'The prophecy was misinterpreted all along.',
      'The prophecy was a lie—or a test.',
    ],
  },
];

// Generate a new story thread from events
export function generateStoryThread(
  rng: Random,
  type: StoryType,
  actors: string[],
  location: string,
  worldTime: Date,
  triggeringSummary: string,
): StoryThread {
  const template = STORY_TEMPLATES.find((t) => t.type === type) ?? STORY_TEMPLATES[0];

  // Generate title
  let title = rng.pick(template.titles);
  // Replace first %ACTOR% with first actor, second with second actor
  title = title.replace('%ACTOR%', actors[0] ?? 'Someone');
  title = title.replace('%ACTOR%', actors[1] ?? actors[0] ?? 'Someone');
  title = title.replace('%LOCATION%', location);

  // Generate summary
  const summaryOptions = template.summaries(actors, location);
  const summary = rng.pick(summaryOptions);

  return {
    id: `story-${Date.now()}-${rng.int(10000)}`,
    type,
    title,
    summary,
    phase: 'inciting',
    actors,
    location,
    startedAt: worldTime,
    lastUpdated: worldTime,
    tension: 1,
    beats: [
      {
        timestamp: worldTime,
        summary: triggeringSummary,
        tensionChange: 1,
      },
    ],
    potentialOutcomes: template.outcomes,
    resolved: false,
  };
}

// Add a beat to an existing story
export function addStoryBeat(
  story: StoryThread,
  summary: string,
  tensionChange: number,
  worldTime: Date,
): void {
  story.beats.push({
    timestamp: worldTime,
    summary,
    tensionChange,
  });
  story.tension = Math.max(0, Math.min(10, story.tension + tensionChange));
  story.lastUpdated = worldTime;

  // Update phase based on tension
  if (story.tension >= 8 && story.phase !== 'climax') {
    story.phase = 'climax';
  } else if (story.tension >= 5 && story.phase === 'inciting') {
    story.phase = 'rising';
  }
}

// Resolve a story
export function resolveStory(
  rng: Random,
  story: StoryThread,
  worldTime: Date,
): string {
  const resolution = rng.pick(story.potentialOutcomes);
  story.resolved = true;
  story.resolution = resolution;
  story.phase = 'aftermath';
  story.lastUpdated = worldTime;

  addStoryBeat(story, `Resolution: ${resolution}`, 0, worldTime);

  return resolution;
}

// Check if events should spawn new stories
export function checkForStorySpawn(
  event: LogEntry,
  world: WorldState,
  rng: Random,
  activeStories: StoryThread[],
): StoryThread | null {
  // Don't spawn too many concurrent stories
  const unresolvedCount = activeStories.filter((s) => !s.resolved).length;
  if (unresolvedCount >= 5) return null;

  const summary = event.summary.toLowerCase();
  const actors = event.actors ?? [];
  const location = event.location ?? 'the region';

  // Analyze event for story potential
  let storyType: StoryType | null = null;
  let storyChance = 0;

  // Combat events
  if (summary.includes('ambush') || summary.includes('clash') || summary.includes('battle')) {
    if (summary.includes('defeat') || summary.includes('driven back')) {
      storyType = 'revenge';
      storyChance = 0.15;
    } else if (actors.length >= 2) {
      storyType = 'feud';
      storyChance = 0.1;
    }
  }

  // Discovery events
  if (summary.includes('discover') || summary.includes('uncover') || summary.includes('find')) {
    if (summary.includes('treasure') || summary.includes('gold') || summary.includes('artifact')) {
      storyType = 'treasure';
      storyChance = 0.2;
    } else {
      storyType = 'mystery';
      storyChance = 0.1;
    }
  }

  // Fame/notoriety events
  if (summary.includes('renown') || summary.includes('famous') || summary.includes('hailed')) {
    storyType = 'rise';
    storyChance = 0.15;
  }

  // Threat events
  if (summary.includes('threat') || summary.includes('danger') || summary.includes('monster')) {
    storyType = 'hunt';
    storyChance = 0.15;
  }

  // Faction events
  if (summary.includes('faction') && (summary.includes('conflict') || summary.includes('tension'))) {
    storyType = 'war';
    storyChance = 0.08;
  }

  // Missing/captive events
  if (summary.includes('missing') || summary.includes('taken') || summary.includes('captive')) {
    storyType = 'rescue';
    storyChance = 0.2;
  }

  if (!storyType || !rng.chance(storyChance)) {
    return null;
  }

  // Check if we already have a similar story
  const existingSimilar = activeStories.find(
    (s) =>
      !s.resolved &&
      s.type === storyType &&
      s.actors.some((a) => actors.includes(a)),
  );

  if (existingSimilar) {
    // Add a beat to existing story instead
    addStoryBeat(existingSimilar, event.summary, 1, event.worldTime);
    return null;
  }

  // Create new story
  return generateStoryThread(
    rng,
    storyType,
    actors.length > 0 ? actors : [randomName(rng)],
    location,
    event.worldTime,
    event.summary,
  );
}

// Generate story progression log
export function storyProgressionLog(
  story: StoryThread,
  worldTime: Date,
  seed: string,
): LogEntry {
  const PHASE_SUMMARIES: Record<StoryPhase, string[]> = {
    inciting: [
      `The tale of "${story.title}" begins`,
      `A new thread weaves into the tapestry: ${story.title}`,
    ],
    rising: [
      `Tension mounts in "${story.title}"`,
      `The story of ${story.title} takes a turn`,
    ],
    climax: [
      `"${story.title}" approaches its climax`,
      `Critical moment looms in ${story.title}`,
    ],
    resolution: [
      `"${story.title}" reaches its conclusion`,
      `The tale of ${story.title} ends`,
    ],
    aftermath: [
      `The echoes of "${story.title}" fade`,
      `Life continues after ${story.title}`,
    ],
  };

  return {
    category: 'faction',
    summary: rng.pick(PHASE_SUMMARIES[story.phase]),
    details: story.summary + (story.resolution ? ` ${story.resolution}` : ''),
    location: story.location,
    actors: story.actors,
    worldTime,
    realTime: new Date(),
    seed,
  };
}

// Helper for templates (global function ref)
function rng(arr: string[]): string {
  return arr[0];
}

// Helper to ensure Date objects (may be strings after JSON round-trip)
function ensureDate(d: Date | string): Date {
  if (d instanceof Date) return d;
  return new Date(d);
}

// Tick active stories - advance or resolve based on time and conditions
export function tickStories(
  rng: Random,
  stories: StoryThread[],
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];

  for (const story of stories) {
    if (story.resolved) continue;

    // Time-based tension increase (handle string dates from JSON)
    const lastUpdated = ensureDate(story.lastUpdated);
    const daysSinceUpdate = (worldTime.getTime() - lastUpdated.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceUpdate >= 1 && rng.chance(0.2)) {
      // Something happens in this story
      const PROGRESSION_BEATS: Record<StoryType, string[]> = {
        hunt: [
          'Tracks are found. The quarry draws near.',
          'A witness points the way.',
          'The hunter\'s patience wears thin.',
        ],
        feud: [
          'Harsh words are exchanged publicly.',
          'An ally is subverted.',
          'Blood is spilled in a back alley.',
        ],
        mystery: [
          'A new clue surfaces.',
          'Someone who knew too much falls silent.',
          'The pattern becomes clearer—and more disturbing.',
        ],
        rescue: [
          'A ransom demand arrives.',
          'A rescue attempt fails.',
          'Hope dwindles with each passing day.',
        ],
        treasure: [
          'A rival expedition sets out.',
          'The map proves partially false.',
          'Greed begins to poison the company.',
        ],
        revenge: [
          'The avenger moves closer.',
          'Old alliances are tested.',
          'The weight of vengeance grows heavier.',
        ],
        rise: [
          'Another triumph adds to the legend.',
          'Enemies begin to take notice.',
          'The price of success becomes apparent.',
        ],
        fall: [
          'Another supporter abandons ship.',
          'Debts come due.',
          'The vultures circle lower.',
        ],
        romance: [
          'A secret meeting is arranged.',
          'Jealousy rears its head.',
          'Families object to the union.',
        ],
        war: [
          'Skirmishes break out along the border.',
          'Diplomatic options narrow.',
          'The drums beat louder.',
        ],
        plague: [
          'The sickness spreads.',
          'A cure is rumored.',
          'Quarantines prove inadequate.',
        ],
        prophecy: [
          'Another sign manifests.',
          'Believers grow in number.',
          'The skeptics fall silent.',
        ],
      };

      const beat = rng.pick(PROGRESSION_BEATS[story.type] ?? PROGRESSION_BEATS.mystery);
      addStoryBeat(story, beat, 1, worldTime);

      logs.push({
        category: 'faction',
        summary: `${story.title}: ${beat}`,
        details: story.summary,
        location: story.location,
        actors: story.actors,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }

    // Check for resolution
    if (story.tension >= 10 || (story.phase === 'climax' && rng.chance(0.15))) {
      const resolution = resolveStory(rng, story, worldTime);
      logs.push({
        category: 'faction',
        summary: `${story.title} concludes`,
        details: resolution,
        location: story.location,
        actors: story.actors,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      // Consequences of resolution
      queueConsequence({
        type: 'settlement-change',
        triggerEvent: `${story.title} resolution`,
        turnsUntilResolution: 6,
        data: {
          settlementName: story.location,
          change: 'mood-shift',
          magnitude: resolution.includes('success') || resolution.includes('achieved') ? 1 : -1,
        },
        priority: 2,
      });
    }
  }

  return logs;
}

