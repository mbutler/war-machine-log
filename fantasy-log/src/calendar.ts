/**
 * CALENDAR & SEASONAL SYSTEM
 * 
 * A rich fantasy calendar with:
 * - Named months and seasons
 * - Weather that follows seasonal patterns and affects gameplay
 * - Festivals and holy days that create story opportunities
 * - Moon phases for atmosphere and certain events
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Settlement, Terrain } from './types.ts';
import { weatherNarrative, capitalize } from './prose.ts';

// Real calendar - seasons based on real months
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';

// Real calendar holidays (simplified)
export interface Holiday {
  name: string;
  month: number; // 0-indexed
  day: number;
  description: string;
  effects: {
    moodBonus?: number;
    tradeBonus?: boolean;
    magicPotent?: boolean;
  };
}

export const HOLIDAYS: Holiday[] = [
  {
    name: 'New Year',
    month: 0, // January
    day: 1,
    description: 'The start of a new year brings hope and renewal.',
    effects: { moodBonus: 1 },
  },
  {
    name: 'Valentine\'s Day',
    month: 1, // February
    day: 14,
    description: 'A day of love and affection.',
    effects: { moodBonus: 1 },
  },
  {
    name: 'April Fools',
    month: 3, // April
    day: 1,
    description: 'Pranks and jokes fill the air.',
    effects: { moodBonus: 1 },
  },
  {
    name: 'Halloween',
    month: 9, // October
    day: 31,
    description: 'The veil between worlds thins. Ghosts and ghouls roam.',
    effects: { magicPotent: true },
  },
  {
    name: 'Christmas',
    month: 11, // December
    day: 25,
    description: 'Gifts are exchanged and families gather.',
    effects: { moodBonus: 2, tradeBonus: true },
  },
];

export interface CalendarState {
  weather: WeatherCondition;
  weatherDuration: number; // hours remaining
  moonPhase: MoonPhase;
  activeEffects: {
    eclipse?: boolean;
    omens?: string[];
  };
}

// Get calendar state from world time
// Uses real calendar dates
export function getCalendarFromDate(date: Date, weather?: WeatherCondition): CalendarState {
  // Moon phase - ~29.5 day cycle based on real date
  const daysSinceEpoch = Math.floor(date.getTime() / (24 * 60 * 60 * 1000));
  const moonCycleDay = daysSinceEpoch % 30;
  let moonPhase: MoonPhase;
  if (moonCycleDay < 7) moonPhase = 'new';
  else if (moonCycleDay < 15) moonPhase = 'waxing';
  else if (moonCycleDay < 22) moonPhase = 'full';
  else moonPhase = 'waning';

  return {
    weather: weather ?? 'clear',
    weatherDuration: 12,
    moonPhase,
    activeEffects: {},
  };
}

// Get season from month (real calendar)
export function getSeason(month: number): Season {
  // Spring: March-May (2-4), Summer: June-Aug (5-7),
  // Autumn: Sep-Nov (8-10), Winter: Dec-Feb (11,0,1)
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

// Get month name (real calendar)
export function getMonthName(month: number): string {
  return MONTH_NAMES[month % 12];
}

// Format date nicely (real calendar)
export function formatDate(date: Date): string {
  const monthName = getMonthName(date.getUTCMonth());
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const ordinal = getOrdinal(day);
  return `${monthName} ${day}${ordinal}, ${year}`;
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Check for active holiday
export function getActiveHoliday(date: Date): Holiday | undefined {
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  for (const holiday of HOLIDAYS) {
    if (month === holiday.month && day === holiday.day) {
      return holiday;
    }
  }
  return undefined;
}

// Weather generation based on season
const WEATHER_ODDS: Record<Season, Record<WeatherCondition, number>> = {
  spring: { clear: 0.3, cloudy: 0.25, rain: 0.3, storm: 0.1, snow: 0.02, fog: 0.08 },
  summer: { clear: 0.5, cloudy: 0.2, rain: 0.15, storm: 0.1, snow: 0, fog: 0.05 },
  autumn: { clear: 0.25, cloudy: 0.3, rain: 0.25, storm: 0.05, snow: 0.05, fog: 0.15 },
  winter: { clear: 0.2, cloudy: 0.25, rain: 0.1, storm: 0.05, snow: 0.3, fog: 0.1 },
};

export function generateWeather(rng: Random, season: Season, previousWeather?: WeatherCondition): WeatherCondition {
  const odds = WEATHER_ODDS[season];

  // Weather tends to persist somewhat
  if (previousWeather && rng.chance(0.6)) {
    return previousWeather;
  }

  const roll = rng.next();
  let cumulative = 0;
  for (const [condition, prob] of Object.entries(odds)) {
    cumulative += prob;
    if (roll < cumulative) {
      return condition as WeatherCondition;
    }
  }
  return 'clear';
}

// Weather effects on gameplay
export interface WeatherEffects {
  travelSpeedMod: number; // multiplier
  encounterChanceMod: number; // multiplier
  visibilityReduced: boolean;
  outdoorActivityPenalty: boolean;
  descriptiveCondition: string;
  moodModifier: number; // Settlement mood impact
  combatModifier: number; // Combat effectiveness
  magicModifier: number; // Magic potency
  narrativeHooks: string[]; // Story opportunities
}

export function getWeatherEffects(weather: WeatherCondition): WeatherEffects {
  switch (weather) {
    case 'clear':
      return {
        travelSpeedMod: 1.0,
        encounterChanceMod: 1.0,
        visibilityReduced: false,
        outdoorActivityPenalty: false,
        descriptiveCondition: 'fine weather',
        moodModifier: 1,
        combatModifier: 0,
        magicModifier: 0,
        narrativeHooks: [
          'Perfect weather for a journey',
          'The gods smile upon travelers',
          'A beautiful day for commerce',
        ],
      };
    case 'cloudy':
      return {
        travelSpeedMod: 1.0,
        encounterChanceMod: 1.0,
        visibilityReduced: false,
        outdoorActivityPenalty: false,
        descriptiveCondition: 'overcast skies',
        moodModifier: 0,
        combatModifier: 0,
        magicModifier: 0,
        narrativeHooks: [
          'An oppressive sky weighs on spirits',
          'The gray light hides intentions',
          'Change comes with the clouds',
        ],
      };
    case 'rain':
      return {
        travelSpeedMod: 0.75,
        encounterChanceMod: 0.8,
        visibilityReduced: true,
        outdoorActivityPenalty: true,
        descriptiveCondition: 'steady rain',
        moodModifier: -1,
        combatModifier: -1, // Wet conditions hamper fighting
        magicModifier: 1, // Water magic enhanced
        narrativeHooks: [
          'Rain drives folk indoors—and secrets outdoors',
          'Footprints wash away quickly',
          'The rivers rise',
          'Crops drink deep',
        ],
      };
    case 'storm':
      return {
        travelSpeedMod: 0.5,
        encounterChanceMod: 0.5,
        visibilityReduced: true,
        outdoorActivityPenalty: true,
        descriptiveCondition: 'raging storm',
        moodModifier: -2,
        combatModifier: -2, // Severe fighting penalty
        magicModifier: 2, // Storm magic enhanced
        narrativeHooks: [
          'The storm covers all sounds',
          'Lightning illuminates hidden truths',
          'Only the desperate or the mad travel now',
          'Something stirs in the thunder',
          'The old gods speak in the wind',
        ],
      };
    case 'snow':
      return {
        travelSpeedMod: 0.6,
        encounterChanceMod: 0.7,
        visibilityReduced: true,
        outdoorActivityPenalty: true,
        descriptiveCondition: 'falling snow',
        moodModifier: 0, // Snow has a mixed effect
        combatModifier: -1,
        magicModifier: 1, // Cold magic enhanced
        narrativeHooks: [
          'Tracks show clearly in fresh snow',
          'The cold claims the unwary',
          'Beauty and danger in equal measure',
          'Supplies become precious',
          'Fire is life',
        ],
      };
    case 'fog':
      return {
        travelSpeedMod: 0.8,
        encounterChanceMod: 1.2, // Fog increases ambush chance!
        visibilityReduced: true,
        outdoorActivityPenalty: false,
        descriptiveCondition: 'thick fog',
        moodModifier: -1,
        combatModifier: 0, // Affects both sides equally
        magicModifier: 1, // Illusion and divination enhanced
        narrativeHooks: [
          'The fog hides friend and foe alike',
          'Sounds carry strangely',
          'The veil between worlds thins',
          'Ghosts walk more freely',
          'Perfect weather for secrets',
        ],
      };
  }
}

// Seasonal effects on the world
export interface SeasonalEffects {
  travelMod: number;
  encounterMod: number;
  economicMod: number; // Trade impact
  moodMod: number;
  agricultureMod: number; // Farming impact
  militaryMod: number; // Campaign season or not
  narrativeHooks: string[];
  monsters: string[]; // Monster types more active this season
  events: string[]; // Potential story events
}

export function getSeasonalEffects(season: Season): SeasonalEffects {
  switch (season) {
    case 'spring':
      return {
        travelMod: 1.0,
        encounterMod: 1.1, // Creatures emerging from winter
        economicMod: 0.9, // Between harvest and next—resources low
        moodMod: 1,
        agricultureMod: 1.5, // Planting season
        militaryMod: 0.8, // Muddy roads
        narrativeHooks: [
          'New life stirs in the land',
          'The thaw reveals what winter hid',
          'Young animals are vulnerable',
          'Rivers run high with snowmelt',
          'Romance blooms with the flowers',
        ],
        monsters: ['wolves', 'bears', 'goblins', 'bandits'],
        events: ['flooding', 'migration', 'romance', 'planting-festival', 'disease-outbreak'],
      };
    case 'summer':
      return {
        travelMod: 1.1, // Long days, dry roads
        encounterMod: 1.0,
        economicMod: 1.1, // Trade season
        moodMod: 1,
        agricultureMod: 1.2, // Growing season
        militaryMod: 1.2, // Campaign season
        narrativeHooks: [
          'The long days favor the bold',
          'Armies march while the roads are dry',
          'Travelers fill the roads',
          'The heat breeds tempers',
          'Droughts threaten the harvest',
        ],
        monsters: ['dragons', 'giants', 'orcs', 'trolls'],
        events: ['war', 'tournament', 'drought', 'plague', 'trade-fair'],
      };
    case 'autumn':
      return {
        travelMod: 1.0,
        encounterMod: 1.2, // Creatures storing for winter
        economicMod: 1.3, // Harvest bounty
        moodMod: 0,
        agricultureMod: 2.0, // Harvest
        militaryMod: 1.0, // Last chance before winter
        narrativeHooks: [
          'The harvest will determine who survives winter',
          'Creatures grow desperate before the cold',
          'The veil between worlds thins',
          'Old things stir in the dying light',
          'Debts come due before winter',
        ],
        monsters: ['undead', 'werewolves', 'demons', 'fey'],
        events: ['harvest', 'haunting', 'succession', 'wedding', 'famine'],
      };
    case 'winter':
      return {
        travelMod: 0.7, // Snow and cold
        encounterMod: 0.6, // Less activity
        economicMod: 0.7, // Roads difficult
        moodMod: -1,
        agricultureMod: 0.0, // Nothing grows
        militaryMod: 0.5, // Campaigns end
        narrativeHooks: [
          'The cold is a patient killer',
          'Communities huddle together',
          'Old rivalries simmer by the fire',
          'The desperate take desperate measures',
          'Ice locks the roads',
          'Hunger gnaws at the edges',
        ],
        monsters: ['frost-giants', 'ice-trolls', 'yeti', 'white-dragons', 'wolves'],
        events: ['starvation', 'siege', 'murder', 'conspiracy', 'fire'],
      };
  }
}

// Generate seasonal narrative events
export function generateSeasonalEvent(
  rng: Random,
  season: Season,
  settlement: Settlement,
  worldTime: Date,
  seed: string,
): LogEntry | null {
  const effects = getSeasonalEffects(season);

  // Only generate occasionally
  if (!rng.chance(0.05)) return null;

  const SEASONAL_EVENTS: Record<Season, { summaries: string[]; details: string[] }> = {
    spring: {
      summaries: [
        `Spring rains flood areas near ${settlement.name}`,
        `Young couples celebrate romance in ${settlement.name}`,
        `Fresh spring produce arrives in ${settlement.name}`,
        `Gardening begins in earnest near ${settlement.name}`,
        `Wildflowers bloom around ${settlement.name}`,
      ],
      details: [
        'Heavy rains cause flooding. Some areas become impassable.',
        'Love is in the air as spring brings renewal and hope.',
        'Fresh fruits and vegetables arrive from nearby farms.',
        'The earth awakens. Gardens are planted and tended.',
        'Colorful wildflowers carpet the meadows and hills.',
      ],
    },
    summer: {
      summaries: [
        `Heat wave affects ${settlement.name}`,
        `Summer travelers arrive in ${settlement.name}`,
        `Local festival announced in ${settlement.name}`,
        `Dry conditions worry farmers near ${settlement.name}`,
        `Busy market days in ${settlement.name}`,
      ],
      details: [
        'The sun beats down relentlessly. People seek shade and water.',
        'The roads fill with merchants, pilgrims, and adventurers.',
        'Community events bring people together for celebration.',
        'Lack of rain threatens crops. Farmers watch the skies anxiously.',
        'Trade flourishes as people buy and sell in the warm weather.',
      ],
    },
    autumn: {
      summaries: [
        `Harvest season peaks in ${settlement.name}`,
        `Mysterious occurrences near ${settlement.name}`,
        `Cool weather arrives in ${settlement.name}`,
        `Animals prepare for winter near ${settlement.name}`,
        `Fall colors surround ${settlement.name}`,
      ],
      details: [
        'Crops are gathered. The harvest determines winter prosperity.',
        'Strange sightings and sounds as the veil thins.',
        'Temperatures drop. People prepare for colder months.',
        'Wildlife grows more active before hibernation.',
        'Trees display brilliant colors before winter dormancy.',
      ],
    },
    winter: {
      summaries: [
        `Snowfall covers ${settlement.name}`,
        `Winter supplies monitored in ${settlement.name}`,
        `Indoor activities flourish in ${settlement.name}`,
        `Fire breaks out in ${settlement.name}`,
        `Cold weather isolates ${settlement.name}`,
      ],
      details: [
        'Snow blankets everything. Travel becomes difficult.',
        'Food stores are carefully managed for the long winter.',
        'People gather indoors for warmth and entertainment.',
        'Dry conditions make fires more dangerous.',
        'Heavy snow and cold limit movement and communication.',
      ],
    },
  };

  const events = SEASONAL_EVENTS[season];
  const index = rng.int(events.summaries.length);

  return {
    category: 'weather',
    summary: events.summaries[index],
    details: events.details[index],
    location: settlement.name,
    worldTime,
    realTime: new Date(),
    seed,
  };
}

// Weather-driven encounter modifiers
export function getWeatherEncounterContext(
  weather: WeatherCondition,
  season: Season,
  rng: Random,
): { prefix: string; suffix: string; creatureModifier: string } {
  const weatherContext: Record<WeatherCondition, { prefixes: string[]; suffixes: string[] }> = {
    clear: {
      prefixes: [
        'Under the bright sky',
        'With the sun high overhead',
        'In the clear light of day',
      ],
      suffixes: [
        'They are clearly visible.',
        'There is nowhere to hide.',
        'The encounter is straightforward.',
      ],
    },
    cloudy: {
      prefixes: [
        'Under leaden skies',
        'Beneath the gray overcast',
        'With clouds pressing low',
      ],
      suffixes: [
        'The light is flat and deceptive.',
        'Distances are hard to judge.',
        'The gloom affects morale.',
      ],
    },
    rain: {
      prefixes: [
        'Through curtains of rain',
        'As water streams down',
        'In the downpour',
      ],
      suffixes: [
        'Everyone is miserable and wet.',
        'Footing is treacherous.',
        'Bowstrings grow slack.',
      ],
    },
    storm: {
      prefixes: [
        'Amid lightning and thunder',
        'As the storm rages',
        'Between thunderclaps',
      ],
      suffixes: [
        'Communication is nearly impossible.',
        'The fury of nature overshadows combat.',
        'Only the desperate fight in this.',
      ],
    },
    snow: {
      prefixes: [
        'Through swirling snow',
        'In the white blindness',
        'As snowflakes sting exposed skin',
      ],
      suffixes: [
        'The cold saps strength.',
        'Tracks tell tales.',
        'Fire would be a mercy.',
      ],
    },
    fog: {
      prefixes: [
        'In the murky fog',
        'Through the gray veil',
        'As shapes materialize from the mist',
      ],
      suffixes: [
        'Nothing is certain until it is too late.',
        'Sounds are muffled and misdirected.',
        'The fog favors the ambusher.',
      ],
    },
  };
  
  const seasonalCreatures: Record<Season, string[]> = {
    spring: ['emerging from winter torpor', 'with young to protect', 'hungry after the long cold'],
    summer: ['at the height of their power', 'ranging far in the heat', 'bold and aggressive'],
    autumn: ['desperate before winter', 'fattening for hibernation', 'unusually aggressive'],
    winter: ['driven by hunger', 'shelter-seeking', 'gaunt and fierce'],
  };
  
  const context = weatherContext[weather];
  const creatures = seasonalCreatures[season];
  
  return {
    prefix: rng.pick(context.prefixes),
    suffix: rng.pick(context.suffixes),
    creatureModifier: rng.pick(creatures),
  };
}

// Generate holiday event
export function holidayEvent(
  rng: Random,
  settlement: Settlement,
  holiday: Holiday,
  worldTime: Date,
  seed: string,
): LogEntry {
  const HOLIDAY_SCENES = [
    `${holiday.name} celebrations in ${settlement.name}`,
    `${settlement.name} observes ${holiday.name}`,
    `The spirit of ${holiday.name} fills ${settlement.name}`,
  ];

  const CELEBRATION_DETAILS = [
    'Festivities fill the streets with joy and merriment.',
    'Merchants offer special deals; the air smells of celebration.',
    'People gather to mark this special occasion.',
    'The community comes together in celebration.',
    'Old traditions are honored and new memories made.',
    'Visitors are welcomed with festive cheer.',
  ];

  return {
    category: 'town',
    summary: rng.pick(HOLIDAY_SCENES),
    details: `${holiday.description} ${rng.pick(CELEBRATION_DETAILS)}`,
    location: settlement.name,
    worldTime,
    realTime: new Date(),
    seed,
  };
}

// Daily calendar tick - weather changes, holiday events, etc.
export function dailyCalendarTick(
  world: WorldState,
  rng: Random,
  worldTime: Date,
  currentCalendar: CalendarState,
): { logs: LogEntry[]; newCalendar: CalendarState } {
  const logs: LogEntry[] = [];

  // For real time: recalculate calendar from worldTime (don't increment)
  const newCalendar = getCalendarFromDate(worldTime, currentCalendar.weather);

  // Check if day changed (for event logging)
  const currentDay = worldTime.getUTCDate();
  const currentMonth = worldTime.getUTCMonth();
  const currentYear = worldTime.getUTCFullYear();

  // Get previous day's date for comparison
  const prevTime = new Date(worldTime.getTime() - 24 * 60 * 60 * 1000);
  const prevDay = prevTime.getUTCDate();
  const prevMonth = prevTime.getUTCMonth();
  const prevYear = prevTime.getUTCFullYear();

  // Detect if we crossed into a new month or year
  if (currentDay === 1 && prevDay > 1) {
    // New month
    if (currentMonth === 0 && prevMonth === 11) {
      // New Year!
      logs.push({
        category: 'town',
        summary: `Happy New Year: ${currentYear}`,
        details: 'Church bells ring across the land. A fresh page turns in the chronicle.',
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    } else if (currentMonth !== prevMonth) {
      // New month (but not new year)
      logs.push({
        category: 'town',
        summary: `The month of ${getMonthName(currentMonth)} begins`,
        details: `${capitalize(getSeason(currentMonth))} ${currentMonth < 6 ? 'strengthens its grip' : 'settles over the land'}.`,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }

  // Generate new weather (use new calendar state)
  const season = getSeason(newCalendar.month);
  const newWeather = generateWeather(rng, season, currentCalendar.weather);

  // Log significant weather changes
  if (newWeather !== currentCalendar.weather) {
    const settlement = rng.pick(world.settlements);
    const narrative = weatherNarrative(rng, settlement, newWeather, worldTime);
    logs.push({
      category: 'weather',
      summary: narrative.summary,
      details: narrative.details,
      location: settlement.name,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }

  // Update weather in calendar
  newCalendar.weather = newWeather;

  // Check for holidays
  const holiday = getActiveHoliday(worldTime);
  if (holiday) {
    // Holiday event for all settlements
    for (const settlement of world.settlements) {
      logs.push(holidayEvent(rng, settlement, holiday, worldTime, world.seed));

      // Apply holiday mood bonus
      if (holiday.effects.moodBonus) {
        settlement.mood = Math.min(3, settlement.mood + holiday.effects.moodBonus);
      }
    }
  }

  // Full moon events
  if (newCalendar.moonPhase === 'full' && currentCalendar.moonPhase !== 'full') {
    logs.push({
      category: 'weather',
      summary: 'The full moon rises',
      details: 'Silver light bathes the land. Strange things stir in the shadows.',
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });

    // Full moon increases supernatural encounters
    newCalendar.activeEffects.omens = ['Werewolves hunt', 'Ghosts walk', 'The fey are restless'];
  }

  // Rare events - eclipses, comets, etc.
  if (rng.chance(0.002)) {
    const RARE_EVENTS = [
      { summary: 'Eclipse darkens the sky', details: 'For long minutes, day becomes night. Animals panic. Priests pray.' },
      { summary: 'A comet blazes overhead', details: 'Seers proclaim doom. Others see opportunity. All agree: change is coming.' },
      { summary: 'Aurora lights the northern sky', details: 'Rivers of color flow across the heavens. The old folk speak of portents.' },
      { summary: 'The earth trembles', details: 'A quake rattles buildings and nerves alike. Some walls crack; some secrets are exposed.' },
    ];
    const event = rng.pick(RARE_EVENTS);
    logs.push({
      category: 'weather',
      summary: event.summary,
      details: event.details,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }
  
  // === SEASONAL NARRATIVE EVENTS ===
  // Generate occasional seasonal events for settlements
  for (const settlement of world.settlements) {
    const seasonalEvent = generateSeasonalEvent(rng, season, settlement, worldTime, world.seed);
    if (seasonalEvent) {
      logs.push(seasonalEvent);
      
      // Apply seasonal mood effects to settlements
      const seasonEffects = getSeasonalEffects(season);
      const weatherEffects = getWeatherEffects(newWeather);
      settlement.mood = Math.max(-3, Math.min(3, 
        settlement.mood + seasonEffects.moodMod * 0.1 + weatherEffects.moodModifier * 0.1
      ));
    }
  }
  
  // === EXTREME WEATHER CONSEQUENCES ===
  // Storms can cause damage
  if (newWeather === 'storm' && rng.chance(0.1)) {
    const settlement = rng.pick(world.settlements);
    const STORM_DAMAGE = [
      { 
        summary: `Lightning strikes ${settlement.name}`, 
        details: 'A building catches fire. The bucket brigade forms.',
      },
      { 
        summary: `Flooding in ${settlement.name}`, 
        details: 'The river overflows its banks. Lower districts evacuate.',
      },
      { 
        summary: `Roof collapse in ${settlement.name}`, 
        details: 'The wind proves too much for an old structure. Fortunately, no deaths.',
      },
      {
        summary: `Tree falls on ${settlement.name} road`,
        details: 'The main thoroughfare is blocked. Traffic reroutes through cramped alleys.',
      },
    ];
    const damage = rng.pick(STORM_DAMAGE);
    logs.push({
      category: 'weather',
      summary: damage.summary,
      details: damage.details,
      location: settlement.name,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    settlement.mood = Math.max(-3, settlement.mood - 1);
  }
  
  // Heavy snow can isolate settlements
  if (newWeather === 'snow' && season === 'winter' && rng.chance(0.05)) {
    const settlement = rng.pick(world.settlements);
    logs.push({
      category: 'weather',
      summary: `Heavy snow isolates ${settlement.name}`,
      details: 'The roads are impassable. The settlement must rely on its own stores.',
      location: settlement.name,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }
  
  // Fog can enable crime
  if (newWeather === 'fog' && rng.chance(0.08)) {
    const settlement = rng.pick(world.settlements);
    const FOG_EVENTS = [
      { 
        summary: `Robbery in ${settlement.name} under cover of fog`, 
        details: 'The thieves vanished into the murk before anyone could react.',
      },
      { 
        summary: `Body discovered in ${settlement.name} fog`, 
        details: 'The victim was not killed by the weather. The watch investigates.',
      },
      {
        summary: `Smugglers slip through ${settlement.name}`,
        details: 'Contraband moves freely when no one can see.',
      },
    ];
    const fogEvent = rng.pick(FOG_EVENTS);
    logs.push({
      category: 'town',
      summary: fogEvent.summary,
      details: fogEvent.details,
      location: settlement.name,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }
  
  // === SEASONAL TRANSITION EVENTS ===
  // First day of a new season
  const transitionCurrentMonth = worldTime.getUTCMonth();
  const transitionPrevMonth = new Date(worldTime.getTime() - 24 * 60 * 60 * 1000).getUTCMonth();
  const transitionPrevSeason = getSeason(transitionPrevMonth);
  if (transitionCurrentMonth !== transitionPrevMonth && season !== transitionPrevSeason) {
    logs.push({
      category: 'weather',
      summary: `${capitalize(season)} arrives`,
      details: getSeasonTransitionNarrative(rng, season, transitionPrevSeason),
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }

  return { logs, newCalendar };
}

// Season transition narrative
function getSeasonTransitionNarrative(rng: Random, newSeason: Season, oldSeason: Season): string {
  const TRANSITIONS: Record<Season, string[]> = {
    spring: [
      'Spring arrives with melting snow and swelling rivers.',
      'Birds return and flowers bloom as winter finally releases its grip.',
      'The earth awakens from its long slumber. Life begins anew.',
      'Warmer weather brings anticipation. Gardens and fields prepare for growth.',
    ],
    summer: [
      'Summer heat builds as days grow longer and hotter.',
      'The sun dominates the sky. Crops flourish in the warmth.',
      'Travel increases as roads dry and weather improves.',
      'Hot days bring both opportunity and the need for caution.',
    ],
    autumn: [
      'Fall colors emerge as temperatures begin to cool.',
      'Harvest season brings bounty and the preparation for winter.',
      'Days shorten and nights grow longer. A time of change approaches.',
      'The land shows its autumn finery before winter\'s approach.',
    ],
    winter: [
      'Winter arrives with the first frosts and cooling winds.',
      'Snow begins to fall, covering the world in white.',
      'Cold weather drives people indoors. Communities huddle together.',
      'The long winter nights bring reflection and storytelling.',
    ],
  };

  return rng.pick(TRANSITIONS[newSeason]);
}

// Get terrain-appropriate weather description
export function terrainWeatherDescription(terrain: Terrain, weather: WeatherCondition, rng: Random): string {
  const TERRAIN_WEATHER: Record<Terrain, Record<WeatherCondition, string[]>> = {
    road: {
      clear: ['Dust rises from the dry road.', 'The cobbles gleam in sunlight.'],
      cloudy: ['The road stretches grey beneath grey skies.'],
      rain: ['The road has become a river of mud.', 'Puddles fill every rut.'],
      storm: ['The road is nearly impassable in the downpour.'],
      snow: ['Snow covers the road, hiding its dangers.'],
      fog: ['The road vanishes into white ahead and behind.'],
    },
    forest: {
      clear: ['Shafts of light pierce the canopy.'],
      cloudy: ['The forest is gloomy beneath the overcast.'],
      rain: ['Rain patters on leaves, a thousand tiny drums.'],
      storm: ['Branches whip and trees groan in the wind.'],
      snow: ['Snow lies in patches where it pierces the canopy.'],
      fog: ['Mist winds between the trunks like searching fingers.'],
    },
    hills: {
      clear: ['The hilltops stand sharp against the blue.'],
      cloudy: ['Clouds cling to the higher peaks.'],
      rain: ['Rivulets carve new paths down every slope.'],
      storm: ['Lightning seeks the hilltops. Thunder follows.'],
      snow: ['The hills are white quilts, beautiful and deadly.'],
      fog: ['The valleys have become lakes of mist.'],
    },
    mountains: {
      clear: ['The peaks gleam with eternal snow.'],
      cloudy: ['Clouds obscure all but the lowest slopes.'],
      rain: ['Waterfalls multiply. The paths run with water.'],
      storm: ['The mountain seems alive with fury.'],
      snow: ['Fresh snow makes every path treacherous.'],
      fog: ['The world shrinks to arms-length in the murk.'],
    },
    swamp: {
      clear: ['Steam rises from the murky waters.'],
      cloudy: ['The swamp is even more oppressive beneath grey skies.'],
      rain: ['There is no shelter. Water above, water below.'],
      storm: ['Lightning illuminates horrors half-seen in the reeds.'],
      snow: ['Snow sits uneasily on the unfrozen mire.'],
      fog: ['The fog could hide anything. It probably does.'],
    },
    desert: {
      clear: ['The sun beats down without mercy.'],
      cloudy: ['A rare respite from the relentless glare.'],
      rain: ['The desert drinks. Flash floods threaten wadis.'],
      storm: ['Sandstorm. Bury yourself and pray.'],
      snow: ['The dunes wear caps of white. It will not last.'],
      fog: ['Morning mist burns away by the third hour.'],
    },
  };

  const options = TERRAIN_WEATHER[terrain]?.[weather] ?? ['The weather is unremarkable.'];
  return rng.pick(options);
}

