import { describe, it, expectTypeOf } from "vitest";
import type {
  BaseEvent,
  EventBus,
  EventHandler,
  DocumentIndexedEvent,
  DocumentIndexedPayload,
  ChatIndexedEvent,
  ChatIndexedPayload,
  DocMemoryEvent,
  RelevanceLevel,
  Person,
  Summary5WH,
  SummaryCreatedEvent,
} from "./index.js";

describe("doc-memory-core type surface", () => {
  it("Payload aliases equal their canonical Event types", () => {
    expectTypeOf<DocumentIndexedPayload>().toEqualTypeOf<DocumentIndexedEvent>();
    expectTypeOf<ChatIndexedPayload>().toEqualTypeOf<ChatIndexedEvent>();
  });

  it("DocMemoryEvent unions the three concrete events", () => {
    expectTypeOf<DocMemoryEvent>().toMatchTypeOf<BaseEvent>();
    const e: DocMemoryEvent = {
      type: "document:indexed",
      docId: "d",
      filename: "f",
      contentHash: "h",
      chunkCount: 0,
      content: "",
    };
    expectTypeOf(e).toMatchTypeOf<DocMemoryEvent>();
  });

  it("SummaryCreatedEvent.summary is Summary5WH", () => {
    expectTypeOf<SummaryCreatedEvent["summary"]>().toEqualTypeOf<Summary5WH>();
  });

  it("RelevanceLevel is the three literals only", () => {
    expectTypeOf<RelevanceLevel>().toEqualTypeOf<"HIGH" | "MED" | "LOW">();
  });

  it("EventBus is callable with a literal event type + concrete handler", () => {
    // Compile-time check: this is the shape the plugins use.
    type DocHandler = (event: DocumentIndexedEvent) => Promise<void>;
    expectTypeOf<EventBus["on"]>().parameter(1).toMatchTypeOf<DocHandler>();
  });

  it("EventHandler<T> default narrows to BaseEvent", () => {
    expectTypeOf<EventHandler>().toEqualTypeOf<(event: BaseEvent) => Promise<void>>();
    expectTypeOf<EventHandler<DocumentIndexedEvent>>().toEqualTypeOf<(event: DocumentIndexedEvent) => Promise<void>>();
  });

  it("Person is the smallest expected shape", () => {
    expectTypeOf<Person>().toEqualTypeOf<{ name: string; role: string }>();
  });
});
