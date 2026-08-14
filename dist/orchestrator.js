// Slim, dep-light entry: the orchestrator + retriever contract only, with NO
// static path to the native backends (SQLiteBackend/sqlite-vec/better-sqlite3).
// A host that injects its own Retriever imports from here and loads zero native
// code. (The full package barrel `./index.js` still re-exports the backends.)
export { DocMemory } from './doc-memory.js';
export { BaseRetriever } from './retrievers/base.js';
