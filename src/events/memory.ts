import type { EventBus } from './bus.js';
import type { BaseEvent, EventHandler } from './types.js';

export class MemoryEventBus implements EventBus {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  async emit(event: BaseEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (err) {
        console.error(`Event handler error for ${event.type}:`, err);
      }
    }
  }

  on<T extends BaseEvent>(type: T['type'], handler: EventHandler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);
  }

  off<T extends BaseEvent>(type: T['type'], handler: EventHandler<T>): void {
    this.handlers.get(type)?.delete(handler as EventHandler);
  }
}
