# doc-memory

Semantic search MCP server for documents and chat history. Indexes files, chunks text with semantic boundary detection, generates embeddings, and exposes hybrid search (FTS + vector) via the Model Context Protocol.

## Overview

doc-memory watches directories for document changes, indexes content into SQLite (local) or PostgreSQL/Supabase (production), and serves results through an MCP server that Claude can query directly. It combines full-text search with vector similarity using Reciprocal Rank Fusion for high-quality results.

## Use Cases

### Search Claude Code conversation history

Index your Claude Code conversation JSONL files so Claude can recall past decisions, solutions, and context across sessions:

```json
{
  "env": {
    "DOC_MEMORY_WATCH": "~/.claude/projects:*.jsonl"
  }
}
```

### Watch local project documentation

Keep a docs folder indexed so Claude always has current context about your project's architecture, decisions, and plans:

```json
{
  "env": {
    "DOC_MEMORY_WATCH": "~/myproject/docs:**/*.md,~/myproject/CLAUDE.md"
  }
}
```

### Index research and reference material

Point doc-memory at folders of notes and articles. New files are indexed automatically as you add them:

```json
{
  "env": {
    "DOC_MEMORY_WATCH": "~/research:**/*.md,~/notes:**/*.txt"
  }
}
```

> **Note:** Only text-based files are supported (`.md`, `.txt`, `.jsonl`, etc.). PDF and DOCX extraction is not yet implemented.

### Shared team knowledge base (Supabase)

Connect to a Supabase project so multiple team members search the same indexed documents:

```json
{
  "env": {
    "DOC_MEMORY_STORAGE": "postgres",
    "SUPABASE_URL": "https://your-project.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "your-key"
  }
}
```

### Multiple sources at once

Watch several directories with different glob patterns in a single config. Each path:glob pair is comma-separated:

```json
{
  "env": {
    "DOC_MEMORY_WATCH": "~/.claude/projects:*.jsonl,~/notes:**/*.md,~/work/docs:**/*.{md,txt}"
  }
}
```

## Components

| Name | Type | Description |
|------|------|-------------|
| `search` | MCP Tool | Hybrid FTS + vector search across indexed documents |
| `read` | MCP Tool | Read full document content by ID or filename |
| `expand` | MCP Tool | Expand context around a search result chunk |
| `list` | MCP Tool | List all indexed documents |
| `navigate` | MCP Tool | Move through a document chunk by chunk |
| `doc-search` | Agent | Search and explore documents using semantic search |

## Tools

- **search** - Hybrid search (FTS + vector) across indexed documents
  - `query` (string, required): Search query
  - `limit` (number, optional): Max results (default: 10)
  - `source` (string, optional): Filter by source
  - `recency_weight` (number, optional): Weight for recency boost (0-1)
  - `recency_half_life` (number, optional): Days until recency boost halves

- **read** - Read full document by ID or filename
  - `id` (string, optional): Document ID
  - `filename` (string, optional): Document filename

- **expand** - Expand context around a chunk
  - `chunk_id` (string, required): Chunk ID to expand
  - `level` (string, optional): Expansion level — `adjacent`, `section`, or `full` (default: `adjacent`)

- **list** - List indexed documents
  - `source` (string, optional): Filter by source

- **navigate** - Get next/previous chunks from current position
  - `chunk_id` (string, required): Current chunk ID
  - `direction` (string, required): `next` or `prev`
  - `count` (number, optional): Number of chunks (default: 1)

## Installation

### As a Claude Code plugin

```bash
claude plugin install /path/to/doc-memory
```

### As an npm dependency

```bash
npm install @fairgo/doc-memory
```

Or reference a local checkout in your `package.json`:

```json
{
  "dependencies": {
    "@fairgo/doc-memory": "file:../../doc-memory"
  }
}
```

### Manual MCP configuration

Add to your Claude Code MCP settings or `claude_desktop_config.json`:

**Minimal (SQLite + local embeddings, zero-config):**

```json
{
  "mcpServers": {
    "doc-memory": {
      "command": "node",
      "args": ["/path/to/doc-memory/cli/mcp-server-wrapper.js"]
    }
  }
}
```

**SQLite + Python embeddings (higher quality):**

```json
{
  "mcpServers": {
    "doc-memory": {
      "command": "node",
      "args": ["/path/to/doc-memory/cli/mcp-server-wrapper.js"],
      "env": {
        "PYTHON_SERVICE_URL": "http://localhost:8000"
      }
    }
  }
}
```

**PostgreSQL / Supabase:**

```json
{
  "mcpServers": {
    "doc-memory": {
      "command": "node",
      "args": ["/path/to/doc-memory/cli/mcp-server-wrapper.js"],
      "env": {
        "DOC_MEMORY_STORAGE": "postgres",
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key"
      }
    }
  }
}
```

> **Note:** Postgres mode requires `@supabase/supabase-js` to be installed (`npm install @supabase/supabase-js`). It expects the fairgo `chunks` and `documents` tables and `match_chunks` RPC function in your Supabase project.

## Embeddings

doc-memory generates embeddings locally using [Transformers.js](https://huggingface.co/docs/transformers.js) — no external server required. On first run, the model is downloaded and cached automatically.

### Embedding providers

| Provider | Model | Dimensions | Speed | Quality | Setup |
|----------|-------|-----------|-------|---------|-------|
| **Local** (default) | `Xenova/all-MiniLM-L6-v2` | 384 | Fast | Good | Zero-config |
| **Python service** | `nomic-ai/nomic-embed-text-v1.5` | 768 | Fast | Better | Requires server |

### Provider selection logic

1. If `DOC_MEMORY_EMBEDDINGS=local` — use local Transformers.js only
2. If `DOC_MEMORY_EMBEDDINGS=python` — use Python service only (errors if unavailable)
3. If neither is set (default):
   - If `PYTHON_SERVICE_URL` is set — try Python first, fall back to local on failure
   - If `PYTHON_SERVICE_URL` is not set — use local only

### Changing models

Set `DOC_MEMORY_MODEL` to use a different Hugging Face model:

```bash
# Higher quality, larger model (768-dim)
DOC_MEMORY_MODEL=Xenova/nomic-embed-text-v1.5

# Small and fast (384-dim, default)
DOC_MEMORY_MODEL=Xenova/all-MiniLM-L6-v2
```

> **Important:** All documents in a database must use the same embedding dimension. If you change models, start with a fresh database or re-index all documents.

### Python embedding server (optional)

For higher-quality 768-dim embeddings, run a Python embedding server. doc-memory will prefer it when `PYTHON_SERVICE_URL` is set.

The server must expose `POST /embed` accepting `{ "texts": [...] }` and returning `{ "embeddings": [[...], ...] }`.

**Minimal server** (`embed-server.py`):

```python
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI()
model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True)

class EmbedRequest(BaseModel):
    texts: list[str]

@app.post("/embed")
async def embed(data: EmbedRequest):
    embeddings = model.encode(data.texts, convert_to_numpy=True)
    return {"embeddings": [e.tolist() for e in embeddings], "dimensions": 768}
```

```bash
pip install fastapi uvicorn sentence-transformers
uvicorn embed-server:app --port 8000
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOC_MEMORY_STORAGE` | `sqlite` | Storage backend: `sqlite` or `postgres` |
| `DOC_MEMORY_DB` | `~/.doc-memory/index.db` | SQLite database path (sqlite mode only) |
| `DOC_MEMORY_WATCH` | — | Directories to watch and index (see [Use Cases](#use-cases)) |
| `DOC_MEMORY_EMBEDDINGS` | *(auto)* | Embedding provider: `local`, `python`, or unset for auto |
| `DOC_MEMORY_MODEL` | `Xenova/all-MiniLM-L6-v2` | Hugging Face model for local embeddings |
| `PYTHON_SERVICE_URL` | — | Python embedding service URL (enables python/fallback mode) |
| `SUPABASE_URL` | — | Supabase project URL (postgres mode) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Supabase service role key (postgres mode) |
| `DOC_MEMORY_PROJECT_ID` | — | Scope searches to a project (postgres mode, optional) |

### Watch path format

`DOC_MEMORY_WATCH` accepts comma-separated entries. Each entry is `path:glob` or just `path` (defaults to `**/*`):

```
DOC_MEMORY_WATCH="~/docs:*.md,~/notes"
```

Files matching the glob are indexed on startup and re-indexed when modified. Changes are detected via filesystem events (chokidar) with 500ms debounce.

## Usage

### As a library

```typescript
import { DocMemory } from '@fairgo/doc-memory';

const memory = new DocMemory({
  storage: { type: 'sqlite', path: '~/.doc-memory/index.db' },
  sources: [{ type: 'directory', path: './docs', glob: '**/*.md' }],
  embeddings: { pythonServiceUrl: 'http://localhost:8000' },
});

await memory.initialize();

// Index a file
await memory.index('./docs/guide.md');

// Search
const results = await memory.search('authentication flow');

// Read full document
const doc = await memory.read('guide.md');

// Watch directories for changes
memory.startWatching(['./docs'], '**/*.{md,txt,pdf}');

// Clean up
await memory.close();
```

### Individual components

```typescript
import {
  chunkTextWithMetadata,
  fuseWithRRF,
  SQLiteBackend,
  PythonServiceEmbeddings,
  MemoryEventBus,
  IndexPipeline,
  FileWatcher,
} from '@fairgo/doc-memory';

// Chunking with semantic boundary detection
const chunks = chunkTextWithMetadata(text, {
  maxSize: 1000,   // chars per chunk
  overlap: 200,    // overlap between chunks
  windowSize: 50,  // context window size
});

// Custom hybrid search fusion
const fused = fuseWithRRF(ftsResults, vectorResults, (item) => item.id, 60);
```

### Storage backends

**SQLite** (local, zero-config):

```typescript
import { SQLiteBackend } from '@fairgo/doc-memory';

const storage = new SQLiteBackend({ path: '~/.doc-memory/index.db' });
await storage.initialize();
```

**PostgreSQL** (production, via Supabase):

```typescript
import { PostgresBackend } from '@fairgo/doc-memory';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);
const storage = new PostgresBackend({ supabase });
await storage.initialize();
```

### Event bus

Subscribe to document lifecycle events for plugin integration:

```typescript
import { MemoryEventBus } from '@fairgo/doc-memory';

const events = new MemoryEventBus();

events.on('document:indexed', (event) => {
  console.log(`Indexed ${event.filename} (${event.chunkCount} chunks)`);
});

events.on('document:deleted', (event) => {
  console.log(`Deleted ${event.docId}`);
});
```

## Architecture

```
┌─────────────────────────────────────────┐
│              MCP Server                 │
│  search · read · expand · list · nav    │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────┴──────────────────────┐
│              DocMemory                  │
│  index · search · read · expand · list  │
├─────────┬───────────┬───────────────────┤
│ Storage │ Embeddings│    Event Bus      │
│ SQLite  │ Local  ←──┤─── Fallback ───→  │
│ Postgres│ Python    │  Memory / Redis   │
└─────────┴───────────┴───────────────────┘
        │     │          │
┌───────┴──┐ ┌┴─────────┐ ┌──────────────┐
│ sqlite-  │ │ Transformers.js  │ Python   │
│ vec      │ │ (local, 384d)    │ service  │
└──────────┘ └────────────────┘ │ (768d)   │
                                └──────────┘
```

## Plugin structure

```
doc-memory/
├── .claude-plugin/
│   └── plugin.json       # Claude Code plugin manifest
├── agents/
│   └── doc-search.md     # Document search agent
├── cli/
│   └── mcp-server-wrapper.js  # MCP server entry point
├── src/
│   ├── index.ts          # Public API exports
│   ├── doc-memory.ts     # Main DocMemory class
│   ├── mcp-server.ts     # MCP server implementation
│   ├── types.ts          # TypeScript interfaces
│   ├── core/
│   │   ├── chunking.ts   # Text chunking with semantic boundaries
│   │   └── search.ts     # Reciprocal Rank Fusion
│   ├── embeddings/
│   │   ├── interface.ts  # EmbeddingProvider interface
│   │   ├── index.ts      # Provider exports
│   │   ├── transformers.ts    # Local Transformers.js provider
│   │   ├── python-service.ts  # Python HTTP service provider
│   │   └── fallback.ts   # Primary→fallback provider chain
│   ├── events/
│   │   ├── bus.ts        # EventBus interface
│   │   ├── memory.ts     # In-memory event bus
│   │   └── types.ts      # Event type definitions
│   ├── indexer/
│   │   ├── pipeline.ts   # File indexing pipeline
│   │   └── watcher.ts    # Directory file watcher
│   └── storage/
│       ├── interface.ts  # StorageBackend interface
│       ├── index.ts      # Backend factory
│       ├── sqlite.ts     # SQLite + sqlite-vec backend
│       └── postgres.ts   # PostgreSQL/Supabase backend
└── package.json
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run test:watch
```

## License

Private — not for redistribution.
