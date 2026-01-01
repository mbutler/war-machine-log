/**
 * PROSE ENGINE - Rich narrative generation for emergent storytelling
 * 
 * This module generates varied, atmospheric prose for all game events.
 * Instead of repetitive templates, we use procedural combination of:
 * - Sensory details (sights, sounds, smells)
 * - Character reactions and emotions
 * - Environmental context (weather, time of day, season)
 * - Narrative callbacks to past events
 */

import { Random } from './rng.ts';
import { Terrain, Settlement, Party, NPC, WorldState, LogCategory } from './types.ts';

// Time of day flavor
export function getTimeOfDayPhase(hour: number): 'dawn' | 'morning' | 'midday' | 'afternoon' | 'dusk' | 'evening' | 'night' | 'deep-night' {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'dusk';
  if (hour >= 20 && hour < 23) return 'evening';
  if (hour >= 23 || hour < 2) return 'night';
  return 'deep-night';
}

const TIME_DESCRIPTORS: Record<ReturnType<typeof getTimeOfDayPhase>, readonly string[]> = {
  dawn: [
    'as rose light crept across the land',
    'with the first cock-crow',
    'as mist still clung to low places',
    'while dew pearled on grass and stone',
    'as the world stirred from slumber',
  ],
  morning: [
    'under a brightening sky',
    'as folk went about their labors',
    'with the sun climbing steadily',
    'amid the bustle of morning trade',
    'as smoke rose from breakfast fires',
  ],
  midday: [
    'under the high sun',
    'as shadows pooled beneath eaves',
    'in the drowsy heat of noon',
    'while sensible folk sought shade',
    'as the bell tolled the sixth hour',
  ],
  afternoon: [
    'as the day wore on',
    'with lengthening shadows',
    'in the golden afternoon light',
    'as travelers grew road-weary',
    'while the sun began its descent',
  ],
  dusk: [
    'as purple shadows gathered',
    'with the setting of the sun',
    'as lanterns were kindled',
    'in the gloaming hour',
    'as bats took wing',
  ],
  evening: [
    'by candlelight and hearth-glow',
    'as the stars emerged one by one',
    'with ale flowing in taprooms',
    'as songs rose from dim taverns',
    'under an indigo sky',
  ],
  night: [
    'under a canopy of stars',
    'as owls hunted in darkness',
    'with only moonlight for company',
    'in the hush of late night',
    'while decent folk lay sleeping',
  ],
  'deep-night': [
    'in the witching hour',
    'as even the taverns fell silent',
    'when shadows grew deepest',
    'in the cold hours before dawn',
    'as the world held its breath',
  ],
};

// Terrain-specific atmospheric details
const TERRAIN_ATMOSPHERE: Record<Terrain, { sights: string[]; sounds: string[]; smells: string[]; hazards: string[] }> = {
  road: {
    sights: [
      'wagon ruts worn deep into the earth',
      'a milestone marking leagues to the capital',
      'a wayside shrine with fresh offerings',
      'dust rising from distant hooves',
      "a peddler's cart overturned by the verge",
    ],
    sounds: [
      'the creak of wagon wheels',
      'distant hoofbeats',
      "a tinker's bell",
      'the song of road-weary pilgrims',
      'ravens arguing over carrion',
    ],
    smells: [
      'road dust and horse sweat',
      'wildflowers along the verge',
      'smoke from a roadside camp',
      'the tang of iron from a smithy',
    ],
    hazards: [
      'a suspicious band loitering at the crossroads',
      'signs of recent violence: bloodstains, abandoned goods',
      'a broken bridge forcing a detour',
    ],
  },
  clear: {
    sights: [
      'golden wheat swaying in the breeze',
      'a shepherd minding distant flocks',
      'ancient standing stones on a hilltop',
      'a lone oak spreading its branches wide',
      'farmsteads dotting the gentle hills',
    ],
    sounds: [
      'skylarks singing overhead',
      'the rustle of tall grass',
      'cattle lowing in distant fields',
      'wind sighing through grain',
    ],
    smells: [
      'fresh-turned earth',
      'hay and clover',
      'the sweetness of ripening apples',
      'wood smoke from a cottage chimney',
    ],
    hazards: [
      'tracks of some large beast in the soft earth',
      'a burned farmstead, still smoldering',
      'circling crows marking something dead',
    ],
  },
  forest: {
    sights: [
      'ancient oaks draped in moss',
      'shafts of light piercing the canopy',
      'a clearing where standing stones lurked',
      'fungus growing in strange patterns',
      'a ruined tower choked by vines',
    ],
    sounds: [
      'branches creaking overhead',
      'unseen things rustling in undergrowth',
      'the tap of a woodpecker',
      'an eerie silence where birdsong ceased',
      'distant howling at dusk',
    ],
    smells: [
      'leaf mold and decay',
      'pine resin sharp and clean',
      'the musk of some passing beast',
      'rotting wood and toadstools',
    ],
    hazards: [
      'webs strung between trees, too large for ordinary spiders',
      'claw marks on bark, head-height or higher',
      'bones scattered near a dark hollow',
    ],
  },
  hills: {
    sights: [
      'cairns marking ancient graves',
      'the mouth of a cave, dark and inviting',
      'a ruined watchtower on the heights',
      'goats picking their way along cliffs',
      'mist pooling in the valleys below',
    ],
    sounds: [
      'wind keening through rocky passes',
      'the clatter of loose stones',
      'a distant rockslide',
      'the scream of a hunting hawk',
    ],
    smells: [
      'heather and wild thyme',
      'mineral tang from exposed rock',
      'the cold scent of coming rain',
    ],
    hazards: [
      'a rope bridge in poor repair',
      'fresh rockfall blocking the path',
      'smoke rising from caves—someone, or something, dwells within',
    ],
  },
  mountains: {
    sights: [
      'snow-capped peaks gleaming in sunlight',
      'a glacier grinding slowly downward',
      'the ruins of a dwarven gatehouse',
      'a frozen waterfall',
      'vast chasms with no visible bottom',
    ],
    sounds: [
      'the groan of shifting ice',
      'thunder echoing between peaks',
      'the shriek of mountain winds',
      'ominous silence after an avalanche',
    ],
    smells: [
      'thin cold air',
      'sulfur from hot springs',
      'the iron tang of altitude',
    ],
    hazards: [
      'unstable ice over deep crevasses',
      'giant footprints in the snow',
      'a cave mouth breathing warm, fetid air',
    ],
  },
  swamp: {
    sights: [
      'will-o-wisps dancing over dark water',
      'a drowned village, rooftops jutting above the murk',
      'twisted trees rising from fog',
      'bubbles rising from the deep',
      'a heron standing motionless, watching',
    ],
    sounds: [
      'the croak of countless frogs',
      'something heavy sliding into water',
      'the buzz of biting flies',
      'sucking mud reluctant to release boots',
    ],
    smells: [
      'rot and stagnant water',
      'the sweetness of decay',
      'methane rising from the depths',
    ],
    hazards: [
      'quicksand lurking beneath innocent-looking moss',
      'humanoid tracks leading into the mire—none returning',
      'a half-sunken boat, owner unknown',
    ],
  },
  desert: {
    sights: [
      'bleached bones half-buried in sand',
      'mirages shimmering on the horizon',
      'a ruined city of sandstone pillars',
      'an oasis ringed with palms',
      'vultures circling lazily overhead',
    ],
    sounds: [
      'the hiss of sand in the wind',
      'the scuttle of scorpions',
      'thunder of a distant sandstorm',
      'the cry of a desert hawk',
    ],
    smells: [
      'dry heat and dust',
      'the rare sweetness of date palms',
      'the musk of passing camels',
    ],
    hazards: [
      'signs of a sandstorm on the horizon',
      'a dried corpse clutching an empty waterskin',
      'strange geometric carvings in exposed bedrock',
    ],
  },
};

// Settlement atmosphere by type
const SETTLEMENT_VIBES: Record<Settlement['type'], { bustle: string[]; tension: string[]; peace: string[] }> = {
  village: {
    bustle: [
      'chickens scattered before approaching travelers',
      "the blacksmith's hammer rang out steadily",
      'children chased each other through muddy lanes',
      'farmers argued over the price of grain',
    ],
    tension: [
      'doors were barred and shutters drawn',
      'watchmen eyed strangers with open suspicion',
      'whispered conversations fell silent at approach',
      'a gibbet creaked in the village square',
    ],
    peace: [
      'old men dozed on benches in the sun',
      'the smell of baking bread drifted from open doors',
      'a wedding party spilled laughing from the chapel',
      "children gathered to hear a pedlar's tales",
    ],
  },
  town: {
    bustle: [
      'merchants hawked wares in crowded market squares',
      'guild banners snapped in the breeze',
      "a crier announced the day's proclamations",
      'the town watch marched in ordered formation',
    ],
    tension: [
      'tavern brawls spilled into the streets',
      'tax collectors moved under armed guard',
      'gallows stood freshly constructed in the square',
      'rumors of plague set folk on edge',
    ],
    peace: [
      'fountain water sparkled in the afternoon sun',
      "minstrels played in the garden of the Merchant's Guild",
      'the cathedral bells marked the peaceful hours',
      'street performers drew laughing crowds',
    ],
  },
  city: {
    bustle: [
      'the roar of ten thousand souls going about their business',
      'carriages rattled over cobblestones',
      'exotic spices scented the market district',
      'foreign tongues mingled in the harbor quarter',
    ],
    tension: [
      'the city watch patrolled in force after dark',
      "a noble's retinue swept commoners from the path",
      "the executioner's block saw fresh use",
      'plague doctors stalked the poorer quarters',
    ],
    peace: [
      'great temples rose in marble splendor',
      'scholars debated in university cloisters',
      'a grand festival filled the streets with color',
      "the duke's gardens opened to public promenade",
    ],
  },
};

// Generate atmospheric opening for a scene
export function atmosphericOpening(
  rng: Random,
  worldTime: Date,
  terrain: Terrain,
  mood?: 'tense' | 'peaceful' | 'ominous' | 'exciting',
): string {
  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);
  const timeDesc = rng.pick(TIME_DESCRIPTORS[phase]);
  const atmos = TERRAIN_ATMOSPHERE[terrain];

  const elements: string[] = [];
  if (rng.chance(0.6)) elements.push(rng.pick(atmos.sights));
  if (rng.chance(0.4)) elements.push(rng.pick(atmos.sounds));
  if (rng.chance(0.25)) elements.push(rng.pick(atmos.smells) + ' hung in the air');
  if (mood === 'ominous' && rng.chance(0.5)) elements.push(rng.pick(atmos.hazards));

  const detail = elements.length ? ` ${rng.pick(elements)}.` : '';
  return `${capitalize(timeDesc)}${detail}`;
}

// Generate settlement scene description
export function settlementScene(
  rng: Random,
  settlement: Settlement,
  worldTime: Date,
  tension?: number, // -3 to 3
): string {
  const vibes = SETTLEMENT_VIBES[settlement.type];
  const normalizedTension = tension ?? settlement.mood;

  let flavorPool: string[];
  if (normalizedTension >= 2) {
    flavorPool = vibes.tension;
  } else if (normalizedTension <= -2) {
    flavorPool = vibes.peace;
  } else {
    flavorPool = vibes.bustle;
  }

  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);
  const timeDesc = rng.pick(TIME_DESCRIPTORS[phase]);

  return `${capitalize(rng.pick(flavorPool))} ${timeDesc}.`;
}

// Encounter flavor - makes each fight/meeting memorable
export function encounterFlavorText(
  rng: Random,
  foe: string,
  reaction: 'friendly' | 'cautious' | 'hostile',
  outcome: 'victory' | 'defeat' | 'negotiation' | 'flight',
  terrain: Terrain,
  actors: string[],
): { summary: string; details: string } {
  const party = actors[0] ?? 'The company';
  const atmos = TERRAIN_ATMOSPHERE[terrain];

  const FRIENDLY_SUMMARIES = [
    `${party} share a fire with wandering ${foe}`,
    `${party} trade news with passing ${foe}`,
    `${party} and ${foe} find common cause`,
    `${foe} offer ${party} aid on the road`,
  ];

  const CAUTIOUS_SUMMARIES = [
    `${party} observe ${foe} from a distance`,
    `${party} skirt around wary ${foe}`,
    `${foe} shadow ${party} but keep their distance`,
    `Tense standoff between ${party} and ${foe}`,
  ];

  const HOSTILE_SUMMARIES = [
    `${party} clash with ${foe}`,
    `${foe} ambush ${party}`,
    `Battle joined between ${party} and ${foe}`,
    `${party} face ${foe} in deadly combat`,
  ];

  const VICTORY_DETAILS = [
    'Steel rang and blood was spilled, but they prevailed.',
    'The fight was brief and brutal. The survivors withdrew.',
    'With discipline and fury, the foe was broken.',
    'Blades flashed in the uncertain light. When it ended, the way was clear.',
    'Though wounds were taken, the day was won.',
  ];

  const DEFEAT_DETAILS = [
    'They were driven back, leaving the field to their enemies.',
    'A bitter retreat, carrying wounded through the darkness.',
    'The rout was complete. They would not soon forget this day.',
    'Blood and humiliation marked the aftermath.',
  ];

  const NEGOTIATION_DETAILS = [
    'Words proved mightier than steel on this occasion.',
    'Coin changed hands. Honor was satisfied, barely.',
    'An uneasy bargain was struck beneath wary eyes.',
    'Neither side wished to die today. Terms were agreed.',
  ];

  const FLIGHT_DETAILS = [
    'They ran. There was no shame in it—only survival.',
    'Discretion proved the better part of valor.',
    'A fighting withdrawal, but a withdrawal nonetheless.',
    'Sometimes wisdom is knowing when to flee.',
  ];

  let summary: string;
  let detailPool: string[];

  switch (reaction) {
    case 'friendly':
      summary = rng.pick(FRIENDLY_SUMMARIES);
      detailPool = NEGOTIATION_DETAILS;
      break;
    case 'cautious':
      summary = rng.pick(CAUTIOUS_SUMMARIES);
      detailPool = outcome === 'flight' ? FLIGHT_DETAILS : NEGOTIATION_DETAILS;
      break;
    case 'hostile':
    default:
      summary = rng.pick(HOSTILE_SUMMARIES);
      detailPool =
        outcome === 'victory'
          ? VICTORY_DETAILS
          : outcome === 'defeat'
          ? DEFEAT_DETAILS
          : outcome === 'flight'
          ? FLIGHT_DETAILS
          : NEGOTIATION_DETAILS;
  }

  // Add atmospheric detail sometimes
  let details = rng.pick(detailPool);
  if (rng.chance(0.3)) {
    details += ` ${capitalize(rng.pick(atmos.sights))} marked the scene.`;
  }

  return { summary, details };
}

// Arrival scenes - more interesting than "they find an inn"
export function arrivalScene(
  rng: Random,
  party: Party,
  settlement: Settlement,
  worldTime: Date,
): { summary: string; details: string } {
  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);
  const vibes = SETTLEMENT_VIBES[settlement.type];

  const SUMMARIES = [
    `${party.name} reach the gates of ${settlement.name}`,
    `${party.name} arrive at ${settlement.name}`,
    `The towers of ${settlement.name} greet ${party.name}`,
    `${party.name} enter ${settlement.name}`,
  ];

  const ARRIVAL_DETAILS: Record<ReturnType<typeof getTimeOfDayPhase>, string[]> = {
    dawn: [
      'The watch opened the gates with bleary eyes.',
      'They were among the first through the gates that day.',
      'Farmwives were already heading to market as they entered.',
    ],
    morning: [
      'The streets bustled with morning commerce.',
      "A crier announced their arrival—or perhaps the day's fish prices.",
      'Children ran alongside, begging for tales of the road.',
    ],
    midday: [
      'The inn was full of travelers escaping the noon heat.',
      'They found a bench in the shade of the town well.',
      'Market stalls offered overpriced water and underripe fruit.',
    ],
    afternoon: [
      'Guild workers were returning to their labors after the midday meal.',
      'A constable gave them a long look but said nothing.',
      'They made for the nearest inn with rooms to let.',
    ],
    dusk: [
      'Lamplighters were about their work as they passed through the gates.',
      'The smell of cooking drew them to a promising tavern.',
      'Shutters were being closed against the coming dark.',
    ],
    evening: [
      'The taverns were already full and raucous.',
      'They secured rooms before the last were taken.',
      'Music and laughter spilled from open doorways.',
    ],
    night: [
      'The gates were barely opened for their late arrival.',
      'Only the night watch saw them pass into the sleeping town.',
      'The innkeeper grumbled but found them beds.',
    ],
    'deep-night': [
      'They bribed the watch to open the postern gate.',
      'Only desperate travelers moved at such an hour.',
      'The inn was dark; they slept in the stable.',
    ],
  };

  const wounded = party.wounded ? ' The wounded needed tending. ' : '';
  const famous = (party.fame ?? 0) >= 5 ? `Word of ${party.name} had preceded them. ` : '';

  return {
    summary: rng.pick(SUMMARIES),
    details: `${rng.pick(ARRIVAL_DETAILS[phase])}${wounded}${famous}${rng.pick(vibes.bustle) ?? ''}`,
  };
}

// Departure scenes
export function departureScene(
  rng: Random,
  party: Party,
  origin: string,
  destination: string,
  terrain: Terrain,
  distance: number,
  worldTime: Date,
): { summary: string; details: string } {
  const atmos = TERRAIN_ATMOSPHERE[terrain];
  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);

  const SUMMARIES = [
    `${party.name} set out from ${origin}`,
    `${party.name} take the ${terrain} road toward ${destination}`,
    `${party.name} depart ${origin} heading for ${destination}`,
    `With supplies secured, ${party.name} leave ${origin}`,
  ];

  const MOOD_DETAILS = [
    `The way ahead promised ${Math.round(distance)} miles of ${terrain}.`,
    `${capitalize(rng.pick(atmos.sights))} awaited on the path to ${destination}.`,
    `They would not reach ${destination} before ${distance > 20 ? 'nightfall' : 'the day was much older'}.`,
    `Rumors of ${rng.pick(['bandits', 'beasts', 'ill weather', 'good fortune'])} accompanied their departure.`,
  ];

  return {
    summary: rng.pick(SUMMARIES),
    details: rng.pick(MOOD_DETAILS),
  };
}

// Market/town beat - replaces boring "market murmurs"
export function marketBeat(
  rng: Random,
  settlement: Settlement,
  worldTime: Date,
  notable?: { npcs?: NPC[]; parties?: Party[]; tension?: number },
): { summary: string; details: string } | null {
  // Reduce frequency of generic market updates
  if (!notable?.npcs?.length && !notable?.parties?.length && rng.chance(0.7)) {
    return null; // Skip most generic beats
  }

  const hour = worldTime.getUTCHours();
  const phase = getTimeOfDayPhase(hour);

  // Market is closed at night
  if (phase === 'night' || phase === 'deep-night') return null;

  const vibes = SETTLEMENT_VIBES[settlement.type];
  const tension = notable?.tension ?? settlement.mood;

  const MARKET_SUMMARIES: Record<string, string[]> = {
    low_tension: [
      `Fair weather and fair dealing in ${settlement.name}`,
      `${settlement.name} enjoys prosperous trade`,
      `Peace reigns in the markets of ${settlement.name}`,
    ],
    normal: [
      `Commerce flows through ${settlement.name}`,
      `The usual business in ${settlement.name}`,
      `${settlement.name} sees steady trade`,
    ],
    high_tension: [
      `Unrest simmers in ${settlement.name}`,
      `Tensions run high in ${settlement.name}'s streets`,
      `Trouble brewing in ${settlement.name}`,
    ],
  };

  const tensionKey = tension >= 2 ? 'high_tension' : tension <= -2 ? 'low_tension' : 'normal';
  let summary = rng.pick(MARKET_SUMMARIES[tensionKey]);

  // Add notable NPCs/parties
  let details = rng.pick(vibes.bustle);
  if (notable?.npcs?.length) {
    const npc = notable.npcs[0];
    details += ` ${npc.name} the ${npc.role} was seen about town.`;
  }
  if (notable?.parties?.length) {
    const p = notable.parties[0];
    if ((p.fame ?? 0) >= 3) {
      details += ` Folk whispered of ${p.name}'s exploits.`;
    }
  }

  return { summary, details };
}

// Weather narratives - more evocative
export function weatherNarrative(
  rng: Random,
  settlement: Settlement,
  conditions: 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog',
  worldTime: Date,
): { summary: string; details: string } {
  const WEATHER_NARRATIVES: Record<typeof conditions, { summaries: string[]; details: string[] }> = {
    clear: {
      summaries: [
        `Blue skies over ${settlement.name}`,
        `Fair weather blesses ${settlement.name}`,
        `The sun shines upon ${settlement.name}`,
      ],
      details: [
        'Perfect conditions for travel and trade.',
        'Not a cloud marred the heavens.',
        'Farmers gave thanks for the gentle weather.',
      ],
    },
    cloudy: {
      summaries: [
        `Clouds gather over ${settlement.name}`,
        `Grey skies hang over ${settlement.name}`,
        `Overcast weather at ${settlement.name}`,
      ],
      details: [
        'Whether rain would follow, none could say.',
        'The mood matched the dull sky.',
        'Old wounds ached with the change in pressure.',
      ],
    },
    rain: {
      summaries: [
        `Rain falls on ${settlement.name}`,
        `${settlement.name} weathers a downpour`,
        `The heavens open over ${settlement.name}`,
      ],
      details: [
        'The streets emptied as folk sought shelter.',
        'Merchants cursed as goods needed covering.',
        'Children splashed in growing puddles.',
      ],
    },
    storm: {
      summaries: [
        `Storm lashes ${settlement.name}`,
        `Thunder rolls over ${settlement.name}`,
        `Tempest strikes ${settlement.name}`,
      ],
      details: [
        'Shutters slammed and animals huddled in barns.',
        'Lightning illuminated the darkened streets.',
        'The old folk said such storms brought change.',
      ],
    },
    snow: {
      summaries: [
        `Snow blankets ${settlement.name}`,
        `Winter's grip tightens on ${settlement.name}`,
        `${settlement.name} wakes to fresh snowfall`,
      ],
      details: [
        'Sounds were muffled under the white covering.',
        'The cold drove all but the hardiest indoors.',
        'Children made sport while adults worried over firewood.',
      ],
    },
    fog: {
      summaries: [
        `Fog shrouds ${settlement.name}`,
        `Mist rolls through ${settlement.name}`,
        `${settlement.name} vanishes into fog`,
      ],
      details: [
        'Shapes loomed and vanished in the murk.',
        'Sound carried strangely in the thick air.',
        'The watch doubled their patrols, seeing danger in every shadow.',
      ],
    },
  };

  const weather = WEATHER_NARRATIVES[conditions];
  return {
    summary: rng.pick(weather.summaries),
    details: rng.pick(weather.details),
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { capitalize };

