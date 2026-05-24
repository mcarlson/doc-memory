// Public type surface for the doc-memory plugin ecosystem.
// Types-only, zero runtime dependencies.

// ── EventBus ────────────────────────────────────────────────────────────────
// LOOSE shape: matches what plugins (5w-summarizer, project-summarizer) call
// today. doc-memory's MemoryEventBus implementation satisfies this trivially
// (an implementation can be stricter than the interface requires).
export interface BaseEvent {
  type: string;
  // `any` here mirrors the existing plugin EventBus copies — tightening to
  // `unknown` would force narrowing at every property read across every
  // subscriber call site. Deferred to a future contract major version.
  [key: string]: any;
}

export type EventHandler<T extends BaseEvent = BaseEvent> = (event: T) => Promise<void>;

export interface EventBus {
  emit(event: { type: string; [key: string]: any }): Promise<void>;
  on(type: string, handler: (event: any) => Promise<void>): void;
  off(type: string, handler: (event: any) => Promise<void>): void;
}

// ── doc-memory events ───────────────────────────────────────────────────────
// Canonical `…Event` names are exported with `…Payload` ALIASES so plugin call
// sites currently using `DocumentIndexedPayload` / `ChatIndexedPayload` compile
// unchanged. Aliases slated for removal in a future contract major.

export interface DocumentIndexedEvent {
  type: "document:indexed";
  docId: string;
  projectId?: string;
  filename: string;
  contentHash: string;
  chunkCount: number;
  content: string;
}
export type DocumentIndexedPayload = DocumentIndexedEvent;

export interface DocumentDeletedEvent {
  type: "document:deleted";
  docId: string;
  projectId?: string;
  filename: string;
}

export interface ChatIndexedEvent {
  type: "chat:indexed";
  messageId: string;
  projectId?: string;
  threadId: string;
  role: "user" | "assistant";
  content: string;
}
export type ChatIndexedPayload = ChatIndexedEvent;

export type DocMemoryEvent =
  | DocumentIndexedEvent
  | DocumentDeletedEvent
  | ChatIndexedEvent;

// ── 5W+H summary shape ──────────────────────────────────────────────────────
// Produced by 5w-summarizer, consumed by project-summarizer. doc-memory itself
// does not produce or consume these — they ride this publish for one-package
// simplicity (zero runtime cost; surface noise documented in README).

export type RelevanceLevel = "HIGH" | "MED" | "LOW";

export interface Person {
  name: string;
  role: string;
}

export interface DateEvent {
  date: string;
  event: string;
}

export interface Amount {
  amount: string;
  unit?: string;
  description: string;
}

export interface Summary5WH {
  docId: string;
  projectId?: string;
  type: string;
  relevance: RelevanceLevel;
  who: Person[];
  what: string[];
  when: DateEvent[];
  where: string[];
  why: string;
  howMuch: Amount[];
  extractedAt: string;
}

export interface SummaryCreatedEvent {
  type: "summary:created";
  docId: string;
  projectId?: string;
  summary: Summary5WH;
}
