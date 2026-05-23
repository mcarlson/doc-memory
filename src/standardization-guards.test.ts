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
