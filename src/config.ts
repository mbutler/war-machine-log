import { SimContext } from './types.ts';

const BASE_MS_PER_WORLD_MINUTE = 60_000; // 1 real minute per in-world minute at timeScale 1

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export interface SimConfig extends SimContext {
  timeScale: number; // multiplier: 1 = 1:1; 60 = 1 real sec = 1 world minute
  msPerWorldMinute: number; // derived real milliseconds per world minute (already includes timeScale)
  turnMinutes: number;
  hourTurns: number;
  dayHours: number;
  logDir: string;
}

export function loadConfig(): SimConfig {
  const timeScale = parseNumber(process.env.SIM_TIME_SCALE, 1);
  const msPerWorldMinute = Math.max(10, Math.floor(BASE_MS_PER_WORLD_MINUTE / timeScale));
  const turnMinutes = 10;
  const hourTurns = 6; // 6 turns = 1 hour
  const dayHours = 24;

  const startWorldTime =
    process.env.SIM_START_WORLD_TIME && !Number.isNaN(Date.parse(process.env.SIM_START_WORLD_TIME))
      ? new Date(process.env.SIM_START_WORLD_TIME)
      : new Date();

  return {
    timeScale,
    msPerWorldMinute,
    turnMinutes,
    hourTurns,
    dayHours,
    logDir: process.env.SIM_LOG_DIR ?? 'logs',
    seed: process.env.SIM_SEED ?? 'default-seed',
    startWorldTime,
  };
}

export const config = loadConfig();

