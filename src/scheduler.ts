import { EventBus } from './events.ts';
import { SimConfig } from './config.ts';
import { TickEvent } from './types.ts';

/**
 * Scheduler for the BECMI Real-Time Simulator
 * 
 * Time Model:
 * - World time is always derived from lastTickAt + (ticks × 10 minutes)
 * - In real-time mode: tick only when world time < real time
 * - In catch-up mode: tick rapidly until world time >= target time
 * - In batch mode: tick rapidly to a specific target date, then exit
 * 
 * The scheduler never calculates world time from elapsed real time.
 * World time advances discretely, one tick at a time.
 */

export interface SchedulerCallbacks {
  onTurn: (event: TickEvent) => Promise<void>;
  onHour: (event: TickEvent) => Promise<void>;
  onDay: (event: TickEvent) => Promise<void>;
  onTickComplete: (worldTime: Date) => Promise<void>;
}

export interface SchedulerState {
  lastTickAt: Date;        // Last simulated world time
  startWorldTime: Date;    // When the world began (for turnIndex calculation)
}

export class Scheduler {
  private running = false;
  private readonly turnMs = 10 * 60 * 1000; // 10 minutes in milliseconds
  private readonly turnsPerHour = 6;        // 6 turns = 1 hour
  private readonly turnsPerDay = 144;       // 144 turns = 24 hours

  constructor(
    private readonly callbacks: SchedulerCallbacks,
    private readonly config: SimConfig,
    private state: SchedulerState
  ) {}

  /**
   * Get the current world time (last tick + 0, since we tick at the END of each period)
   */
  get currentWorldTime(): Date {
    return new Date(this.state.lastTickAt);
  }

  /**
   * Calculate turnIndex from world time (for hour/day boundary detection)
   * This is the number of turns since the world began
   */
  private getTurnIndex(worldTime: Date): number {
    const elapsed = worldTime.getTime() - this.state.startWorldTime.getTime();
    return Math.floor(elapsed / this.turnMs);
  }

  /**
   * Execute a single tick at the given world time
   * This is the core simulation step - completely synchronous from the scheduler's perspective
   */
  private async executeTick(worldTime: Date): Promise<void> {
    const turnIndex = this.getTurnIndex(worldTime);
    const tick: TickEvent = { kind: 'turn', worldTime, turnIndex };

    // Always execute turn tick
    await this.callbacks.onTurn(tick);

    // Check for hour boundary (every 6 turns)
    // We use turnIndex + 1 because we want to fire at the END of hours, not the start
    // e.g., turn 6 completes the first hour, turn 12 completes the second hour
    if ((turnIndex + 1) % this.turnsPerHour === 0) {
      await this.callbacks.onHour({ ...tick, kind: 'hour' });
    }

    // Check for day boundary (every 144 turns)
    if ((turnIndex + 1) % this.turnsPerDay === 0) {
      await this.callbacks.onDay({ ...tick, kind: 'day' });
    }

    // Update state - world time has advanced
    this.state.lastTickAt = worldTime;
    
    // Notify that tick is complete (for saving state)
    await this.callbacks.onTickComplete(worldTime);
  }

  /**
   * Advance world time by one tick (10 minutes)
   */
  private nextTickTime(): Date {
    return new Date(this.state.lastTickAt.getTime() + this.turnMs);
  }

  /**
   * Catch up from current world time to target time
   * Used for both resuming after downtime and batch mode
   * 
   * @param targetTime - The time to catch up to
   * @param speedTurnsPerSecond - How fast to simulate (0 = as fast as possible)
   * @param onProgress - Optional callback for progress updates
   */
  async catchUpTo(
    targetTime: Date,
    speedTurnsPerSecond: number = 0,
    onProgress?: (current: Date, target: Date, turnsDone: number, turnsTotal: number) => void
  ): Promise<void> {
    const startTime = this.state.lastTickAt;
    const totalTurns = Math.floor((targetTime.getTime() - startTime.getTime()) / this.turnMs);
    
    if (totalTurns <= 0) {
      return; // Already caught up
    }

    const delayMs = speedTurnsPerSecond > 0 ? 1000 / speedTurnsPerSecond : 0;
    let turnsDone = 0;

    while (this.state.lastTickAt.getTime() < targetTime.getTime()) {
      const nextTime = this.nextTickTime();
      
      // Don't overshoot target
      if (nextTime.getTime() > targetTime.getTime()) {
        break;
      }

      await this.executeTick(nextTime);
      turnsDone++;

      // Progress callback
      if (onProgress && turnsDone % 100 === 0) {
        onProgress(this.state.lastTickAt, targetTime, turnsDone, totalTurns);
      }

      // Delay for pacing (if not running at max speed)
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    if (onProgress) {
      onProgress(this.state.lastTickAt, targetTime, turnsDone, totalTurns);
    }
  }

  /**
   * Run in real-time mode: tick whenever world time falls behind real time
   * This is the main loop for continuous operation
   */
  async runRealTime(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(`⏱️  Starting real-time simulation at ${this.state.lastTickAt.toISOString()}`);

    while (this.running) {
      const now = new Date();
      const nextTickAt = this.nextTickTime();

      if (nextTickAt.getTime() <= now.getTime()) {
        // World time is behind real time - execute a tick
        await this.executeTick(nextTickAt);
      } else {
        // World time is caught up - wait until next tick is due
        const waitMs = nextTickAt.getTime() - now.getTime();
        // Cap wait time to avoid issues with system clock changes
        const cappedWaitMs = Math.min(waitMs, this.turnMs);
        await new Promise(resolve => setTimeout(resolve, cappedWaitMs));
      }
    }
  }

  /**
   * Stop the real-time loop
   */
  stop(): void {
    this.running = false;
    console.log(`⏹️  Stopping real-time simulation at ${this.state.lastTickAt.toISOString()}`);
  }

  /**
   * Update the scheduler's state (e.g., after loading a new world)
   */
  updateState(newState: SchedulerState): void {
    this.state = newState;
  }
}
