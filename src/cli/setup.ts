#!/usr/bin/env node
/**
 * BURNRATE Setup CLI
 * Configures Claude Code MCP settings for BURNRATE
 *
 * Usage: npx burnrate setup
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question: string, defaultValue?: string): Promise<string> {
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    BURNRATE SETUP                            ║
║              The front doesn't feed itself.                  ║
╚══════════════════════════════════════════════════════════════╝
`);

  // 1. Get API URL
  const apiUrl = await ask(
    'API server URL',
    'https://burnrate-api-server-production.up.railway.app'
  );

  // 2. Get API key (optional — can join later)
  const apiKey = await ask(
    'API key (press Enter to skip — you can join in-game later)',
    ''
  );

  // 3. Validate connection
  console.log(`\nTesting connection to ${apiUrl}...`);
  try {
    const response = await fetch(`${apiUrl}/health`);
    const data = await response.json() as any;
    if (data.status === 'ok') {
      console.log(`  ✓ Server is online (tick ${data.tick})`);
    } else {
      console.log(`  ⚠ Server responded but may have issues: ${JSON.stringify(data)}`);
    }
  } catch (error) {
    console.log(`  ✗ Could not reach ${apiUrl}`);
    console.log(`    Make sure the server is running and the URL is correct.`);
    const proceed = await ask('Continue anyway? (y/n)', 'n');
    if (proceed.toLowerCase() !== 'y') {
      rl.close();
      process.exit(1);
    }
  }

  // 4. If we have an API key, validate it
  if (apiKey) {
    console.log('\nValidating API key...');
    try {
      const response = await fetch(`${apiUrl}/me`, {
        headers: { 'X-API-Key': apiKey }
      });
      if (response.ok) {
        const data = await response.json() as any;
        console.log(`  ✓ Authenticated as ${data.name} (${data.tier} tier, ${data.reputation} rep)`);
      } else {
        console.log('  ✗ Invalid API key. You can set it later in your MCP config.');
      }
    } catch {
      console.log('  ⚠ Could not validate key (server unreachable).');
    }
  }

  // 5. Determine MCP server command
  // Detect whether we're running from source (git clone) or npm install
  const distPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'mcp', 'server.js');
  const isFromSource = !distPath.includes('node_modules');

  let mcpCommand: string;
  let mcpArgs: string[];

  if (isFromSource && fs.existsSync(distPath)) {
    // Running from cloned source — use direct node path
    mcpCommand = 'node';
    mcpArgs = [distPath];
    console.log(`\nMCP server: ${distPath} (source)`);
  } else {
    // Installed via npx/npm — find the global or local node + server path
    // Using absolute paths is most reliable for MCP servers
    const nodePath = process.execPath; // absolute path to current node binary
    // Resolve the server.js path relative to this setup script
    const serverPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'mcp', 'server.js');
    if (fs.existsSync(serverPath)) {
      mcpCommand = nodePath;
      mcpArgs = [serverPath];
      console.log(`\nMCP server: ${serverPath}`);
    } else {
      // Fallback: use npx
      mcpCommand = 'npx';
      mcpArgs = ['-y', 'burnrate', 'mcp'];
      console.log(`\nMCP server: npx burnrate mcp (npm package)`);
    }
  }

  // 6. Write .mcp.json in the current directory
  // Claude Code reads MCP server config from .mcp.json at the project level
  const mcpConfigPath = path.join(process.cwd(), '.mcp.json');

  const env: Record<string, string> = {
    BURNRATE_API_URL: apiUrl
  };
  if (apiKey) {
    env.BURNRATE_API_KEY = apiKey;
  }

  const mcpConfig: any = {
    mcpServers: {
      burnrate: {
        type: 'stdio',
        command: mcpCommand,
        args: mcpArgs,
        env
      }
    }
  };

  fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + '\n');
  console.log(`\n✓ MCP config written to ${mcpConfigPath}`);

  // 7. Summary
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     SETUP COMPLETE                           ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Start Claude Code from this directory:                      ║
║    claude                                                    ║
║                                                              ║
║  Then ask Claude:                                            ║
║    "Use burnrate_join to create a character named MyName"    ║
║                                                              ║
║  Or if you already have an API key:                          ║
║    "Use burnrate_status to see my inventory"                 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);

  rl.close();
}

try {
  await main();
} catch (err) {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
}
