import { describe, it, expectTypeOf } from "vitest";
import type {
  Amount,
  BaseEvent,
  ChatIndexedEvent,
  ChatIndexedPayload,
  DateEvent,
  DocMemoryEvent,
  DocumentDeletedEvent,
  DocumentIndexedEvent,
  DocumentIndexedPayload,
  EventBus,
  EventHandler,
  Person,
  RelevanceLevel,
  Summary5WH,
  SummaryCreatedEvent,
} from "./index.js";

// Literal-shape pins for every published interface. Using toEqualTypeOf with
// an inline object literal — NOT a derived equality against the type itself —
// so removing a field from the contract surface fails the matching test even
// when both sides would otherwise change together.

describe("doc-memory-core type surface", () => {
  it("BaseEvent has type discriminator + open index", () => {
    expectTypeOf<BaseEvent>().toEqualTypeOf<{
      type: string;
      [key: string]: any;
    }>();
  });

  it("DocumentIndexedEvent locks its exact field shape", () => {
    expectTypeOf<DocumentIndexedEvent>().toEqualTypeOf<{
      type: "document:indexed";
      docId: string;
      projectId?: string;
      filename: string;
      contentHash: string;
      chunkCount: number;
      content: string;
    }>();
  });

  it("DocumentDeletedEvent locks its exact field shape", () => {
    expectTypeOf<DocumentDeletedEvent>().toEqualTypeOf<{
      type: "document:deleted";
      docId: string;
      projectId?: string;
      filename: string;
    }>();
  });

  it("ChatIndexedEvent locks its exact field shape", () => {
    expectTypeOf<ChatIndexedEvent>().toEqualTypeOf<{
      type: "chat:indexed";
      messageId: string;
      projectId?: string;
      threadId: string;
      role: "user" | "assistant";
      content: string;
    }>();
  });

  it("Payload aliases equal their canonical Event types", () => {
    expectTypeOf<DocumentIndexedPayload>().toEqualTypeOf<DocumentIndexedEvent>();
    expectTypeOf<ChatIndexedPayload>().toEqualTypeOf<ChatIndexedEvent>();
  });

  it("DocMemoryEvent unions the three concrete events", () => {
    expectTypeOf<DocMemoryEvent>().toEqualTypeOf<
      DocumentIndexedEvent | DocumentDeletedEvent | ChatIndexedEvent
    >();
    expectTypeOf<DocMemoryEvent>().toMatchTypeOf<BaseEvent>();
  });

  it("RelevanceLevel is the three literals only", () => {
    expectTypeOf<RelevanceLevel>().toEqualTypeOf<"HIGH" | "MED" | "LOW">();
  });

  it("Person locks name + role", () => {
    expectTypeOf<Person>().toEqualTypeOf<{ name: string; role: string }>();
  });

  it("DateEvent locks date + event", () => {
    expectTypeOf<DateEvent>().toEqualTypeOf<{ date: string; event: string }>();
  });

  it("Amount locks amount + optional unit + description", () => {
    expectTypeOf<Amount>().toEqualTypeOf<{
      amount: string;
      unit?: string;
      description: string;
    }>();
  });

  it("Summary5WH locks its exact field shape", () => {
    expectTypeOf<Summary5WH>().toEqualTypeOf<{
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
    }>();
  });

  it("SummaryCreatedEvent locks its exact field shape", () => {
    expectTypeOf<SummaryCreatedEvent>().toEqualTypeOf<{
      type: "summary:created";
      docId: string;
      projectId?: string;
      summary: Summary5WH;
    }>();
  });

  it("EventBus locks the loose three-method shape", () => {
    expectTypeOf<EventBus>().toEqualTypeOf<{
      emit(event: { type: string; [key: string]: any }): Promise<void>;
      on(type: string, handler: (event: any) => Promise<void>): void;
      off(type: string, handler: (event: any) => Promise<void>): void;
    }>();
  });

  it("EventHandler<T> default narrows to BaseEvent", () => {
    expectTypeOf<EventHandler>().toEqualTypeOf<(event: BaseEvent) => Promise<void>>();
    expectTypeOf<EventHandler<DocumentIndexedEvent>>().toEqualTypeOf<
      (event: DocumentIndexedEvent) => Promise<void>
    >();
  });
});
