import { describe, it, expect } from 'vitest';
import { FileWatcher } from './watcher.js';
import type { IndexPipeline } from './pipeline.js';

describe('FileWatcher', () => {
  it('should filter change events by glob pattern', () => {
    const mockPipeline = {
      indexFile: async () => 'id',
    } as unknown as IndexPipeline;

    const watcher = new FileWatcher(
      mockPipeline,
      { paths: ['/tmp'], glob: '**/*.md' },
      { source: 'directory' }
    );

    expect(watcher.shouldIndex('/tmp/readme.md')).toBe(true);
    expect(watcher.shouldIndex('/tmp/sub/notes.md')).toBe(true);
    expect(watcher.shouldIndex('/tmp/image.png')).toBe(false);
    expect(watcher.shouldIndex('/tmp/notes.txt')).toBe(false);
  });

  it('should match all files when no glob specified', () => {
    const mockPipeline = {
      indexFile: async () => 'id',
    } as unknown as IndexPipeline;

    const watcher = new FileWatcher(
      mockPipeline,
      { paths: ['/tmp'] },
      { source: 'directory' }
    );

    expect(watcher.shouldIndex('/tmp/anything.md')).toBe(true);
    expect(watcher.shouldIndex('/tmp/file.txt')).toBe(true);
  });
});
