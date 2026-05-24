// All event types now live in the published `doc-memory-core` package.
// This re-export keeps every internal doc-memory import (`from "./types.js"`)
// working unchanged.
export type {
  BaseEvent,
  DocumentIndexedEvent,
  DocumentDeletedEvent,
  ChatIndexedEvent,
  DocMemoryEvent,
  EventHandler,
} from "doc-memory-core";
