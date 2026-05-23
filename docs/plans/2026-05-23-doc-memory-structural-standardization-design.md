# doc-memory — Structural Standardization (Design)

- **Date:** 2026-05-23
- **Repo:** `github.com/mcarlson/doc-memory`
- **Branch / worktree:** `feat/structural-standardization`
- **Status:** Approved design — pending spec review, then implementation plan

## Problem

`doc-memory` is a stdio MCP server and Claude Code plugin, but several structural
details stop it from being a *bog-standard* plugin that loads unmodified across
Claude Code, OpenAI Codex, and magelab. An audit against the current Claude Code
plugin spec, the MCP spec, and the magelab compatibility matrix found:

1. **Child-spawn entry (anti-pattern).** `package.json` `bin` points at
   `cli/mcp-server-wrapper.js`, which `spawn`s `node dist/mcp-server.js` as a
   child and forwards signals. The MCP guidance is explicit: a stdio server
   should be a *direct* entry; wrapping it in a subprocess adds failure modes
   and complicates signal handling.
2. **Dead-ends on a missing build.** The wrapper hard-errors
   (`"Please run: npm run build"`) when `dist/` is absent, so the plugin does
   not work after a plain clone in any host.
3. **No Codex registration.** Codex ignores `.claude-plugin/plugin.json`
   entirely and reads `~/.codex/config.toml` `[mcp_servers.<name>]`. The README
   documents only Claude-style config, so Codex users have no path.
4. **Consumer-scoped package name.** `package.json` is named
   `@fairgo/doc-memory` — a general-purpose plugin scoped to one downstream
   consumer (`plugin.json` already uses the clean `doc-memory`).
5. **Missing plugin metadata + license.** No `author`, `homepage`,
   `repository`, `license`, or `keywords`; no `LICENSE` file.
6. **Dead `magelab` enum.** `SourceConfig.format` declares
   `'claude-jsonl' | 'magelab'`, but `'magelab'` has zero consumers anywhere in
   `src/`, `cli/`, or `dist/`.
7. **No plugin validation.** `claude plugin validate` is not part of the
   workflow, so silently-ignored manifest typos can ship.

Already compliant (do not touch): real `StdioServerTransport`, env-var config
with sane defaults, correct `~` expansion *inside* the server, correct
`mcpServers` spelling, `${CLAUDE_PLUGIN_ROOT}` usage, only `plugin.json` inside
`.claude-plugin/`, and the agent at the plugin root.

## Goals

Make `doc-memory` structurally standard so it loads as a clean Claude Code
plugin, a Codex stdio MCP server, and a magelab plugin from one source tree —
after a single documented `npm install` per host.

## Non-goals (explicitly deferred)

- **npm publish + native-dep prebuilts** (true zero-install `npx -y doc-memory`).
  This "publish tier" is a separate spec. Until then, each host runs a one-time
  `npm install`.
- **fairgo vendoring / subtree** (the "piece A" distribution decision).
- **magelab MCP-host improvements + contribute-back** (the "piece C" work).
- **MCP SDK modernization** (low-level `Server` → `McpServer`): out of scope; the
  current handler style is standard and works.

## Design

### 1. Direct, self-building entry (gaps #1, #2)

- Delete `cli/mcp-server-wrapper.js` (and the now-empty `cli/`).
- `package.json` `bin`: `{ "doc-memory": "dist/mcp-server.js" }`.
- `package.json` `bundle` script: have esbuild emit a shebang banner and mark
  the output executable, e.g. append
  `--banner:js='#!/usr/bin/env node'` and `&& chmod +x dist/mcp-server.js`.
- Add `package.json` `prepare` script (`"npm run build"`) so `npm install`
  produces `dist/` automatically. Rationale: `prepare` runs on local installs
  and git-dependency installs (devDeps `typescript`/`esbuild` are present), so
  clone → `npm install` → ready, with **no committed build artifacts**.
  (At the future publish tier, `prepare` behavior is revisited.)
- `.claude-plugin/plugin.json` `mcpServers.doc-memory`: point `args` directly at
  `${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.js` (command `node`), keeping the
  `DOC_MEMORY_DB` env default.
- Confirm `src/mcp-server.ts`'s `isEntrypoint` guard still fires when launched as
  `node dist/mcp-server.js` (the stdio smoke test below proves this).

### 2. Neutral package name (gap #4)

- Rename `package.json` `name`: `@fairgo/doc-memory` → `doc-memory`
  (`plugin.json` already says `doc-memory`).
- fairgo currently imports `@fairgo/doc-memory` from its **own vendored copy**,
  so this source-repo rename is safe in isolation; reconciling fairgo's
  consumption is the separate piece-A work.

### 3. Metadata + LICENSE (gap #5)

- Add to `plugin.json` and `package.json`: `author`, `homepage`,
  `repository` (`github.com/mcarlson/doc-memory`), `license: "MIT"`, `keywords`.
- Add a top-level `LICENSE` (MIT; copyright holder "Max Carlson" — confirm at
  implementation).

### 4. Cross-host registration docs (gap #3)

Add a README "Install" matrix with a shared first step (`git clone` →
`npm install`, which builds `dist/` via `prepare`) then per-host registration:

- **Claude Code** — installed as a plugin (auto-loads `plugin.json` `mcpServers`)
  or `claude mcp add`.
- **Codex** — `~/.codex/config.toml` (underscore key; stdio):
  ```toml
  [mcp_servers.doc-memory]
  command = "node"
  args = ["/abs/path/to/doc-memory/dist/mcp-server.js"]
    [mcp_servers.doc-memory.env]
    DOC_MEMORY_DB = "~/.doc-memory/index.db"
    DOC_MEMORY_WATCH = "~/notes:**/*.md"
  ```
  Note that Codex does not read `.claude-plugin/plugin.json`.
- **magelab** — clone into `~/Mage/Skills/doc-memory`, run `npm install` (magelab
  does not auto-install plugin deps), discovered via inline `mcpServers` (magelab
  supports `stdio` only).

### 5. Remove dead enum (gap #6)

- `src/types.ts`: `format?: 'claude-jsonl' | 'magelab';` → `format?: 'claude-jsonl';`
  (keep the field; drop the unused union member). `dist/types.d.ts` regenerates
  on build.

### 6. Plugin validation (gap #7)

- Add `claude plugin validate --strict` as a documented command and a CI step in
  `.github/`.

## Testing

- Existing `vitest` suite stays green.
- **New stdio smoke test:** launch the built `dist/mcp-server.js`, perform the MCP
  `initialize` handshake and `tools/list` over stdio, and assert the five tools
  (`search`, `read`, `expand`, `navigate`, `list`) are advertised. This is the
  end-to-end proof that replacing the wrapper with a direct entry keeps transport
  and signals intact.
- `claude plugin validate --strict` passes.

## Acceptance criteria

- No `cli/mcp-server-wrapper.js`; `bin` → shebang'd `dist/mcp-server.js`;
  `npm install` yields a runnable server (no manual build step).
- `package.json` and `plugin.json` named `doc-memory`, with full metadata, MIT
  license, and a `LICENSE` file.
- `src/types.ts` contains no `'magelab'`.
- README documents Claude Code + Codex + magelab registration.
- vitest green; stdio smoke test green; `claude plugin validate --strict` passes.

## Risks

- **`prepare` needs devDeps at install time.** True for the clone-and-install
  model; revisit at the publish tier.
- **Native deps still require `npm install`.** Inherent until the publish tier
  ships prebuilts; the docs are explicit that install is a required first step.
- **Rename ripple.** Anything importing `@fairgo/doc-memory` is fairgo-internal
  and handled in piece A; out of scope here.
