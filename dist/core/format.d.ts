import type { SearchResult, Document } from "../types.js";
/** Render hybrid-search hits as a numbered, source-labelled text block. */
export declare function formatSearchResults(results: SearchResult[]): string;
/** "Pages X-Y" for a real range, or "Unknown pages" when none is available. */
export declare function formatPageRange(range?: [number, number]): string;
/** Render the indexed-document listing. */
export declare function formatDocumentList(docs: Document[]): string;
/**
 * Turn an arbitrary thrown value into a concise, client-safe message for an
 * MCP `isError` tool result. ZodErrors become a readable invalid-arguments
 * summary rather than a multiline stack dump.
 */
export declare function formatErrorMessage(err: unknown): string;
//# sourceMappingURL=format.d.ts.map