export type { StorageBackend } from './interface.js';
export { SQLiteBackend } from './sqlite.js';
export { PostgresBackend } from './postgres.js';
import type { StorageConfig } from '../types.js';
import type { StorageBackend } from './interface.js';
export declare function createStorage(config: StorageConfig): StorageBackend;
//# sourceMappingURL=index.d.ts.map