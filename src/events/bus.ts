import type { BaseEvent, EventHandler } from "./types.js";

export interface EventBus {
  emit(event: BaseEvent): Promise<void>;
  on<T extends BaseEvent>(type: T["type"], handler: EventHandler<T>): void;
  off<T extends BaseEvent>(type: T["type"], handler: EventHandler<T>): void;
}
