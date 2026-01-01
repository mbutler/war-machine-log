import { FEMALE_NAMES, MALE_NAMES } from '../data/names.ts';
import { PLACES } from '../data/places.ts';
import { Random } from './rng.ts';

export type Gender = 'female' | 'male' | 'any';

export function randomName(rng: Random, gender: Gender = 'any'): string {
  if (gender === 'female') return rng.pick(FEMALE_NAMES);
  if (gender === 'male') return rng.pick(MALE_NAMES);
  return rng.pick(rng.chance(0.5) ? FEMALE_NAMES : MALE_NAMES);
}

export function randomPlace(rng: Random): string {
  return rng.pick(PLACES);
}

