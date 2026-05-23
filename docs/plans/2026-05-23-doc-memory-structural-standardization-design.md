# doc-memory — Structural Standardization (Design)

- **Date:** 2026-05-23
- **Repo:** `github.com/mcarlson/doc-memory`
- **Branch / worktree:** `feat/structural-standardization`
- **Status:** Revised after code review — pending spec re-review, then implementation plan

## Problem

`doc-memory` is a stdio MCP server and Claude Code plugin, but several structural
details stop it from loading unmodified across Claude Code, OpenAI Codex, and
magelab. An audit against the current Claude Code plugin spec, the MCP spec, and
the magelab compatibility matrix — refined by a code review — found:

1. **Child-spawn entry (anti-pattern).** `package.json` `bin` →
   `cli/mcp-server-wrapper.js`, which `spawn`s `node dist/mcp-server.js` as a
   child and forwards signals (`cli/mcp-server-wrapper.js:20`). The MCP guidance
   is explicit: a stdio server should be a *direct* entry.
2. **Dead-ends on a missing build.** The wrapper hard-errors
   (`cli/mcp-server-wrapper.js:14-18`) when `dist/` is absent.
3. **No `.mcp.json`, so magelab loads zero tools.** magelab consumes MCP servers
   **only** from a top-level `.mcp.json` (`backend/utils/plugin_discovery.py:218`;
   `plugin-compatibility.md:29,320`); inline `mcpServers` in `plugin.json` has no
   launch consumer in magelab. doc-memory ships no `.mcp.json`.
4. **Claude Code marketplace install never runs `npm install`.** CC copies a
   plugin to a read-only cache; it does not install deps or build. So a plugin
   with a build step + native deps (`better-sqlite3`, `sqlite-vec`,
   `@huggingface/transformers`) will not start when installed normally.
5. **No Codex registration.** Codex ignores `.claude-plugin/plugin.json` and
   reads `~/.codex/config.toml` `[mcp_servers.<name>]`. The README documents only
   Claude-style config.
6. **Consumer-scoped package name.** `package.json` is `@fairgo/doc-memory`
   (`package.json:2`) while `plugin.json` is the clean `doc-memory`. The README
   tells users to install/import `@fairgo/doc-memory` in 7 places.
7. **Missing plugin metadata + license.** No `author`, `homepage`, `repository`,
   `license`, `keywords`; no `LICENSE` file.
8. **Dead `magelab` enum.** `SourceConfig.format` declares
   `'claude-jsonl' | 'magelab'` (`src/types.ts:86`); `'magelab'` has zero
   consumers (only echoed in generated `dist/types.d.ts:79`).
9. **Agent lacks frontmatter.** `agents/doc-search.md:1` starts with a heading,
   not `name`/`description` YAML frontmatter.
10. **No plugin validation** in the workflow.

Already compliant (do not touch): real `StdioServerTransport`
(`src/mcp-server.ts:271`), env-var config with sane defaults, correct `~`
expansion *inside* the server (`src/mcp-server.ts:299,345`), `isEntrypoint` guard
that fires under `node dist/mcp-server.js` (`src/mcp-server.ts:381-384`), correct
`mcpServers` spelling, and only `plugin.json` inside `.claude-plugin/`.

## Goals

Make `doc-memory` structurally standard so it loads as a clean Claude Code
plugin, a Codex stdio MCP server, and a magelab plugin from one source tree,
self-provisioning its build + deps where the host allows.

## Non-goals (explicitly deferred)

- **npm publish + native-dep prebuilts** (`npx -y doc-memory`, true zero-config).
  Separate "publish tier" spec.
- **fairgo vendoring / subtree** ("piece A").
- **magelab MCP-host improvements + contribute-back** ("piece C") — see the
  magelab provisioning caveat under Risks.
- **MCP SDK modernization** (low-level `Server` → `McpServer`).

## Design

### 1. Direct, self-building entry (gaps #1, #2)

- Delete `cli/mcp-server-wrapper.js` (and the now-empty `cli/`).
- `package.json` `bin`: `{ "doc-memory": "dist/mcp-server.js" }`.
- esbuild `bundle` script (the **last** writer of `dist/mcp-server.js`, after
  `tsc`) emits the shebang and sets the exec bit:
  `--banner:js='#!/usr/bin/env node'` then `&& chmod +x dist/mcp-server.js`.
  (The shebang/exec bit is for `npx`/PATH use; the three target hosts all invoke
  `node …` explicitly, so it is not load-bearing for them — but it is standard.)
- Add `package.json` `prepare` (`"npm run build"`) so a manual `npm install`
  builds `dist/` with no committed artifacts. Note: esbuild externalizes the
  native deps (`--external:better-sqlite3`, etc.), so a built `dist/` still needs
  those packages resolvable at runtime — see #2.

### 2. Self-provisioning under Claude Code + magelab via a SessionStart hook (gap #4)

CC's read-only plugin cache never runs `npm install`/`prepare`, so add the
documented provisioning pattern:

- `hooks/hooks.json` with a **SessionStart** hook (command type) that, idempotently:
  ensures runtime deps are installed and `dist/` is built into a **writable**
  location, skipping work when already present.
- **Per-host writable target** (the key implementation detail to validate):
  - **Claude Code:** install/build into `${CLAUDE_PLUGIN_DATA}` (persistent,
    survives updates), since `${CLAUDE_PLUGIN_ROOT}` is read-only.
  - **magelab:** `${CLAUDE_PLUGIN_DATA}` is **not** provided and SessionStart env
    does not persist (`plugin-compatibility.md:41`), but the `~/Mage/Skills`
    clone *is* writable — so the hook provisions into the plugin dir
    (`${CLAUDE_PLUGIN_ROOT}` / `SKILL_PATH`) itself.
  - The hook detects which target to use (`CLAUDE_PLUGIN_DATA` set → use it; else
    the plugin dir).
- The MCP launch command (see #3) resolves deps from the provisioned location via
  `NODE_PATH` and the correct `dist/` path. Because `.mcp.json` `env` is static,
  the launch must work for both targets — resolved at implementation time
  (candidate: a tiny resolver that prefers `${CLAUDE_PLUGIN_DATA}` then the plugin
  dir; this is the one piece of indirection we keep, and it must remain
  in-process, not a child spawn).

### 3. Canonical `.mcp.json` (gap #3)

- Add a top-level `.mcp.json` as the single, cross-host MCP config (CC accepts it
  and it takes precedence over inline; magelab requires it). Remove the inline
  `mcpServers` from `plugin.json` to avoid two sources of truth.
- Server entry: `command: "node"`, `args: ["<resolved>/dist/mcp-server.js"]`,
  `env`: `DOC_MEMORY_DB` default + `NODE_PATH` to the provisioned `node_modules`
  (per #2). Uses `${CLAUDE_PLUGIN_ROOT}`, which both CC and magelab set.

### 4. Neutral package name (gap #6)

- Rename `package.json` `name` → `doc-memory`.
- Update the 7 `@fairgo/doc-memory` references in `README.md`
  (`:144,152,302,339,357,366,379`) and regenerate the lockfile.
- fairgo imports its own vendored copy, so this source rename is safe in
  isolation; fairgo reconciliation is piece A.

### 5. Metadata + LICENSE (gap #7)

- `plugin.json`: add `author` **as an object** (`{name,email,url}` — a string
  fails `claude plugin validate --strict`), `homepage`, `repository`
  (`github.com/mcarlson/doc-memory`), `license: "MIT"`, `keywords`.
- `package.json`: add `author` (string is conventional here), `license: "MIT"`,
  `repository`, `homepage`, `keywords` — note the `author` shape legitimately
  differs between the two manifests.
- Add a top-level `LICENSE` (MIT; copyright "Max Carlson" — confirm at
  implementation).

### 6. Cross-host registration docs (gap #5)

README "Install" matrix:

- **Claude Code** — install as a plugin; the SessionStart hook (#2) provisions
  deps + build on first session. (Manual `--plugin-dir` also works.)
- **Codex** — no hooks; user runs `npm install` once, then `~/.codex/config.toml`
  (underscore key; stdio):
  ```toml
  [mcp_servers.doc-memory]
  command = "node"
  args = ["/abs/path/to/doc-memory/dist/mcp-server.js"]
    [mcp_servers.doc-memory.env]
    DOC_MEMORY_DB = "~/.doc-memory/index.db"
  ```
  Codex does not read `.claude-plugin/plugin.json`.
- **magelab** — clone into `~/Mage/Skills/doc-memory`; the SessionStart hook
  provisions in-place.

### 7. Remove dead enum (gap #8)

- `src/types.ts:86`: `'claude-jsonl' | 'magelab'` → `'claude-jsonl'`.

### 8. Agent frontmatter (gap #9)

- Add `name`/`description` YAML frontmatter to `agents/doc-search.md`.

### 9. Plugin validation (gap #10)

- Document `claude plugin validate --strict` as the pre-distribution command and
  run it locally. A CI workflow is a **follow-up**: no `.github/` exists yet and
  provisioning the `claude` CLI in CI is non-trivial — note, don't block on it.

## Testing

- Existing `vitest` suite stays green.
- **stdio smoke test:** launch the built `dist/mcp-server.js`, do the MCP
  `initialize` + `tools/list` handshake over stdio, assert the five tools
  (`search`, `read`, `expand`, `navigate`, `list`) advertise.
- **Per-host load verification** (the goal is cross-host load, so test it):
  - CC: fresh plugin install → SessionStart hook provisions → server connects and
    tools list (validates #2/#3 end-to-end).
  - Codex: `config.toml` entry → `codex` lists doc-memory tools.
  - magelab: clone into Skills → SessionStart provisions in-place → tools load.
- `claude plugin validate --strict` passes.

## Acceptance criteria

- No `cli/mcp-server-wrapper.js`; `bin` → shebang'd `dist/mcp-server.js`.
- A SessionStart hook provisions deps + build into a writable location on CC and
  magelab; a top-level `.mcp.json` is the single MCP config.
- `package.json`/`plugin.json` named `doc-memory`, full metadata, MIT `LICENSE`;
  README + lockfile reference the new name.
- `src/types.ts` has no `'magelab'`; the agent has frontmatter.
- README documents CC + Codex + magelab registration.
- vitest green; stdio smoke test green; per-host load checks pass;
  `claude plugin validate --strict` passes.

## Risks

- **magelab provisioning is the weakest link.** No `${CLAUDE_PLUGIN_DATA}` and no
  persistent SessionStart env (`plugin-compatibility.md:41`); we rely on the
  writable Skills clone. If that proves insufficient (e.g., `NODE_PATH` not
  honored on magelab's launch), full magelab self-provisioning may require
  **piece C** (magelab host change) — flag, verify early, and fall back to a
  documented manual `npm install` for magelab if needed.
- **`prepare` footguns:** runs on every `npm install` in the repo (incl. CI
  installs → extra build time); for any future git-dependency consumer it also
  runs there (npm installs the git dep's devDeps for `prepare`, so it works).
  Correct hook for the clone-and-install model; not `postinstall`/`prepublishOnly`.
- **Native deps still need installing** until the publish tier ships prebuilts;
  the SessionStart hook's first run pays an `npm install` latency cost.
- **Rename ripple** beyond this repo is fairgo-internal (piece A).
