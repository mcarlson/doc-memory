# doc-memory — Structural Standardization (Design)

- **Date:** 2026-05-23
- **Repo:** `github.com/mcarlson/doc-memory`
- **Branch / worktree:** `feat/structural-standardization`
- **Status:** Revised after two review rounds — pending spec re-review, then implementation plan

## Problem

`doc-memory` is a stdio MCP server and Claude Code plugin, but several structural
details stop it from loading cleanly across Claude Code, OpenAI Codex, and
magelab from one source tree. Audit (refined by two code reviews):

1. **Child-spawn entry (anti-pattern).** `package.json` `bin` →
   `cli/mcp-server-wrapper.js`, which `spawn`s `node dist/mcp-server.js` and
   forwards signals (`cli/mcp-server-wrapper.js:20`).
2. **Dead-ends on a missing build** (`cli/mcp-server-wrapper.js:14-18`).
3. **No `.mcp.json`, so magelab loads zero tools.** magelab consumes MCP servers
   only from a top-level `.mcp.json` (`backend/utils/plugin_discovery.py:218`;
   `plugin-compatibility.md:29,320`); inline `mcpServers` has no magelab launch
   consumer. doc-memory ships no `.mcp.json`.
4. **No cwd-independent launch.** The server must run correctly regardless of the
   working directory or which host launches it.
5. **No Codex registration docs.** Codex ignores `.claude-plugin/plugin.json` and
   reads `~/.codex/config.toml` `[mcp_servers.<name>]`.
6. **Consumer-scoped package name** `@fairgo/doc-memory` (`package.json:2`) vs the
   clean `doc-memory` in `plugin.json`; README installs/imports `@fairgo/...` in
   7 places and configures the old wrapper path in 3 more.
7. **Missing metadata + license**, and `README.md:473` says "Private — not for
   redistribution," contradicting the intended MIT license.
8. **Dead `magelab` enum** (`src/types.ts:86`; zero consumers).
9. **Agent lacks frontmatter** (`agents/doc-search.md:1`) — and magelab's
   `PluginAgent.from_markdown` *raises* without a `name`, so the agent is
   currently unloadable there.
10. **No plugin validation** in the workflow.

Already compliant: real `StdioServerTransport` (`src/mcp-server.ts:271`),
env-var config with sane defaults, `~` expansion inside the server
(`src/mcp-server.ts:299,345`), `isEntrypoint` guard that fires under
`node dist/mcp-server.js` (`src/mcp-server.ts:381-384`).

## Goals

Make `doc-memory` a structurally standard, cwd-independent stdio MCP server that
loads as a Claude Code plugin, a Codex MCP server, and a magelab plugin from one
source tree after a **single documented `npm install` per host**.

## Non-goals (explicitly deferred)

- **Zero-config / auto-provisioning.** Each host runs a one-time `npm install`.
  (The SessionStart-hook auto-provision idea was dropped: verified that both CC
  and magelab connect the MCP server *before* SessionStart hooks run —
  `skill_tools.py:877-907` connect vs `:1006-1018` hooks — so a hook cannot make
  the server ready for the session that launches it.)
- **npm publish + native-dep prebuilts** (`npx -y doc-memory`). The only path to
  true zero-config; deferred to a separate "publish tier" spec. Consequence: CC
  *marketplace* "install and go" is not supported here — CC use is via a manual
  checkout + `npm install`.
- **fairgo vendoring / subtree** ("piece A"); **magelab host changes**
  ("piece C"); **MCP SDK modernization**.

## Design

### 1. Direct, self-building entry (gaps #1, #2)

- Delete `cli/mcp-server-wrapper.js` (and empty `cli/`).
- `package.json` `bin`: `{ "doc-memory": "dist/mcp-server.js" }`.
- esbuild `bundle` (the **last** writer of `dist/mcp-server.js`, after `tsc`)
  emits `--banner:js='#!/usr/bin/env node'` then `&& chmod +x dist/mcp-server.js`.
  (Shebang/exec bit serve `npx`/PATH; the three hosts invoke `node …`.)
- `package.json` `prepare` (`"npm run build"`) so `npm install` builds `dist/`
  beside the package — no committed artifacts. Native deps install into the same
  `node_modules`, so `bin` and the `.mcp.json` launch both work post-install.

### 2. Cwd-independent (self-resolving) server (gap #4)

- The server must run correctly regardless of launch cwd. Node already resolves
  `node_modules` by walking up from the script's own directory, so a server
  installed beside its `node_modules` resolves its (externalized) native deps
  without `NODE_PATH`. Confirm this holds for the bundled `dist/mcp-server.js`
  and add a regression guard (launch from an unrelated cwd in the smoke test).
- No SessionStart hook, no `${CLAUDE_PLUGIN_DATA}`: deps + `dist/` live beside the
  installed package on every host (the writable checkout / Skills clone).

### 3. Single `.mcp.json` (gap #3) — concrete form is the first thing to verify

- Add a top-level `.mcp.json` as the single, cross-host MCP config (CC accepts it
  and it takes precedence over inline; magelab requires it). Remove inline
  `mcpServers` from `plugin.json`.
- **Open implementation question, pinned as the first task — not deferred:** the
  `args` path must resolve on *both* hosts, which substitute differently:
  - **CC** substitutes `${CLAUDE_PLUGIN_ROOT}` at launch → `args:
    ["${CLAUDE_PLUGIN_ROOT}/dist/mcp-server.js"]` is the documented CC form.
  - **magelab** substitutes `${VAR}` from `os.environ` at *parse* time (when
    `CLAUDE_PLUGIN_ROOT` is unset), leaves unknown vars literal, and treats a
    non-absolute path containing `/` as relative to the plugin dir
    (`plugin_types.py:26`, `skill_tools.py:114-143`) → magelab wants bare
    `args: ["dist/mcp-server.js"]`.
  A single static `args` value may not satisfy both. **Task 1 of implementation:
  empirically determine the one form that launches on CC *and* magelab** (likely
  candidates: bare-relative `["dist/mcp-server.js"]` if CC runs with cwd = plugin
  dir; otherwise accept that CC and magelab need separate documented
  registration and `.mcp.json` targets CC+magelab-compatible hosts only). The
  chosen form goes in the spec's plan before any other change.

### 4. Neutral name + doc/path cleanup (gap #6)

- Rename `package.json` `name` → `doc-memory`; regenerate the lockfile.
- Update README: the 7 `@fairgo/doc-memory` refs
  (`:144,152,302,339,357,366,379`) **and** the 3 manual-config blocks that point
  at `cli/mcp-server-wrapper.js` (`:168,181,197`) → `dist/mcp-server.js`.

### 5. Metadata + LICENSE (gap #7)

- `plugin.json`: `author` **as object** (`{name,email,url}` — string fails
  `--strict`; magelab reads `author.name`/`.email` only when dict,
  `plugin_types.py:106`), `homepage`, `repository`
  (`github.com/mcarlson/doc-memory`), `license: "MIT"`, `keywords`.
- `package.json`: `author` (string is conventional), `license: "MIT"`,
  `repository`, `homepage`, `keywords`.
- Add top-level MIT `LICENSE` (copyright "Max Carlson" — confirm).
- Fix `README.md:473` "Private — not for redistribution" → MIT.

### 6. Cross-host install docs (gap #5)

README "Install" matrix — shared step: clone/checkout → `npm install` (builds
`dist/` via `prepare`, installs native deps), then register:

- **Claude Code** — manual local plugin dir (`--plugin-dir` / add as a local
  plugin), since marketplace install won't `npm install`. Auto-loads the
  `.mcp.json`.
- **Codex** — `~/.codex/config.toml` (underscore key; stdio):
  ```toml
  [mcp_servers.doc-memory]
  command = "node"
  args = ["/abs/path/to/doc-memory/dist/mcp-server.js"]
    [mcp_servers.doc-memory.env]
    DOC_MEMORY_DB = "~/.doc-memory/index.db"
    DOC_MEMORY_WATCH = "~/notes:**/*.md"   # required — the watcher no-ops without it
  ```
- **magelab** — clone into `~/Mage/Skills/doc-memory`, `npm install` (matches
  magelab's "deps not auto-installed" guidance), discovered via `.mcp.json`.

### 7. Remove dead enum (gap #8)

- `src/types.ts:86`: `'claude-jsonl' | 'magelab'` → `'claude-jsonl'`. (Confirmed
  no consumers; confirm with author it isn't a planned stub.)

### 8. Agent frontmatter (gap #9)

- Add `name`/`description` YAML frontmatter to `agents/doc-search.md` (also makes
  it loadable on magelab).

### 9. Plugin validation (gap #10)

- Document + run `claude plugin validate --strict`. CI is a follow-up (no
  `.github/` yet; provisioning the `claude` CLI in CI is non-trivial).

## Testing

- `vitest` suite stays green.
- **stdio smoke test, launched from an unrelated cwd:** `initialize` +
  `tools/list` over stdio; assert the five tools (`search`, `read`, `expand`,
  `navigate`, `list`). Proves the direct, cwd-independent entry (gaps #1, #4).
- **Cross-host launch verification** (the goal is cross-host load): the chosen
  `.mcp.json` form actually starts the server and lists tools on CC and magelab;
  the documented Codex `config.toml` works.
- `claude plugin validate --strict` passes.

## Acceptance criteria

- No `cli/mcp-server-wrapper.js`; `bin` → shebang'd `dist/mcp-server.js`, runnable
  after `npm install` from any cwd.
- One top-level `.mcp.json`, with an `args` form verified to launch on CC and
  magelab (Task 1).
- `package.json`/`plugin.json` named `doc-memory`, full metadata, MIT `LICENSE`;
  README name refs, wrapper-path refs, and the `:473` license line all updated;
  lockfile regenerated.
- `src/types.ts` has no `'magelab'`; the agent has frontmatter.
- README documents CC + Codex + magelab install (one-time `npm install` each).
- vitest + smoke test green; per-host launch checks pass; `--strict` validate
  passes.

## Risks

- **The single `.mcp.json` args form (Task 1) is the main uncertainty.** If no
  single static form launches on both CC and magelab, fall back to documented
  per-host registration; do not pretend one file serves all.
- **No zero-config.** CC marketplace install and `npx` both need the publish
  tier; until then every host needs a one-time `npm install`.
- **Native-dep install latency** on first setup.
- **`prepare` footguns:** runs on every repo `npm install` (incl. CI → extra
  build time); for a future git-dependency consumer it also runs (npm installs
  the dep's devDeps for `prepare`). Correct hook for clone-and-install; not
  `postinstall`/`prepublishOnly`.
- **Rename ripple** beyond this repo is fairgo-internal (piece A).
