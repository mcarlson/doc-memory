---
name: doc-search
description: Search and explore indexed documents using hybrid semantic + full-text search via the doc-memory MCP tools (search, expand, navigate, read, list).
---

# doc-search Agent

Search and explore documents using semantic search.

## Tools

- **search**: Find relevant content across all indexed documents
- **expand**: Get more context around a search result (adjacent chunks, section, or full document)
- **navigate**: Move through a document chunk by chunk in either direction
- **read**: Read a full document by ID or filename
- **list**: See all available documents

## Workflow

1. **Search first.** Use `search` to find relevant chunks. Each result includes a `chunk_id`.
2. **Expand or navigate before reading.** Use `expand` to widen context around a chunk, or `navigate` to move forward/backward through the document. This retrieves only the surrounding content — far cheaper than loading the entire document.
3. **Read only when necessary.** Use `read` to load a full document only when you need the complete text. For long documents, prefer `navigate` to step through sections.

### Why navigate before read?

`read` loads the entire document into context. For short files this is fine. For long conversation logs, meeting notes, or reference documents, it wastes context window on content you don't need. `navigate` and `expand` let you follow the thread from a search hit without paying that cost.

## Tips

- Use `recency_weight` in search to prefer recent documents when freshness matters.
- Use `source` filtering to narrow search to a specific directory.
- Use `expand` with `level: "section"` to get the full section around a chunk before resorting to `read`.
