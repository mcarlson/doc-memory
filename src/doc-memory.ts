import type { DocMemoryConfig, HybridSearchOptions, ExpandedChunk, ExpansionLevel, Document } from './types.js';
import type { Retriever, RetrievalRequest, RetrievedChunk } from './retriever.js';
import type { StorageBackend } from './storage/interface.js';
import type { EmbeddingProvider } from './embeddings/interface.js';
import type { EventBus } from './events/bus.js';
import { SQLiteBackend } from './storage/sqlite.js';
import { PythonServiceEmbeddings } from './embeddings/python-service.js';
import { TransformersJsEmbeddings } from './embeddings/transformers.js';
import { MemoryEventBus } from './events/memory.js';
import { IndexPipeline } from './indexer/pipeline.js';
import { FileWatcher } from './indexer/watcher.js';
import { BaseRetriever } from './retrievers/base.js';

export class DocMemory {
  // Optional: a retriever-only DocMemory (injected retriever, no storage config)
  // constructs none of these, so it can run with zero native/backend deps.
  readonly storage?: StorageBackend;
  readonly embeddings?: EmbeddingProvider;
  readonly events?: EventBus;
  readonly pipeline?: IndexPipeline;
  readonly retriever: Retriever;

  private watchers: FileWatcher[] = [];

  constructor(config: DocMemoryConfig) {
    // No-backend branch: an injected retriever with no storage config skips
    // building embeddings/storage entirely (the dep-light path).
    if (config.retriever && !config.storage) {
      this.retriever = config.retriever;
      return;
    }

    // Create embeddings first so we know the dimension for storage
    if (config.embeddings?.pythonServiceUrl) {
      this.embeddings = new PythonServiceEmbeddings({
        url: config.embeddings.pythonServiceUrl,
      });
    } else {
      this.embeddings = new TransformersJsEmbeddings({
        dimension: config.embeddings?.dimension,
      });
    }

    if (config.storage?.type === 'sqlite') {
      this.storage = new SQLiteBackend({
        path: config.storage.path!.startsWith('~') ? config.storage.path!.replace('~', process.env.HOME || '') : config.storage.path!,
        dimension: this.embeddings.dimension,
      });
    } else {
      throw new Error('PostgreSQL storage requires Supabase client - use PostgresBackend directly');
    }

    this.events = new MemoryEventBus();
    this.pipeline = new IndexPipeline(this.storage, this.embeddings);
    // Default retriever = the built-in embeddings + hybrid search.
    this.retriever = config.retriever ?? new BaseRetriever(this.embeddings, this.storage);
  }

  /**
   * Backend methods (index/read/expand/list/startWatching/initialize) require a
   * storage/embeddings config. A retriever-only DocMemory ({ retriever }) has
   * none — calling them throws this clear error instead of a bare NPE.
   */
  private assertBackend(): void {
    if (!this.storage || !this.pipeline || !this.events) {
      throw new Error(
        'DocMemory was constructed retriever-only (injected retriever, no storage config); ' +
          'index/read/expand/list/startWatching/initialize are unavailable. ' +
          'Provide a storage + embeddings config to use them.',
      );
    }
  }

  async initialize(): Promise<void> {
    this.assertBackend();
    await this.storage!.initialize();
  }

  async index(filepath: string, source: 'directory' | 'chat' = 'directory'): Promise<string | null> {
    this.assertBackend();
    const docId = await this.pipeline!.indexFile(filepath, { source });

    if (docId) {
      const doc = await this.storage!.getDocument(docId);
      const chunks = await this.storage!.getChunks(docId);

      if (doc) {
        await this.events!.emit({
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

  async search(
    query: string,
    options?: HybridSearchOptions & { scope?: Record<string, unknown> },
  ): Promise<RetrievedChunk[]> {
    const req: RetrievalRequest = {
      query,
      limit: options?.limit,
      scope: options?.scope,
      recencyWeight: options?.recencyWeight,
      // HybridSearchOptions.recencyHalfLife -> RetrievalRequest.recencyHalfLifeDays
      recencyHalfLifeDays: options?.recencyHalfLife,
    };
    return this.retriever.search(req);
  }

  async read(idOrFilename: string): Promise<{ document: Document; content: string } | null> {
    this.assertBackend();
    const doc = await this.storage!.getDocument(idOrFilename)
      || await this.storage!.getDocumentByFilename(idOrFilename);

    if (!doc) return null;

    const chunks = await this.storage!.getChunks(doc.id);
    return {
      document: doc,
      content: chunks.map(c => c.content).join('\n\n'),
    };
  }

  async expand(chunkId: string, level: ExpansionLevel = 'adjacent'): Promise<ExpandedChunk> {
    this.assertBackend();
    return this.storage!.expandContext(chunkId, level);
  }

  async list(source?: string): Promise<Document[]> {
    this.assertBackend();
    return this.storage!.listDocuments(source);
  }

  async startWatching(paths: string[], glob?: string): Promise<void> {
    this.assertBackend();
    const watcher = new FileWatcher(
      this.pipeline!,
      { paths, glob },
      { source: 'directory' }
    );
    await watcher.start();
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
    await this.storage?.close();
  }
}
