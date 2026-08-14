import type { IndexPipeline, IndexOptions } from './pipeline.js';
export interface WatcherConfig {
    paths: string[];
    glob?: string;
    debounceMs?: number;
}
export declare class FileWatcher {
    private pipeline;
    private config;
    private indexOptions;
    private watcher;
    private debounceTimers;
    constructor(pipeline: IndexPipeline, config: WatcherConfig, indexOptions: IndexOptions);
    start(): Promise<void>;
    private scan;
    shouldIndex(path: string): boolean;
    private handleChange;
    stop(): void;
}
//# sourceMappingURL=watcher.d.ts.map