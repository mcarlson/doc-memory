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
  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

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
    expect(tools.map((t) => t.name).sort()).toEqual([
      "expand",
      "list",
      "navigate",
      "read",
      "search",
    ]);
  }, 30_000);

  it("is shebang'd and executable", () => {
    expect(readFileSync(serverPath, "utf8").startsWith("#!/usr/bin/env node")).toBe(
      true,
    );
    expect(statSync(serverPath).mode & 0o111).toBeTruthy();
  });
});
