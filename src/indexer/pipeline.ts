import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { chunkTextWithMetadata } from '../core/chunking.js';
import type { StorageBackend } from '../storage/interface.js';
import type { EmbeddingProvider } from '../embeddings/interface.js';
import type { EventBus } from '../events/bus.js';
import type { ChunkOptions } from '../types.js';

export interface IndexOptions {
  source: 'directory' | 'chat';
  chunkOptions?: ChunkOptions;
  projectId?: string;
}

export class IndexPipeline {
  constructor(
    private storage: StorageBackend,
    private embeddings: EmbeddingProvider,
    private events?: EventBus,
  ) {}

  async indexFile(
    filepath: string,
    options: IndexOptions,
  ): Promise<string | null> {
    const content = await readFile(filepath, 'utf-8');
    const hash = createHash('sha256').update(content).digest('hex');

    if (await this.isAlreadyIndexed(hash)) return null;

    const filename = filepath.split('/').pop() || filepath;

    // A watched file that was edited keeps its path but gets a new hash —
    // drop the stale version so the index doesn't accumulate duplicates.
    const stale = await this.storage.getDocumentByFilepath(filepath);
    if (stale && stale.contentHash !== hash) {
      await this.storage.deleteDocument(stale.id);
    }

    return this.persist(content, options, { filename, filepath, hash });
  }

  async indexText(
    text: string,
    filename: string,
    options: IndexOptions,
  ): Promise<string | null> {
    const hash = createHash('sha256').update(text).digest('hex');

    if (await this.isAlreadyIndexed(hash)) return null;

    return this.persist(text, options, { filename, hash });
  }

  /**
   * True only when this exact content is *fully* indexed. A leftover document
   * row with zero chunks (a previous attempt that failed after the document
   * was saved but before chunks were written) is deleted here so re-indexing
   * can recover, instead of being permanently blocked by the hash check.
   */
  private async isAlreadyIndexed(hash: string): Promise<boolean> {
    const existing = await this.storage.getDocumentByHash(hash);
    if (!existing) return false;
    const chunks = await this.storage.getChunks(existing.id);
    if (chunks.length > 0) return true;
    await this.storage.deleteDocument(existing.id);
    return false;
  }

  private async persist(
    content: string,
    options: IndexOptions,
    meta: { filename: string; filepath?: string; hash: string },
  ): Promise<string> {
    const doc = await this.storage.saveDocument({
      source: options.source,
      filename: meta.filename,
      filepath: meta.filepath,
      contentHash: meta.hash,
      indexedAt: new Date(),
    });

    const chunks = chunkTextWithMetadata(content, options.chunkOptions);
    const embeddings = await this.embeddings.generateBatch(
      chunks.map((c) => c.content),
    );

    await this.storage.saveChunks(
      doc.id,
      chunks.map((c, i) => ({
        chunkIndex: c.index,
        content: c.content,
        embedding: embeddings[i],
        pageNumber: c.pageNumber,
        sectionHeader: c.sectionHeader,
        windowBefore: c.windowBefore,
        windowAfter: c.windowAfter,
        projectId: options.projectId,
      })),
    );

    if (this.events) {
      await this.events.emit({
        type: 'document:indexed',
        docId: doc.id,
        filename: meta.filename,
        contentHash: meta.hash,
        chunkCount: chunks.length,
      });
    }

    return doc.id;
  }
}
