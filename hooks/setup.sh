#!/usr/bin/env bash
# Ensures better-sqlite3's native binary matches the running Node.js ABI.
# Runs silently if everything is fine; downloads the correct prebuilt if not.

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BSQ3="$PLUGIN_DIR/node_modules/better-sqlite3"

# Resolve the node binary (same one mage-lab will use for the MCP server)
NODE="$(command -v node 2>/dev/null)"
if [ -z "$NODE" ]; then
    echo "[doc-memory] node not found in PATH, skipping native module check" >&2
    exit 0
fi

# Nothing to do if the binary already loads cleanly.
# Path passed via env var to avoid shell interpolation into JS string literals.
if BSQ3_PATH="$BSQ3" "$NODE" -e "require(process.env.BSQ3_PATH)" 2>/dev/null; then
    exit 0
fi

echo "[doc-memory] better-sqlite3 ABI mismatch for $("$NODE" --version), fetching prebuilt..." >&2

# Resolve prebuild-install via Node's module resolution from within the
# better-sqlite3 package, so it works regardless of npm hoisting layout.
PREBUILD="$(cd "$BSQ3" && "$NODE" -e "process.stdout.write(require.resolve('prebuild-install/bin.js'))" 2>/dev/null)"
if [ -z "$PREBUILD" ]; then
    echo "[doc-memory] prebuild-install not found — run: npm install" >&2
    exit 1
fi

if (cd "$BSQ3" && "$NODE" "$PREBUILD" >&2); then
    echo "[doc-memory] better-sqlite3 prebuilt installed successfully" >&2
else
    echo "[doc-memory] Failed to install prebuilt — MCP server may not start" >&2
    exit 1
fi
