import { BusEvent } from './types.ts';

type Handler<K extends BusEvent['kind']> = (event: Extract<BusEvent, { kind: K }>) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<BusEvent['kind'], Set<Handler<BusEvent['kind']>>>();

  subscribe<K extends BusEvent['kind']>(kind: K, handler: Handler<K>): () => void {
    const set = this.handlers.get(kind) ?? new Set();
    set.add(handler as Handler<BusEvent['kind']>);
    this.handlers.set(kind, set);
    return () => {
      const current = this.handlers.get(kind);
      current?.delete(handler as Handler<BusEvent['kind']>);
    };
  }

  publish(event: BusEvent): void {
    const set = this.handlers.get(event.kind);
    if (!set) return;
    for (const handler of set) {
      try {
        const result = handler(event as never);
        if (result instanceof Promise) {
          // Fire and forget async handlers
          result.catch(error => console.error(`Async error in event handler for ${event.kind}:`, error));
        }
      } catch (error) {
        console.error(`Error in event handler for ${event.kind}:`, error);
      }
    }
  }
}

