import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

// The orchestrator entry must import DocMemory + the Retriever contract without
// loading any native module. process.moduleLoadList does NOT capture a
// dynamically-imported native addon, so we patch Module._load to throw if
// better-sqlite3 / sqlite-vec is ever requested, then assert importing the
// orchestrator does not trip it.
describe('dep-light orchestrator import', () => {
  it('imports DocMemory without loading better-sqlite3 or sqlite-vec', () => {
    const script = `
      import('node:module').then(({ default: Module }) => {
        const orig = Module._load;
        Module._load = function (request, ...rest) {
          if (/better-sqlite3|sqlite-vec/.test(request)) { console.error('NATIVE_LOADED:' + request); process.exit(2); }
          return orig.call(this, request, ...rest);
        };
        return import('./dist/orchestrator.js');
      }).then((m) => {
        if (typeof m.DocMemory !== 'function') { console.error('NO_DOCMEMORY'); process.exit(4); }
        process.exit(0);
      }).catch((e) => { console.error(e); process.exit(3); });
    `;
    // execFileSync throws on non-zero exit; a clean import exits 0.
    const out = execFileSync('node', ['--input-type=module', '-e', script], { cwd: process.cwd() });
    expect(out.toString()).not.toMatch(/NATIVE_LOADED/);
  });
});
