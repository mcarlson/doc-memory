# doc-memory Structural Standardization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `doc-memory` a structurally standard, cwd-independent stdio MCP server that loads as a Claude Code plugin, a Codex MCP server, and a magelab plugin from one source tree after a single `npm install` per host.

**Architecture:** Replace the child-spawn `bin` wrapper with a direct, shebang'd, self-resolving `dist/mcp-server.js`; move MCP config into a single top-level `.mcp.json`; rename the package to the neutral `doc-memory`; add metadata + MIT license; remove a dead enum; give the agent frontmatter. No npm publish, no native-dep prebuilts, no auto-provisioning (deferred "publish tier").

**Tech Stack:** Node 20+ ESM, TypeScript, esbuild bundle, `@modelcontextprotocol/sdk` (stdio), vitest.

**Spec:** `docs/plans/2026-05-23-doc-memory-structural-standardization-design.md`

**Working dir:** the worktree `~/doc-memory/.claude/worktrees/structural-standardization` (branch `feat/structural-standardization`). All paths below are relative to it.

---

## File map

- Modify `package.json` — `bin` → direct entry; `bundle` adds shebang banner + chmod; add `prepare`; rename `name`; add metadata + `license`.
- Delete `cli/mcp-server-wrapper.js` (and the empty `cli/`).
- Create `.mcp.json` — single cross-host MCP config.
- Modify `.claude-plugin/plugin.json` — remove inline `mcpServers`; add metadata.
- Create `LICENSE` — MIT.
- Modify `README.md` — name refs, wrapper-path refs, install section, license line.
- Modify `src/types.ts` — drop the dead `'magelab'` enum member.
- Modify `agents/doc-search.md` — add YAML frontmatter.
- Create `src/mcp-server.smoke.test.ts` — cwd-independent stdio smoke + shebang/exec guard.
- Create `src/standardization-guards.test.ts` — static guards (`.mcp.json` shape, name refs, enum, frontmatter).

---

### Task 0: Environment setup + green baseline

**Files:** none (setup only)

- [ ] **Step 1: Install dependencies in the worktree**

The worktree has no `node_modules` yet. Run:
```bash
cd ~/doc-memory/.claude/worktrees/structural-standardization
npm install
```
Expected: completes; `node_modules/@modelcontextprotocol/sdk` and `node_modules/.bin/vitest` exist.

- [ ] **Step 2: Run the existing test suite to confirm a green baseline**

Run: `npm test`
Expected: PASS (all existing `src/**/*.test.ts`). If anything fails here, stop and report — it is a pre-existing failure, not caused by this plan.

- [ ] **Step 3: Build once to confirm the toolchain works**

Run: `npm run build`
Expected: `dist/mcp-server.js` exists. (We change the build in Task 1.)

---

### Task 1: Direct, cwd-independent entry (spec §1, §2; gaps #1, #2, #4)

**Files:**
- Create: `src/mcp-server.smoke.test.ts`
- Modify: `package.json:8-13` (`bin`, `bundle`, add `prepare`)
- Delete: `cli/mcp-server-wrapper.js`

- [ ] **Step 1: Write the cwd-independent smoke test + shebang/exec guard**

Create `src/mcp-server.smoke.test.ts`:
```ts
import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, readFileSync, statSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "dist", "mcp-server.js"); // <root>/dist/mcp-server.js

describe("dist/mcp-server.js stdio entry", () => {
  let client: Client | undefined;
  afterEach(async () => { await client?.close(); client = undefined; });

  it("lists its five tools when launched from an unrelated cwd", async () => {
    const db = join(mkdtempSync(join(tmpdir(), "docmem-")), "index.db");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      cwd: tmpdir(), // NOT the package dir — proves the server self-resolves its deps
      env: { ...process.env, DOC_MEMORY_DB: db, DOC_MEMORY_WATCH: "" },
    });
    client = new Client({ name: "smoke", version: "0" }, { capabilities: {} });
    await client.connect(transport); // performs the MCP initialize handshake
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["expand", "list", "navigate", "read", "search"],
    );
  }, 30_000);

  it("is shebang'd and executable", () => {
    expect(readFileSync(serverPath, "utf8").startsWith("#!/usr/bin/env node")).toBe(true);
    expect(statSync(serverPath).mode & 0o111).toBeTruthy();
  });
});
```

- [ ] **Step 2: Build with the current config, then run the smoke test to see the split state**

Run: `npm run build && npx vitest run src/mcp-server.smoke.test.ts`
Expected: the "lists its five tools" test PASSES (the server is already a cwd-independent stdio server), the "shebang'd and executable" test FAILS (current `bundle` emits no shebang). This proves the smoke harness works and isolates exactly what Task 1 must change.

- [ ] **Step 3: Update `package.json` — direct bin, shebang banner + chmod, `prepare`**

In `package.json`, set `bin` (was `"./cli/mcp-server-wrapper.js"`):
```json
  "bin": {
    "doc-memory": "dist/mcp-server.js"
  },
```
Replace the `bundle` script (esbuild is the LAST writer of `dist/mcp-server.js`, after `tsc`, so the banner + exec bit survive):
```json
    "bundle": "esbuild src/mcp-server.ts --bundle --platform=node --format=esm --outfile=dist/mcp-server.js --banner:js='#!/usr/bin/env node' --external:better-sqlite3 --external:sqlite-vec --external:fsevents --external:@supabase/supabase-js --external:@huggingface/transformers && chmod +x dist/mcp-server.js",
```
Add a `prepare` script (so `npm install` builds `dist/` — no committed artifacts) right after `build`:
```json
    "prepare": "npm run build",
```

- [ ] **Step 4: Delete the child-spawn wrapper**

Run:
```bash
git rm cli/mcp-server-wrapper.js
rmdir cli 2>/dev/null || true
```

- [ ] **Step 5: Rebuild and run the smoke test — both assertions pass**

Run: `npm run build && npx vitest run src/mcp-server.smoke.test.ts`
Expected: PASS (both tests). The built `dist/mcp-server.js` now starts with `#!/usr/bin/env node` and is executable.

- [ ] **Step 6: Full suite green, then commit**

Run: `npm test`
Expected: PASS.
```bash
git add package.json src/mcp-server.smoke.test.ts
git commit -m "feat: direct shebang'd entry + prepare build; drop child-spawn wrapper"
```

---

### Task 2: Single `.mcp.json` + plugin metadata, with cross-host verification (spec §3, §5-plugin.json; gaps #3, #7)

> **This is the spec's highest-risk item.** A single static `args` form must launch on both Claude Code and magelab, which substitute variables differently. Step 4 is a real cross-host verification with a decision branch — do not skip it.

**Files:**
- Create: `.mcp.json`
- Modify: `.claude-plugin/plugin.json`
- Create/extend: `src/standardization-guards.test.ts`

- [ ] **Step 1: Write a static guard test for `.mcp.json`**

Create `src/standardization-guards.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), "utf8"));

describe(".mcp.json", () => {
  it("is valid JSON declaring the doc-memory stdio server pointed at the built entry", () => {
    const cfg = readJson(".mcp.json");
    const server = cfg.mcpServers["doc-memory"];
    expect(server.command).toBe("node");
    expect(server.args.some((a: string) => a.endsWith("dist/mcp-server.js"))).toBe(true);
  });
});

describe(".claude-plugin/plugin.json", () => {
  it("has standard metadata and no inline mcpServers (moved to .mcp.json)", () => {
    const m = readJson(".claude-plugin/plugin.json");
    expect(m.name).toBe("doc-memory");
    expect(m.license).toBe("MIT");
    expect(typeof m.author).toBe("object"); // object form — string fails `validate --strict`
    expect(m.author.name).toBeTruthy();
    expect(m.mcpServers).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the guard test to verify it fails**

Run: `npx vitest run src/standardization-guards.test.ts`
Expected: FAIL (no `.mcp.json`; `plugin.json` still has `mcpServers` and no `license`/`author`).

- [ ] **Step 3: Create `.mcp.json` and rewrite `plugin.json`**

Create `.mcp.json` at the repo root (candidate form: the Claude Code-documented `${CLAUDE_PLUGIN_ROOT}` — Step 4 verifies/adjusts for magelab):
```json
{
  "mcpServers": {
    "doc-memory": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.js"],
      "env": {
        "DOC_MEMORY_DB": "~/.doc-memory/index.db"
      }
    }
  }
}
```
Replace `.claude-plugin/plugin.json` entirely (remove inline `mcpServers`; add metadata):
```json
{
  "name": "doc-memory",
  "version": "0.1.0",
  "description": "Semantic search for documents and chat history. Watches directories, indexes content with local embeddings, and provides hybrid FTS+vector search via MCP tools.",
  "author": { "name": "Max Carlson" },
  "homepage": "https://github.com/mcarlson/doc-memory",
  "repository": "https://github.com/mcarlson/doc-memory",
  "license": "MIT",
  "keywords": ["mcp", "semantic-search", "embeddings", "claude-code", "rag"]
}
```
Run: `npx vitest run src/standardization-guards.test.ts`
Expected: PASS.

- [ ] **Step 4: Cross-host launch verification (manual — the key risk; pick the working `args` form)**

The build from Task 1 must exist (`npm run build`). Verify the server actually loads under each host and resolve the `args` form:

1. **Claude Code** — add the repo as a local plugin and confirm tools load:
   ```bash
   claude --plugin-dir ~/doc-memory/.claude/worktrees/structural-standardization
   ```
   In the session, run `/mcp` and confirm a `doc-memory` server with 5 tools. If it shows "failed", note the error.
2. **magelab** — clone the branch into the Skills dir, `npm install`, activate, and confirm the tools appear:
   ```bash
   git clone -b feat/structural-standardization ~/doc-memory ~/Mage/Skills/doc-memory-test
   (cd ~/Mage/Skills/doc-memory-test && npm install)
   ```
   Activate in magelab (Settings → Skills & Plugins) and confirm `doc-memory` tools load.
3. **Decision:**
   - If BOTH load with `${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.js` → keep it.
   - If magelab fails to resolve the path (it substitutes `${VAR}` from `os.environ` at parse time and treats a relative path as plugin-dir-relative), change `.mcp.json` `args` to the bare-relative `["dist/mcp-server.js"]` and re-verify Claude Code. Keep whichever single form loads on both.
   - If NO single form loads on both, keep the Claude Code form in `.mcp.json` and add a magelab-specific note to the README install section (Task 3) documenting the magelab `args` value. Record the outcome in a comment at the top of `.mcp.json`.
   Clean up the magelab test clone afterward: `rm -rf ~/Mage/Skills/doc-memory-test`.

- [ ] **Step 5: Commit**

```bash
git add .mcp.json .claude-plugin/plugin.json src/standardization-guards.test.ts
git commit -m "feat: single .mcp.json + plugin metadata; verified cross-host launch"
```

---

### Task 3: Neutral package name + LICENSE + README cleanup (spec §4, §5, §6; gaps #6, #7)

**Files:**
- Modify: `package.json:2` (and metadata)
- Create: `LICENSE`
- Modify: `README.md` (lines ~144, 168, 181, 197, 302, 339, 357, 366, 379, 473)
- Modify: `src/standardization-guards.test.ts`
- Regenerate: `package-lock.json`

- [ ] **Step 1: Extend the guard test for naming + docs**

Append to `src/standardization-guards.test.ts`:
```ts
describe("package + README naming", () => {
  it("package.json is named doc-memory with MIT license", () => {
    const p = readJson("package.json");
    expect(p.name).toBe("doc-memory");
    expect(p.license).toBe("MIT");
  });
  it("README has no @fairgo/doc-memory or wrapper-path references", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).not.toMatch(/@fairgo\/doc-memory/);
    expect(readme).not.toMatch(/cli\/mcp-server-wrapper\.js/);
    expect(readme).not.toMatch(/not for redistribution/i);
  });
  it("documents the cross-host install matrix (Codex config.toml + magelab) with the watcher var", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).toMatch(/\[mcp_servers\.doc-memory\]/); // Codex TOML
    expect(readme).toMatch(/DOC_MEMORY_WATCH/);            // watcher var (N8)
    expect(readme).toMatch(/Mage\/Skills/);                // magelab
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/standardization-guards.test.ts -t "naming"`
Expected: FAIL (package is `@fairgo/doc-memory`; README still has the old refs + license line).

- [ ] **Step 3: Rename the package and add metadata in `package.json`**

Set `"name": "doc-memory"` (was `@fairgo/doc-memory`) and add, alongside the existing fields:
```json
  "license": "MIT",
  "author": "Max Carlson",
  "homepage": "https://github.com/mcarlson/doc-memory",
  "repository": { "type": "git", "url": "https://github.com/mcarlson/doc-memory.git" },
  "keywords": ["mcp", "semantic-search", "embeddings", "claude-code", "rag"],
```

- [ ] **Step 4: Create `LICENSE` (MIT)**

Create `LICENSE` with the standard MIT text:
```
MIT License

Copyright (c) 2026 Max Carlson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Update `README.md`**

Make these exact replacements:
- Install (~line 144): replace
  ```
  npm install @fairgo/doc-memory
  ```
  with
  ```
  git clone https://github.com/mcarlson/doc-memory.git
  cd doc-memory && npm install   # builds dist/ via the prepare script
  ```
- The 3 manual-config blocks (~lines 168, 181, 197): replace every
  `"/path/to/doc-memory/cli/mcp-server-wrapper.js"` with
  `"/path/to/doc-memory/dist/mcp-server.js"`.
- The 5 import examples (~lines 302, 339, 357, 366, 379): replace every
  `from '@fairgo/doc-memory'` with `from 'doc-memory'`.
- License (~line 473): replace
  ```
  Private — not for redistribution.
  ```
  with
  ```
  MIT — see [LICENSE](./LICENSE).
  ```
- Add a cross-host **Install** matrix section (spec §6) covering all three hosts. After the shared `git clone … && npm install` step, document each host:
  ````md
  ### Claude Code
  Add the checkout as a local plugin (`claude --plugin-dir /path/to/doc-memory`); the bundled `.mcp.json` is auto-loaded. (Marketplace install is not yet supported — see the publish-tier follow-up.)

  ### Codex
  Codex does not read `.claude-plugin/plugin.json`. After `npm install`, add to `~/.codex/config.toml`:

  ```toml
  [mcp_servers.doc-memory]
  command = "node"
  args = ["/abs/path/to/doc-memory/dist/mcp-server.js"]
    [mcp_servers.doc-memory.env]
    DOC_MEMORY_DB = "~/.doc-memory/index.db"
    DOC_MEMORY_WATCH = "~/notes:**/*.md"   # required — the watcher no-ops without it
  ```

  ### magelab
  Clone into `~/Mage/Skills/doc-memory` and run `npm install` (magelab does not auto-install plugin deps); it is discovered via `.mcp.json`.
  ````
  (If Task 2 Step 4 found that magelab needs a different `.mcp.json` `args` form, note that magelab value here too.)

(Verify the stale refs are gone: `grep -n "@fairgo/doc-memory\|cli/mcp-server-wrapper.js\|not for redistribution" README.md` returns nothing.)

- [ ] **Step 6: Regenerate the lockfile, run guards + full suite, commit**

Run:
```bash
npm install                          # refreshes package-lock.json "name"
npx vitest run src/standardization-guards.test.ts
npm test
```
Expected: PASS.
```bash
git add package.json package-lock.json LICENSE README.md src/standardization-guards.test.ts
git commit -m "feat: rename to doc-memory, add MIT LICENSE + metadata, fix README"
```

---

### Task 4: Remove the dead `'magelab'` enum (spec §7; gap #8)

**Files:**
- Modify: `src/types.ts:86`
- Modify: `src/standardization-guards.test.ts`

- [ ] **Step 1: Add a guard that the enum member is gone**

Append to `src/standardization-guards.test.ts`:
```ts
describe("SourceConfig.format", () => {
  it("no longer declares the unused 'magelab' member", () => {
    const types = readFileSync(join(root, "src/types.ts"), "utf8");
    expect(types).not.toMatch(/'magelab'/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/standardization-guards.test.ts -t "format"`
Expected: FAIL (`'magelab'` still present at `src/types.ts:86`).

- [ ] **Step 3: Remove the member**

In `src/types.ts:86`, change:
```ts
  format?: 'claude-jsonl' | 'magelab';
```
to:
```ts
  format?: 'claude-jsonl';
```

- [ ] **Step 4: Typecheck, build, and run the suite**

Run: `npm run build && npm test`
Expected: PASS (no consumers of `'magelab'`, so `tsc` and tests are unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/standardization-guards.test.ts
git commit -m "refactor: drop unused 'magelab' SourceConfig.format member"
```

---

### Task 5: Agent frontmatter (spec §8; gap #9)

**Files:**
- Modify: `agents/doc-search.md:1`
- Modify: `src/standardization-guards.test.ts`

- [ ] **Step 1: Add a guard for the agent frontmatter**

Append to `src/standardization-guards.test.ts`:
```ts
describe("agents/doc-search.md", () => {
  it("starts with YAML frontmatter declaring name + description", () => {
    const md = readFileSync(join(root, "agents/doc-search.md"), "utf8");
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toMatch(/\nname:\s*doc-search\b/);
    expect(md).toMatch(/\ndescription:\s*\S+/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/standardization-guards.test.ts -t "doc-search"`
Expected: FAIL (file currently starts with `# doc-search Agent`).

- [ ] **Step 3: Prepend frontmatter to `agents/doc-search.md`**

Insert at the very top of the file (before the existing `# doc-search Agent` heading):
```md
---
name: doc-search
description: Search and explore indexed documents using hybrid semantic + full-text search via the doc-memory MCP tools (search, expand, navigate, read, list).
---

```

- [ ] **Step 4: Run guard + full suite, commit**

Run: `npx vitest run src/standardization-guards.test.ts -t "doc-search" && npm test`
Expected: PASS.
```bash
git add agents/doc-search.md src/standardization-guards.test.ts
git commit -m "feat: add name/description frontmatter to doc-search agent"
```

---

### Task 6: Plugin validation (spec §9; gap #10)

**Files:** none (verification + a README note)

- [ ] **Step 1: Validate the plugin manifest**

Run: `claude plugin validate --strict .`
Expected: PASS with no errors. If it reports a field-type error on `author`, confirm `.claude-plugin/plugin.json` `author` is an object (not a string) — fix and re-run. (If the `claude` CLI is not installed, install it or run on a machine that has it; record the result.)

- [ ] **Step 2: Document the validation command in the README**

Add a short "Development" note to `README.md`:
```md
## Development

Validate the plugin manifest before distribution:

    claude plugin validate --strict .
```
(CI integration is a deliberate follow-up: there is no `.github/` yet and provisioning the `claude` CLI in CI is non-trivial.)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document claude plugin validate in README"
```

---

## Final verification

- [ ] `npm test` — full suite green (incl. smoke + all standardization guards).
- [ ] `npm run build` — `dist/mcp-server.js` exists, shebang'd, executable.
- [ ] `claude plugin validate --strict .` — passes.
- [ ] `grep -rn "@fairgo/doc-memory\|cli/mcp-server-wrapper\|'magelab'\|not for redistribution" . --include='*.ts' --include='*.json' --include='*.md' | grep -v node_modules` — no hits.
- [ ] Cross-host launch confirmed (Task 2 Step 4): Claude Code + magelab both load `doc-memory` tools; the working `.mcp.json` form is recorded.
- Do **not** push or open a PR unless asked — the work stays on `feat/structural-standardization`.

## Notes

- **Out of scope (publish tier, deferred):** npm publish, native-dep prebuilts, `npx -y doc-memory`, and Claude Code *marketplace* zero-config install. Until then every host needs a one-time `npm install`.
- **Out of scope:** fairgo vendoring/subtree (piece A); magelab MCP-host changes (piece C).
