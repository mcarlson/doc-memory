/** Any event with a type discriminator. Plugins extend this via structural typing. */
export interface BaseEvent {
  type: string;
  // `unknown` (not `any`): extra fields are allowed for extensibility, but
  // consumers must narrow to a concrete event type (via `on<T>`) before use.
  [key: string]: unknown;
}

export interface DocumentIndexedEvent {
  type: "document:indexed";
  docId: string;
  projectId?: string;
  filename: string;
  contentHash: string;
  chunkCount: number;
  content: string;
}

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

export type DocMemoryEvent =
  | DocumentIndexedEvent
  | DocumentDeletedEvent
  | ChatIndexedEvent;

export type EventHandler<T extends BaseEvent = BaseEvent> = (
  event: T,
) => Promise<void>;
