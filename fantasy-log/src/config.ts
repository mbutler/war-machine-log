import { SimContext } from './types.ts';

/**
 * Configuration for the BECMI Real-Time Simulator
 * 
 * Time Model:
 * - turnMinutes: Each tick represents 10 minutes of world time (BECMI standard)
 * - catchUpSpeed: How fast to simulate when catching up (turns per second)
 * - batchDays: If set, run batch mode for this many days then exit
 * 
 * The simulation always advances world time by turnMinutes per tick.
 * The only question is how fast (real-time = 1 tick per 10 real minutes,
 * catch-up/batch = many ticks per second).
 */

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export interface SimConfig extends SimContext {
  // Time parameters
  turnMinutes: number;      // World time per tick (always 10 for BECMI)
  turnsPerHour: number;     // 6 turns = 1 hour
  turnsPerDay: number;      // 144 turns = 1 day
  
  // Catch-up parameters
  catchUpSpeed: number;     // Turns per second during catch-up (0 = max speed)
  maxCatchUpDays: number;   // Maximum days to catch up (safety limit)
  
  // Batch mode
  batchDays: number | null; // If set, run this many days at max speed then exit
  
  // Logging
  logDir: string;
}

export function loadConfig(): SimConfig {
  const turnMinutes = 10;
  const turnsPerHour = 6;
  const turnsPerDay = 144;

  // Parse start world time (defaults to current time if not specified)
  const startWorldTime =
    process.env.SIM_START_WORLD_TIME && !Number.isNaN(Date.parse(process.env.SIM_START_WORLD_TIME))
      ? new Date(process.env.SIM_START_WORLD_TIME)
      : new Date();

  // Batch mode: run N days at max speed then exit
  const batchDaysEnv = process.env.SIM_BATCH_DAYS;
  const batchDays = batchDaysEnv ? parseNumber(batchDaysEnv, 0) : null;

  return {
    // Time
    turnMinutes,
    turnsPerHour,
    turnsPerDay,
    
    // Catch-up
    catchUpSpeed: parseNumber(process.env.SIM_CATCH_UP_SPEED, 100), // Default: 100 turns/sec
    maxCatchUpDays: parseNumber(process.env.SIM_MAX_CATCH_UP_DAYS, 30), // Default: 30 days max
    
    // Batch
    batchDays,
    
    // Logging
    logDir: process.env.SIM_LOG_DIR ?? 'logs',
    
    // Context (from SimContext)
    seed: process.env.SIM_SEED ?? 'default-seed',
    startWorldTime,
  };
}

export const config = loadConfig();
