import { EventBus } from './events.ts';
import { SimConfig } from './config.ts';
import { TickEvent } from './types.ts';
import { WorldState } from './types.ts';

export class Scheduler {
  private interval: ReturnType<typeof setInterval> | undefined;
  private turnIndex = 0;
  private readonly turnIntervalMs: number;
  private readonly startRealTime: Date;
  private readonly startWorldTime: Date;

  constructor(
    private readonly bus: EventBus, 
    private readonly config: SimConfig,
    private readonly world: WorldState
  ) {
    this.turnIntervalMs = this.config.msPerWorldMinute * this.config.turnMinutes;
    
    // For 1:1 time: world time = startWorldTime + (realTime - startRealTime)
    // Use lastTickAt as the starting world time, or startWorldTime if not set
    this.startWorldTime = world.lastTickAt 
      ? new Date(world.lastTickAt)
      : new Date(config.startWorldTime);
    
    // Use lastRealTickAt as the starting real time, or world.startedAt if not set
    // This ensures 1:1 mapping: world time advances at same rate as real time
    const lastRealTickAt = (world as any).lastRealTickAt;
    this.startRealTime = lastRealTickAt 
      ? new Date(lastRealTickAt)
      : new Date(world.startedAt);
    
    // Calculate initial turnIndex based on how much world time has passed
    const worldTimeElapsedMs = this.startWorldTime.getTime() - config.startWorldTime.getTime();
    const turnMs = config.turnMinutes * 60 * 1000;
    this.turnIndex = Math.floor(worldTimeElapsedMs / turnMs);
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => this.emitTurn(), this.turnIntervalMs);
  }

  stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = undefined;
  }

  private emitTurn(): void {
    this.turnIndex += 1;
    
    // For 1:1 time: world time = startWorldTime + (current real time - startRealTime)
    const now = new Date();
    const realTimeElapsedMs = now.getTime() - this.startRealTime.getTime();
    const worldTime = new Date(this.startWorldTime.getTime() + realTimeElapsedMs);

    const tick: TickEvent = { kind: 'turn', worldTime, turnIndex: this.turnIndex };
    this.bus.publish(tick);

    if (this.turnIndex % this.config.hourTurns === 0) {
      this.bus.publish({ ...tick, kind: 'hour' });
    }
    if (this.turnIndex % (this.config.hourTurns * this.config.dayHours) === 0) {
      this.bus.publish({ ...tick, kind: 'day' });
    }
  }
}
