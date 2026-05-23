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
    expect(readme).toMatch(/Mage\/Skills/); // magelab
    // DOC_MEMORY_WATCH must appear INSIDE the Codex TOML block (it already
    // occurs in the Use-Cases section, so a bare /DOC_MEMORY_WATCH/ is a no-op):
    expect(readme).toMatch(/\[mcp_servers\.doc-memory\][\s\S]{0,400}DOC_MEMORY_WATCH/);
  });
});
