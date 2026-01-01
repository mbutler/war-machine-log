import { EventBus } from './events.ts';
import { SimConfig } from './config.ts';
import { TickEvent } from './types.ts';

export class Scheduler {
  private interval: ReturnType<typeof setInterval> | undefined;
  private turnIndex = 0;
  private readonly turnIntervalMs: number;

  constructor(private readonly bus: EventBus, private readonly config: SimConfig) {
    this.turnIntervalMs = this.config.msPerWorldMinute * this.config.turnMinutes;
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
    const worldTime = new Date(
      this.config.startWorldTime.getTime() + this.turnIndex * this.config.turnMinutes * 60_000,
    );

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

