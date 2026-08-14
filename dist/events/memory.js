export class MemoryEventBus {
    handlers = new Map();
    async emit(event) {
        const handlers = this.handlers.get(event.type);
        if (!handlers)
            return;
        for (const handler of handlers) {
            try {
                await handler(event);
            }
            catch (err) {
                console.error(`Event handler error for ${event.type}:`, err);
            }
        }
    }
    on(type, handler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type).add(handler);
    }
    off(type, handler) {
        this.handlers.get(type)?.delete(handler);
    }
}
