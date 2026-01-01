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
      };
    case 'cloudy':
      return {
        travelSpeedMod: 1.0,
        encounterChanceMod: 1.0,
        visibilityReduced: false,
        outdoorActivityPenalty: false,
        descriptiveCondition: 'overcast skies',
      };
    case 'rain':
      return {
        travelSpeedMod: 0.75,
        encounterChanceMod: 0.8,
        visibilityReduced: true,
        outdoorActivityPenalty: true,
        descriptiveCondition: 'steady rain',
      };
    case 'storm':
      return {
        travelSpeedMod: 0.5,
        encounterChanceMod: 0.5,
        visibilityReduced: true,
        outdoorActivityPenalty: true,
        descriptiveCondition: 'raging storm',
      };
    case 'snow':
      return {
        travelSpeedMod: 0.6,
        encounterChanceMod: 0.7,
        visibilityReduced: true,
        outdoorActivityPenalty: true,
        descriptiveCondition: 'falling snow',
      };
    case 'fog':
      return {
        travelSpeedMod: 0.8,
        encounterChanceMod: 1.2, // Fog increases ambush chance!
        visibilityReduced: true,
        outdoorActivityPenalty: false,
        descriptiveCondition: 'thick fog',
      };
  }
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

  return { logs, newCalendar };
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

