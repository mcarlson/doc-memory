#!/usr/bin/env node
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || join(__dirname, '..');

async function main() {
  const mcpServerPath = join(PLUGIN_ROOT, 'dist', 'mcp-server.js');

  if (!existsSync(mcpServerPath)) {
    console.error(`ERROR: MCP server not found at ${mcpServerPath}`);
    console.error('Please run: npm run build');
    process.exit(1);
  }

  const child = spawn(process.execPath, [mcpServerPath], {
    stdio: 'inherit',
    shell: false,
  });

  process.on('SIGTERM', () => child.kill('SIGTERM'));
  process.on('SIGINT', () => child.kill('SIGINT'));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code || 0);
    }
  });
}

main().catch(console.error);
