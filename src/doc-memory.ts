import type { DocMemoryConfig, SearchResult, HybridSearchOptions, ExpandedChunk, ExpansionLevel, Document } from './types.js';
import type { StorageBackend } from './storage/interface.js';
import type { EmbeddingProvider } from './embeddings/interface.js';
import type { EventBus } from './events/bus.js';
import { SQLiteBackend } from './storage/sqlite.js';
import { PythonServiceEmbeddings } from './embeddings/python-service.js';
import { TransformersJsEmbeddings } from './embeddings/transformers.js';
import { MemoryEventBus } from './events/memory.js';
import { IndexPipeline } from './indexer/pipeline.js';
import { FileWatcher } from './indexer/watcher.js';

export class DocMemory {
  readonly storage: StorageBackend;
  readonly embeddings: EmbeddingProvider;
  readonly events: EventBus;
  readonly pipeline: IndexPipeline;

  private watchers: FileWatcher[] = [];

  constructor(config: DocMemoryConfig) {
    // Create embeddings first so we know the dimension for storage
    if (config.embeddings.pythonServiceUrl) {
      this.embeddings = new PythonServiceEmbeddings({
        url: config.embeddings.pythonServiceUrl,
      });
    } else {
      this.embeddings = new TransformersJsEmbeddings({
        dimension: config.embeddings.dimension,
      });
    }

    if (config.storage.type === 'sqlite') {
      this.storage = new SQLiteBackend({
        path: config.storage.path!.replace('~', process.env.HOME || ''),
        dimension: this.embeddings.dimension,
      });
    } else {
      throw new Error('PostgreSQL storage requires Supabase client - use PostgresBackend directly');
    }

    this.events = new MemoryEventBus();
    this.pipeline = new IndexPipeline(this.storage, this.embeddings);
  }

  async initialize(): Promise<void> {
    await this.storage.initialize();
  }

  async index(filepath: string, source: 'directory' | 'chat' = 'directory'): Promise<string | null> {
    const docId = await this.pipeline.indexFile(filepath, { source });

    if (docId) {
      const doc = await this.storage.getDocument(docId);
      const chunks = await this.storage.getChunks(docId);

      if (doc) {
        await this.events.emit({
          type: 'document:indexed',
          docId,
          filename: doc.filename,
          contentHash: doc.contentHash,
          chunkCount: chunks.length,
          content: chunks.map(c => c.content).join('\n\n'),
        });
      }
    }

    return docId;
  }

  async search(query: string, options?: HybridSearchOptions): Promise<SearchResult[]> {
    const embedding = await this.embeddings.generate(query);
    return this.storage.hybridSearch(query, embedding, options);
  }

  async read(idOrFilename: string): Promise<{ document: Document; content: string } | null> {
    const doc = await this.storage.getDocument(idOrFilename)
      || await this.storage.getDocumentByFilename(idOrFilename);

    if (!doc) return null;

    const chunks = await this.storage.getChunks(doc.id);
    return {
      document: doc,
      content: chunks.map(c => c.content).join('\n\n'),
    };
  }

  async expand(chunkId: string, level: ExpansionLevel = 'adjacent'): Promise<ExpandedChunk> {
    return this.storage.expandContext(chunkId, level);
  }

  async list(source?: string): Promise<Document[]> {
    return this.storage.listDocuments(source);
  }

  startWatching(paths: string[], glob?: string): void {
    const watcher = new FileWatcher(
      this.pipeline,
      { paths, glob },
      { source: 'directory' }
    );
    watcher.start();
    this.watchers.push(watcher);
  }

  stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.stop();
    }
    this.watchers = [];
  }

  async close(): Promise<void> {
    this.stopWatching();
    await this.storage.close();
  }
}
