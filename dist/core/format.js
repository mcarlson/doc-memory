import { ZodError } from "zod";
/** Render hybrid-search hits as a numbered, source-labelled text block. */
export function formatSearchResults(results) {
    if (results.length === 0)
        return "No results found.";
    return results
        .map((r, i) => {
        const sources = [];
        if (r.sources.fts)
            sources.push(`FTS:#${r.sources.fts}`);
        if (r.sources.vector)
            sources.push(`Vec:#${r.sources.vector}`);
        return `[${i + 1}] ${r.filename} (chunk ${r.chunkIndex}) [${sources.join(", ")}]\n${r.content.slice(0, 300)}...`;
    })
        .join("\n\n");
}
/** "Pages X-Y" for a real range, or "Unknown pages" when none is available. */
export function formatPageRange(range) {
    return range ? `Pages ${range[0]}-${range[1]}` : "Unknown pages";
}
/** Render the indexed-document listing. */
export function formatDocumentList(docs) {
    if (docs.length === 0)
        return "No documents indexed.";
    const lines = docs.map((d) => `- ${d.filename} (${d.source}, indexed ${d.indexedAt.toISOString().split("T")[0]})`);
    return `# Indexed Documents (${docs.length})\n\n${lines.join("\n")}`;
}
/**
 * Turn an arbitrary thrown value into a concise, client-safe message for an
 * MCP `isError` tool result. ZodErrors become a readable invalid-arguments
 * summary rather than a multiline stack dump.
 */
export function formatErrorMessage(err) {
    if (err instanceof ZodError) {
        const detail = err.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ");
        return `Invalid arguments: ${detail}`;
    }
    if (err instanceof Error)
        return err.message;
    return String(err);
}
