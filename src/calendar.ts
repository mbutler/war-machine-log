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

// Fantasy calendar
export const MONTHS = [
  { name: 'Deepwinter', season: 'winter', days: 30 },
  { name: 'Thawmoon', season: 'winter', days: 30 },
  { name: 'Sowingtime', season: 'spring', days: 31 },
  { name: 'Rainmoon', season: 'spring', days: 30 },
  { name: 'Brightening', season: 'spring', days: 31 },
  { name: 'Highsun', season: 'summer', days: 30 },
  { name: 'Summerpeak', season: 'summer', days: 31 },
  { name: 'Harvestide', season: 'autumn', days: 30 },
  { name: 'Leaffall', season: 'autumn', days: 31 },
  { name: 'Mistmoon', season: 'autumn', days: 30 },
  { name: 'Frostfall', season: 'winter', days: 30 },
  { name: 'Longnight', season: 'winter', days: 31 },
] as const;

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';

// Festivals - story opportunities throughout the year
export interface Festival {
  name: string;
  month: number; // 0-indexed
  dayStart: number;
  duration: number; // days
  description: string;
  effects: {
    moodBonus?: number;
    tradeBonus?: boolean;
    dangerReduction?: boolean;
    magicPotent?: boolean;
  };
}

export const FESTIVALS: Festival[] = [
  {
    name: 'Candlemas',
    month: 1, // Thawmoon
    dayStart: 15,
    duration: 1,
    description: 'Candles are lit against the dark; folk pray for the return of light.',
    effects: { moodBonus: 1 },
  },
  {
    name: 'First Planting',
    month: 2, // Sowingtime
    dayStart: 1,
    duration: 3,
    description: 'Seeds are blessed and the first furrows cut. A time of hope.',
    effects: { moodBonus: 1, dangerReduction: true },
  },
  {
    name: 'Beltane',
    month: 4, // Brightening
    dayStart: 1,
    duration: 2,
    description: 'Great fires are lit. Young lovers dance. The veil thins.',
    effects: { moodBonus: 2, magicPotent: true },
  },
  {
    name: 'Midsummer',
    month: 5, // Highsun
    dayStart: 21,
    duration: 3,
    description: 'The longest day. Grand markets, tournaments, and revelry.',
    effects: { moodBonus: 2, tradeBonus: true },
  },
  {
    name: 'Harvest Home',
    month: 7, // Harvestide
    dayStart: 20,
    duration: 5,
    description: 'The crops are in. Feasting, drinking, and thanksgiving.',
    effects: { moodBonus: 2, tradeBonus: true },
  },
  {
    name: 'Allhallows',
    month: 9, // Mistmoon
    dayStart: 31,
    duration: 1,
    description: 'The dead walk close. Masks are worn. Wards are strengthened.',
    effects: { magicPotent: true },
  },
  {
    name: 'Winternight',
    month: 11, // Longnight
    dayStart: 21,
    duration: 3,
    description: 'The longest night. Gifts are exchanged. Oaths renewed.',
    effects: { moodBonus: 1 },
  },
];

export interface CalendarState {
  year: number;
  month: number; // 0-11
  day: number; // 1-based
  weather: WeatherCondition;
  weatherDuration: number; // hours remaining
  moonPhase: MoonPhase;
  activeEffects: {
    festival?: Festival;
    eclipse?: boolean;
    omens?: string[];
  };
}

// Get calendar state from world time
export function getCalendarFromDate(date: Date, weather?: WeatherCondition): CalendarState {
  // Use a fantasy epoch - year 1 = 1000 AD equivalent
  const baseYear = 1000;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceEpoch = Math.floor(date.getTime() / msPerDay);

  // Calculate year and day within year
  const daysPerYear = MONTHS.reduce((sum, m) => sum + m.days, 0); // 365 days
  const year = baseYear + Math.floor(daysSinceEpoch / daysPerYear);
  let dayOfYear = daysSinceEpoch % daysPerYear;

  // Find month and day
  let month = 0;
  let day = 1;
  for (let m = 0; m < MONTHS.length; m++) {
    if (dayOfYear < MONTHS[m].days) {
      month = m;
      day = dayOfYear + 1;
      break;
    }
    dayOfYear -= MONTHS[m].days;
  }

  // Moon phase - ~29.5 day cycle
  const moonCycleDay = daysSinceEpoch % 30;
  let moonPhase: MoonPhase;
  if (moonCycleDay < 7) moonPhase = 'new';
  else if (moonCycleDay < 15) moonPhase = 'waxing';
  else if (moonCycleDay < 22) moonPhase = 'full';
  else moonPhase = 'waning';

  return {
    year,
    month,
    day,
    weather: weather ?? 'clear',
    weatherDuration: 12,
    moonPhase,
    activeEffects: {},
  };
}

// Get season from month
export function getSeason(month: number): Season {
  return MONTHS[month % 12].season;
}

// Get month name
export function getMonthName(month: number): string {
  return MONTHS[month % 12].name;
}

// Format date nicely
export function formatDate(calendar: CalendarState): string {
  const monthName = getMonthName(calendar.month);
  const ordinal = getOrdinal(calendar.day);
  return `${calendar.day}${ordinal} of ${monthName}, Year ${calendar.year}`;
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// Check for active festival
export function getActiveFestival(calendar: CalendarState): Festival | undefined {
  for (const festival of FESTIVALS) {
    if (calendar.month !== festival.month) continue;
    if (calendar.day >= festival.dayStart && calendar.day < festival.dayStart + festival.duration) {
      return festival;
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
        `Spring floods threaten ${settlement.name}`,
        `Young lovers elope from ${settlement.name}`,
        `The first caravans of spring reach ${settlement.name}`,
        `Planting begins in earnest near ${settlement.name}`,
        `Wildlife returns to the fields around ${settlement.name}`,
      ],
      details: [
        'The rivers run high. Cellars flood. Roads turn to mud.',
        'Families rage, but the heart wants what it wants.',
        'Fresh goods and fresher news arrive after the long winter.',
        'The earth is turned. Seeds are blessed. Hope is planted.',
        'Birds return. Deer are spotted. The hunters sharpen their bows.',
      ],
    },
    summer: {
      summaries: [
        `Heat wave grips ${settlement.name}`,
        `Travelers crowd the roads near ${settlement.name}`,
        `A great tournament is announced in ${settlement.name}`,
        `Drought threatens crops around ${settlement.name}`,
        `Tempers flare in ${settlement.name}'s markets`,
      ],
      details: [
        'Wells run low. Folk sleep outdoors. Work halts in the hottest hours.',
        'The roads are thick with pilgrims, merchants, and less savory types.',
        'Knights and champions gather. Glory awaits. So do broken bones.',
        'The sun beats down without mercy. Prayers for rain go unanswered.',
        'A fistfight breaks out. Old grudges surface in the heat.',
      ],
    },
    autumn: {
      summaries: [
        `The harvest begins in ${settlement.name}`,
        `Ghosts are sighted near ${settlement.name}`,
        `A cold snap catches ${settlement.name} off guard`,
        `Animals gather stores before winter near ${settlement.name}`,
        `The veil thins around ${settlement.name}`,
      ],
      details: [
        'All hands work the fields. The size of the harvest will determine the winter.',
        'The dead do not rest easy as the nights grow long.',
        'Frost comes early. Crops are damaged. Worry sets in.',
        'Bears grow bold. Wolves range far. The wise stay indoors after dark.',
        'Dreams grow strange. Omens multiply. The priests are busy.',
      ],
    },
    winter: {
      summaries: [
        `A blizzard blankets ${settlement.name}`,
        `Supplies run low in ${settlement.name}`,
        `Cabin fever grips ${settlement.name}`,
        `A fire breaks out in ${settlement.name}`,
        `The frozen roads isolate ${settlement.name}`,
      ],
      details: [
        'Snow piles high. Travel is impossible. The world shrinks to four walls.',
        'Rations are cut. The granaries are watched. Theft becomes tempting.',
        'Trapped together, old tensions boil over. A fight erupts.',
        'In the dry winter air, flames spread fast. Buckets form a chain.',
        'No word in or out. What happens in the settlement, stays there.',
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

// Generate festival event
export function festivalEvent(
  rng: Random,
  settlement: Settlement,
  festival: Festival,
  worldTime: Date,
  seed: string,
): LogEntry {
  const FESTIVAL_SCENES = [
    `${festival.name} transforms ${settlement.name}`,
    `${settlement.name} celebrates ${festival.name}`,
    `The spirit of ${festival.name} fills ${settlement.name}`,
  ];

  const CELEBRATION_DETAILS = [
    'Bonfires blaze in the squares, and music fills the night.',
    'Merchants offer festival prices; the air smells of roasting meat.',
    'Children in costume run through the streets, chased by laughter.',
    'The temples are full. The taverns are fuller.',
    'Old grudges are set aside, at least until the morrow.',
    'Travelers are welcomed with unusual warmth.',
  ];

  return {
    category: 'town',
    summary: rng.pick(FESTIVAL_SCENES),
    details: `${festival.description} ${rng.pick(CELEBRATION_DETAILS)}`,
    location: settlement.name,
    worldTime,
    realTime: new Date(),
    seed,
  };
}

// Daily calendar tick - weather changes, festival starts, etc.
export function dailyCalendarTick(
  world: WorldState,
  rng: Random,
  worldTime: Date,
  currentCalendar: CalendarState,
): { logs: LogEntry[]; newCalendar: CalendarState } {
  const logs: LogEntry[] = [];

  // Update calendar to new day
  let { year, month, day } = currentCalendar;
  day += 1;
  if (day > MONTHS[month].days) {
    day = 1;
    month += 1;
    if (month >= 12) {
      month = 0;
      year += 1;

      // New Year event!
      logs.push({
        category: 'town',
        summary: `The new year dawns: Year ${year}`,
        details: 'Church bells ring across the land. A fresh page turns in the chronicle.',
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }

    // New month announcement
    logs.push({
      category: 'town',
      summary: `The month of ${getMonthName(month)} begins`,
      details: `${capitalize(getSeason(month))} ${month < 6 ? 'strengthens its grip' : 'settles over the land'}.`,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }

  // Generate new weather
  const season = getSeason(month);
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

  // Moon phase update
  const newCalendar = getCalendarFromDate(worldTime, newWeather);
  newCalendar.weather = newWeather;

  // Check for festivals
  const festival = getActiveFestival(newCalendar);
  if (festival) {
    newCalendar.activeEffects.festival = festival;

    // First day of festival gets announcements
    if (day === festival.dayStart) {
      for (const settlement of world.settlements) {
        logs.push(festivalEvent(rng, settlement, festival, worldTime, world.seed));

        // Apply festival mood bonus
        if (festival.effects.moodBonus) {
          settlement.mood = Math.min(3, settlement.mood + festival.effects.moodBonus);
        }
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
  const prevSeason = getSeason((month - 1 + 12) % 12);
  if (day === 1 && season !== prevSeason) {
    logs.push({
      category: 'weather',
      summary: `${capitalize(season)} arrives`,
      details: getSeasonTransitionNarrative(rng, season, prevSeason),
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
      'The snows melt. Rivers swell. Green returns to the land.',
      'Birds return from the south. The first flowers bloom. Hope stirs.',
      'The earth awakens from its frozen slumber. Life begins anew.',
      'Farmers eye their fields with anticipation. The planting season approaches.',
    ],
    summer: [
      'The days grow long and hot. The roads dry. Travelers multiply.',
      'The sun reigns supreme. Crops grow tall. So do tempers.',
      'Campaign season begins. Armies stir. Diplomacy falters.',
      'The heat settles in. Work shifts to dawn and dusk. Midday belongs to shade.',
    ],
    autumn: [
      'The leaves turn. The harvest begins. Winter preparations commence.',
      'The days shorten. The nights grow teeth. The veil thins.',
      'Granaries fill. Woodpiles grow. The wise prepare for the cold.',
      'Animals fatten. Hunters range far. The land offers its bounty—and its dangers.',
    ],
    winter: [
      'The first frost arrives. The land hardens. The cold settles in.',
      'Snow blankets the world. Roads close. Communities turn inward.',
      'The long nights begin. Fires become precious. Stories pass the time.',
      'The world sleeps under white. Only the desperate or the bold venture far.',
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

