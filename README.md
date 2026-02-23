# doc-memory

Semantic search MCP server for documents and chat history. Indexes files, chunks text with semantic boundary detection, generates embeddings, and exposes hybrid search (FTS + vector) via the Model Context Protocol.

## Overview

doc-memory watches directories for document changes, indexes content into a local SQLite database with vector search (sqlite-vec), and serves results through an MCP server that Claude can query directly. It combines full-text search with vector similarity using Reciprocal Rank Fusion for high-quality results.

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

```json
{
  "mcpServers": {
    "doc-memory": {
      "command": "node",
      "args": ["/path/to/doc-memory/cli/mcp-server-wrapper.js"],
      "env": {
        "DOC_MEMORY_DB": "~/.doc-memory/index.db",
        "PYTHON_SERVICE_URL": "http://localhost:8000"
      }
    }
  }
}
```

## Prerequisites

### Embedding server

doc-memory requires a running embedding server that generates 768-dimensional vectors. The server must expose a single endpoint:

```
POST /embed
Content-Type: application/json

{ "texts": ["first document", "second document"] }

→ { "embeddings": [[0.1, 0.2, ...], [0.3, 0.4, ...]], "dimensions": 768 }
```

**Option A: Minimal standalone server** (recommended for getting started)

Create `embed-server.py`:

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
    return {
        "embeddings": [e.tolist() for e in embeddings],
        "dimensions": 768,
    }
```

Run it:

```bash
pip install fastapi uvicorn sentence-transformers
uvicorn embed-server:app --port 8000
```

**Option B: Docker**

```dockerfile
FROM python:3.12-slim
RUN pip install fastapi uvicorn sentence-transformers
COPY embed-server.py .
CMD ["uvicorn", "embed-server:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t embed-server . && docker run -p 8000:8000 embed-server
```

**Option C: Any compatible service**

Any HTTP server that implements the `POST /embed` contract above will work. The vectors must be 768-dimensional to match the sqlite-vec index.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOC_MEMORY_DB` | `~/.doc-memory/index.db` | Path to SQLite database |
| `PYTHON_SERVICE_URL` | `http://localhost:8000` | Embedding service URL |

> **Note:** The MCP server (plugin/CLI mode) uses SQLite storage only. PostgreSQL is available when using doc-memory as a library — see [Storage backends](#storage-backends) below.

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
│ SQLite  │ Python    │  Memory / Redis   │
│ Postgres│ Service   │  / Webhook        │
└─────────┴───────────┴───────────────────┘
        │         │
┌───────┴──┐ ┌────┴──────┐
│ sqlite-  │ │ sentence- │
│ vec      │ │ trans-    │
│ (384d)   │ │ formers   │
└──────────┘ └───────────┘
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
│   │   ├── index.ts      # Provider factory
│   │   └── python-service.ts  # Python service client
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
