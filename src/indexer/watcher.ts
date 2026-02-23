import { watch } from 'chokidar';
import { glob } from 'glob';
import type { IndexPipeline, IndexOptions } from './pipeline.js';

export interface WatcherConfig {
  paths: string[];
  glob?: string;
  debounceMs?: number;
}

export class FileWatcher {
  private watcher: ReturnType<typeof watch> | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private pipeline: IndexPipeline,
    private config: WatcherConfig,
    private indexOptions: IndexOptions
  ) {}

  async start(): Promise<void> {
    await this.scan();

    this.watcher = watch(this.config.paths, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('add', (path) => this.handleChange(path));
    this.watcher.on('change', (path) => this.handleChange(path));
  }

  private async scan(): Promise<void> {
    for (const basePath of this.config.paths) {
      const pattern = this.config.glob || '**/*';
      const files = await glob(`${basePath}/${pattern}`);

      for (const file of files) {
        try {
          await this.pipeline.indexFile(file, this.indexOptions);
        } catch (err) {
          console.error(`Failed to index ${file}:`, err);
        }
      }
    }
  }

  private handleChange(path: string): void {
    const existing = this.debounceTimers.get(path);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(path);
      try {
        await this.pipeline.indexFile(path, this.indexOptions);
      } catch (err) {
        console.error(`Failed to index ${path}:`, err);
      }
    }, this.config.debounceMs || 500);

    this.debounceTimers.set(path, timer);
  }

  stop(): void {
    this.watcher?.close();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
