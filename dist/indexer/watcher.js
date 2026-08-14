import { watch } from 'chokidar';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
export class FileWatcher {
    pipeline;
    config;
    indexOptions;
    watcher = null;
    debounceTimers = new Map();
    constructor(pipeline, config, indexOptions) {
        this.pipeline = pipeline;
        this.config = config;
        this.indexOptions = indexOptions;
    }
    async start() {
        await this.scan();
        this.watcher = watch(this.config.paths, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true,
        });
        this.watcher.on('add', (path) => this.handleChange(path));
        this.watcher.on('change', (path) => this.handleChange(path));
    }
    async scan() {
        for (const basePath of this.config.paths) {
            const pattern = this.config.glob || '**/*';
            const files = await glob(`${basePath}/${pattern}`);
            // Intentionally sequential: indexFile dedups on content hash, and two
            // identical files indexed concurrently would both miss the check and
            // double-insert. The slow part (embeddings) is already batched per file.
            for (const file of files) {
                try {
                    await this.pipeline.indexFile(file, this.indexOptions);
                }
                catch (err) {
                    console.error(`Failed to index ${file}:`, err);
                }
            }
        }
    }
    shouldIndex(path) {
        const pattern = this.config.glob;
        if (!pattern || pattern === '**/*')
            return true;
        // Use matchBase so patterns like *.md match regardless of directory depth
        return minimatch(path, pattern, { matchBase: true });
    }
    handleChange(path) {
        if (!this.shouldIndex(path))
            return;
        const existing = this.debounceTimers.get(path);
        if (existing)
            clearTimeout(existing);
        const timer = setTimeout(async () => {
            this.debounceTimers.delete(path);
            try {
                await this.pipeline.indexFile(path, this.indexOptions);
            }
            catch (err) {
                console.error(`Failed to index ${path}:`, err);
            }
        }, this.config.debounceMs || 500);
        this.debounceTimers.set(path, timer);
    }
    stop() {
        this.watcher?.close();
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }
}
