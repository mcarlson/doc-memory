# doc-memory-core

Shared, types-only event + summary contract for the **doc-memory plugin ecosystem**.

Two type clusters share this publish line:

- **doc-memory events** — `EventBus`, `BaseEvent`, `DocumentIndexedEvent`, `DocumentDeletedEvent`, `ChatIndexedEvent`, `DocMemoryEvent`, `EventHandler`. Produced by `doc-memory`; consumed by plugins.
- **5W+H summary shape** — `RelevanceLevel`, `Person`, `DateEvent`, `Amount`, `Summary5WH`, `SummaryCreatedEvent`. Produced by `5w-summarizer`; consumed by `project-summarizer`. doc-memory itself does not consume these — they ride this publish for ecosystem-wide single-sourcing.

Zero runtime dependencies; `sideEffects: false`; `import type` only.
