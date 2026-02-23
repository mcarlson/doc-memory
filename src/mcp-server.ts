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
import type { ExpansionLevel } from './types.js';

const SearchSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().optional().default(10).describe('Max results'),
  source: z.string().optional().describe('Filter by source'),
  recency_weight: z.number().optional().describe('Weight for recency (0-1)'),
  recency_half_life: z.number().optional().describe('Days until recency boost halves'),
});

const ReadSchema = z.object({
  id: z.string().optional().describe('Document ID'),
  filename: z.string().optional().describe('Document filename'),
});

const ExpandSchema = z.object({
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

      switch (name) {
        case 'search':
          return this.handleSearch(SearchSchema.parse(args));
        case 'read':
          return this.handleRead(ReadSchema.parse(args));
        case 'expand':
          return this.handleExpand(ExpandSchema.parse(args));
        case 'list':
          return this.handleList(ListSchema.parse(args));
        case 'navigate':
          return this.handleNavigate(NavigateSchema.parse(args));
        default:
          throw new Error(`Unknown tool: ${name}`);
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

    const formatted = results.map((r, i) => {
      const sources = [];
      if (r.sources.fts) sources.push(`FTS:#${r.sources.fts}`);
      if (r.sources.vector) sources.push(`Vec:#${r.sources.vector}`);
      return `[${i + 1}] ${r.filename} (chunk ${r.chunkIndex}) [${sources.join(', ')}]\n${r.content.slice(0, 300)}...`;
    });

    return {
      content: [{ type: 'text' as const, text: formatted.join('\n\n') || 'No results found.' }],
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

    const pageInfo = expanded.pageRange
      ? `Pages ${expanded.pageRange[0]}-${expanded.pageRange[1]}`
      : 'Unknown pages';

    return {
      content: [{
        type: 'text' as const,
        text: `# Expanded Context (${args.level})\n${pageInfo}\n\n---\n\n${expanded.expanded}`,
      }],
    };
  }

  private async handleList(args: z.infer<typeof ListSchema>) {
    const docs = await this.storage.listDocuments(args.source);

    if (docs.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No documents indexed.' }] };
    }

    const formatted = docs.map(d =>
      `- ${d.filename} (${d.source}, indexed ${d.indexedAt.toISOString().split('T')[0]})`
    );

    return {
      content: [{ type: 'text' as const, text: `# Indexed Documents (${docs.length})\n\n${formatted.join('\n')}` }],
    };
  }

  private async handleNavigate(args: z.infer<typeof NavigateSchema>) {
    const chunk = await this.storage.getChunk(args.chunk_id);
    if (!chunk) {
      return { content: [{ type: 'text' as const, text: 'Chunk not found.' }] };
    }

    const targetIndex = args.direction === 'next'
      ? chunk.chunkIndex + args.count
      : chunk.chunkIndex - args.count;

    const targetChunk = await this.storage.getChunkByIndex(chunk.documentId, targetIndex);
    if (!targetChunk) {
      return { content: [{ type: 'text' as const, text: `No ${args.direction} chunk available.` }] };
    }

    return {
      content: [{
        type: 'text' as const,
        text: `# Chunk ${targetChunk.chunkIndex}${targetChunk.sectionHeader ? ` (${targetChunk.sectionHeader})` : ''}\n\n${targetChunk.content}`,
      }],
    };
  }

  async run() {
    await this.storage.initialize();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

async function createStorage(): Promise<StorageBackend> {
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
  return new SQLiteBackend({ path: dbPath.replace('~', process.env.HOME || '') });
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

async function main() {
  const storage = await createStorage();
  const embeddings = createEmbeddings();

  const server = new DocMemoryServer(storage, embeddings);
  await server.run();
}

main().catch(console.error);
