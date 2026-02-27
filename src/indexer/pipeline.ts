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
    private events?: EventBus
  ) {}

  async indexFile(filepath: string, options: IndexOptions): Promise<string | null> {
    const content = await readFile(filepath, 'utf-8');

    // Skip empty files
    if (!content.trim()) {
      return null;
    }

    const hash = createHash('sha256').update(content).digest('hex');

    // Check if same content already indexed
    const existing = await this.storage.getDocumentByHash(hash);
    if (existing) {
      return null;
    }

    // Delete old version of this file if it exists with different content
    const oldDoc = await this.storage.getDocumentByFilepath(filepath);
    if (oldDoc) {
      await this.storage.deleteDocument(oldDoc.id);
    }

    const filename = filepath.split('/').pop() || filepath;

    const doc = await this.storage.saveDocument({
      source: options.source,
      filename,
      filepath,
      contentHash: hash,
      indexedAt: new Date(),
    });

    const chunks = chunkTextWithMetadata(content, options.chunkOptions);

    const embeddings = await this.embeddings.generateBatch(chunks.map(c => c.content));

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
      }))
    );

    if (this.events) {
      await this.events.emit({
        type: 'document:indexed',
        docId: doc.id,
        filename,
        contentHash: hash,
        chunkCount: chunks.length,
        content: chunks.map(c => c.content).join('\n\n'),
      });
    }

    return doc.id;
  }

  async indexText(
    text: string,
    filename: string,
    options: IndexOptions
  ): Promise<string | null> {
    const hash = createHash('sha256').update(text).digest('hex');

    const existing = await this.storage.getDocumentByHash(hash);
    if (existing) return null;

    const doc = await this.storage.saveDocument({
      source: options.source,
      filename,
      contentHash: hash,
      indexedAt: new Date(),
    });

    const chunks = chunkTextWithMetadata(text, options.chunkOptions);
    const embeddings = await this.embeddings.generateBatch(chunks.map(c => c.content));

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
      }))
    );

    return doc.id;
  }
}
