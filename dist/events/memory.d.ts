import type { EventBus } from './bus.js';
import type { BaseEvent, EventHandler } from './types.js';
export declare class MemoryEventBus implements EventBus {
    private handlers;
    emit(event: BaseEvent): Promise<void>;
    on<T extends BaseEvent>(type: T['type'], handler: EventHandler<T>): void;
    off<T extends BaseEvent>(type: T['type'], handler: EventHandler<T>): void;
}
//# sourceMappingURL=memory.d.ts.map