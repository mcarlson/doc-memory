import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SQLiteBackend } from './storage/sqlite.js';
import { PostgresBackend } from './storage/postgres.js';
import { PythonServiceEmbeddings } from './embeddings/python-service.js';
import { TransformersJsEmbeddings } from './embeddings/transformers.js';
import { FallbackEmbeddings } from './embeddings/fallback.js';
import type { StorageBackend } from './storage/interface.js';
import type { EmbeddingProvider } from './embeddings/interface.js';
import { IndexPipeline } from './indexer/pipeline.js';
import { FileWatcher } from './indexer/watcher.js';
import type { ExpansionLevel } from './types.js';
import type { EventBus } from './events/bus.js';
import { MemoryEventBus } from './events/memory.js';
import { formatSearchResults, formatPageRange, formatDocumentList, formatErrorMessage } from './core/format.js';
import { expandHome } from './core/util.js';

export const SearchSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().int().min(1).max(100).optional().default(10).describe('Max results'),
  source: z.string().optional().describe('Filter by source'),
  recency_weight: z.number().min(0).max(1).optional().describe('Weight for recency (0-1)'),
  recency_half_life: z.number().positive().optional().describe('Days until recency boost halves'),
});

export const ReadSchema = z.object({
  id: z.string().optional().describe('Document ID'),
  filename: z.string().optional().describe('Document filename'),
}).refine(d => Boolean(d.id || d.filename), {
  message: 'Provide either id or filename',
});

export const ExpandSchema = z.object({
  chunk_id: z.string().describe('Chunk ID to expand'),
  level: z.enum(['adjacent', 'section', 'full']).default('adjacent').describe('Expansion level'),
});

const ListSchema = z.object({
  source: z.string().optional().describe('Filter by source'),
});

const NavigateSchema = z.object({
  chunk_id: z.string().describe('Current chunk ID'),
  direction: z.enum(['next', 'prev']).describe('Navigation direction'),
  count: z.number().optional().default(1).describe('Number of chunks'),
});

export class DocMemoryServer {
  private server: Server;
  private storage: StorageBackend;
  private embeddings: EmbeddingProvider;

  constructor(storage: StorageBackend, embeddings: EmbeddingProvider) {
    this.storage = storage;
    this.embeddings = embeddings;
    this.server = new Server(
      { name: 'doc-memory', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search',
          description: 'Hybrid search (FTS + vector) across indexed documents',
          inputSchema: {
            type: 'object' as const,
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', description: 'Max results (default: 10)' },
              source: { type: 'string', description: 'Filter by source' },
              recency_weight: { type: 'number', description: 'Weight for recency boost (0-1)' },
              recency_half_life: { type: 'number', description: 'Days until recency boost halves' },
            },
            required: ['query'],
          },
        },
        {
          name: 'read',
          description: 'Read full document by ID or filename',
          inputSchema: {
            type: 'object' as const,
            properties: {
              id: { type: 'string', description: 'Document ID' },
              filename: { type: 'string', description: 'Document filename' },
            },
          },
        },
        {
          name: 'expand',
          description: 'Expand context around a chunk',
          inputSchema: {
            type: 'object' as const,
            properties: {
              chunk_id: { type: 'string', description: 'Chunk ID to expand' },
              level: { type: 'string', enum: ['adjacent', 'section', 'full'], description: 'Expansion level' },
            },
            required: ['chunk_id'],
          },
        },
        {
          name: 'list',
          description: 'List indexed documents',
          inputSchema: {
            type: 'object' as const,
            properties: {
              source: { type: 'string', description: 'Filter by source' },
            },
          },
        },
        {
          name: 'navigate',
          description: 'Get next/previous chunks from current position',
          inputSchema: {
            type: 'object' as const,
            properties: {
              chunk_id: { type: 'string', description: 'Current chunk ID' },
              direction: { type: 'string', enum: ['next', 'prev'], description: 'Navigation direction' },
              count: { type: 'number', description: 'Number of chunks (default: 1)' },
            },
            required: ['chunk_id', 'direction'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search':
            return await this.handleSearch(SearchSchema.parse(args));
          case 'read':
            return await this.handleRead(ReadSchema.parse(args));
          case 'expand':
            return await this.handleExpand(ExpandSchema.parse(args));
          case 'list':
            return await this.handleList(ListSchema.parse(args));
          case 'navigate':
            return await this.handleNavigate(NavigateSchema.parse(args));
          default:
            return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true };
        }
      } catch (err) {
        return { content: [{ type: 'text' as const, text: formatErrorMessage(err) }], isError: true };
      }
    });
  }

  private async handleSearch(args: z.infer<typeof SearchSchema>) {
    const embedding = await this.embeddings.generate(args.query);
    const results = await this.storage.hybridSearch(args.query, embedding, {
      limit: args.limit,
      source: args.source,
      recencyWeight: args.recency_weight,
      recencyHalfLife: args.recency_half_life,
    });

    return {
      content: [{ type: 'text' as const, text: formatSearchResults(results) }],
    };
  }

  private async handleRead(args: z.infer<typeof ReadSchema>) {
    const doc = args.id
      ? await this.storage.getDocument(args.id)
      : args.filename
      ? await this.storage.getDocumentByFilename(args.filename)
      : null;

    if (!doc) {
      return { content: [{ type: 'text' as const, text: 'Document not found.' }] };
    }

    const chunks = await this.storage.getChunks(doc.id);
    const content = chunks.map(c => c.content).join('\n\n');

    return {
      content: [{
        type: 'text' as const,
        text: `# ${doc.filename}\n\nSource: ${doc.source}\nIndexed: ${doc.indexedAt.toISOString()}\nChunks: ${chunks.length}\n\n---\n\n${content}`,
      }],
    };
  }

  private async handleExpand(args: z.infer<typeof ExpandSchema>) {
    const expanded = await this.storage.expandContext(args.chunk_id, args.level as ExpansionLevel);

    if (!expanded.expanded) {
      return { content: [{ type: 'text' as const, text: 'Chunk not found.' }] };
    }

    const pageInfo = formatPageRange(expanded.pageRange);

    return {
      content: [{
        type: 'text' as const,
        text: `# Expanded Context (${args.level})\n${pageInfo}\n\n---\n\n${expanded.expanded}`,
      }],
    };
  }

  private async handleList(args: z.infer<typeof ListSchema>) {
    const docs = await this.storage.listDocuments(args.source);
    return {
      content: [{ type: 'text' as const, text: formatDocumentList(docs) }],
    };
  }

  private async handleNavigate(args: z.infer<typeof NavigateSchema>) {
    const chunk = await this.storage.getChunk(args.chunk_id);
    if (!chunk) {
      return { content: [{ type: 'text' as const, text: 'Chunk not found.' }] };
    }

    const startIndex = args.direction === 'next'
      ? chunk.chunkIndex + 1
      : chunk.chunkIndex - args.count;
    const endIndex = args.direction === 'next'
      ? chunk.chunkIndex + args.count
      : chunk.chunkIndex - 1;

    const chunks = await this.storage.getAdjacentChunks(
      chunk.documentId,
      Math.floor((startIndex + endIndex) / 2),
      Math.ceil(args.count / 2)
    );

    // Filter to only the range we actually want (adjacent may return extra)
    const filtered = chunks.filter(c =>
      c.chunkIndex >= startIndex && c.chunkIndex <= endIndex
    );

    if (filtered.length === 0) {
      return { content: [{ type: 'text' as const, text: `No ${args.direction} chunk available.` }] };
    }

    const parts = filtered.map(c =>
      `# Chunk ${c.chunkIndex} [chunk:${c.id}]${c.sectionHeader ? ` (${c.sectionHeader})` : ''}\n\n${c.content}`
    );

    return {
      content: [{ type: 'text' as const, text: parts.join('\n\n---\n\n') }],
    };
  }

  async run() {
    await this.storage.initialize();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

async function createStorage(dimension?: number): Promise<StorageBackend> {
  const storageType = process.env.DOC_MEMORY_STORAGE || 'sqlite';

  if (storageType === 'postgres' || storageType === 'supabase') {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Postgres storage requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)'
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    return new PostgresBackend({
      supabase,
      projectId: process.env.DOC_MEMORY_PROJECT_ID,
    });
  }

  const dbPath = process.env.DOC_MEMORY_DB || '~/.doc-memory/index.db';
  return new SQLiteBackend({ path: expandHome(dbPath), dimension });
}

function createEmbeddings(): EmbeddingProvider {
  const pythonUrl = process.env.PYTHON_SERVICE_URL;
  const model = process.env.DOC_MEMORY_MODEL || 'Xenova/all-MiniLM-L6-v2';
  const embeddingProvider = process.env.DOC_MEMORY_EMBEDDINGS; // 'local', 'python', or unset

  const local = new TransformersJsEmbeddings({ model });

  // Explicit choice
  if (embeddingProvider === 'local') {
    return local;
  }
  if (embeddingProvider === 'python') {
    if (!pythonUrl) {
      throw new Error('DOC_MEMORY_EMBEDDINGS=python requires PYTHON_SERVICE_URL');
    }
    return new PythonServiceEmbeddings({ url: pythonUrl });
  }

  // Auto: prefer Python if configured, fall back to local
  if (pythonUrl) {
    const python = new PythonServiceEmbeddings({ url: pythonUrl });
    return new FallbackEmbeddings(python, local);
  }

  return local;
}

async function startWatchers(storage: StorageBackend, embeddings: EmbeddingProvider, events?: EventBus): Promise<FileWatcher[]> {
  const watchPaths = process.env.DOC_MEMORY_WATCH;
  if (!watchPaths) return [];

  const pipeline = new IndexPipeline(storage, embeddings, events);
  const watchers: FileWatcher[] = [];

  // Format: "path1:glob1,path2:glob2" or just "path1,path2"
  for (const entry of watchPaths.split(',').map(s => s.trim()).filter(Boolean)) {
    const [watchPath, glob] = entry.includes(':') ? entry.split(':', 2) : [entry, '**/*'];

    const resolvedPath = expandHome(watchPath);

    const watcher = new FileWatcher(
      pipeline,
      { paths: [resolvedPath], glob },
      { source: 'directory' }
    );

    try {
      await watcher.start();
      watchers.push(watcher);
      console.error(`[doc-memory] Watching ${resolvedPath} (${glob})`);
    } catch (err) {
      console.error(`[doc-memory] Failed to start watcher for ${resolvedPath}:`, err);
    }
  }

  return watchers;
}

async function main() {
  const embeddings = createEmbeddings();
  const storage = await createStorage(embeddings.dimension);
  const events = new MemoryEventBus();

  const watchers = await startWatchers(storage, embeddings, events);

  // Register cleanup before blocking on server.run()
  process.on('SIGTERM', () => { watchers.forEach(w => w.stop()); process.exit(0); });
  process.on('SIGINT', () => { watchers.forEach(w => w.stop()); process.exit(0); });

  const server = new DocMemoryServer(storage, embeddings);
  await server.run();
}

// Only run when executed as entrypoint, not when imported as a library
const isEntrypoint = process.argv[1] && (
  import.meta.url.endsWith(process.argv[1]) ||
  import.meta.url === `file://${process.argv[1]}`
);
if (isEntrypoint) {
  main().catch(console.error);
}
