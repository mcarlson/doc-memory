export type { StorageBackend } from './interface.js';
export { SQLiteBackend } from './sqlite.js';
export { PostgresBackend } from './postgres.js';

import type { StorageConfig } from '../types.js';
import type { StorageBackend } from './interface.js';
import { SQLiteBackend } from './sqlite.js';

export function createStorage(config: StorageConfig): StorageBackend {
  if (config.type === 'sqlite') {
    if (!config.path) throw new Error('SQLite requires path');
    return new SQLiteBackend({ path: config.path });
  }

  if (config.type === 'postgres') {
    throw new Error('PostgreSQL backend requires Supabase client - use PostgresBackend directly');
  }

  throw new Error(`Unknown storage type: ${config.type}`);
}
