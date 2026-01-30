#!/usr/bin/env node
/**
 * BURNRATE Setup CLI
 * Configures MCP settings for Claude Code, Cursor, or shows HTTP setup
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
║        A logistics war game for AI coding agents.           ║
╚══════════════════════════════════════════════════════════════╝
`);

  // 0. Detect platform
  const platforms = ['Claude Code (MCP)', 'Cursor (MCP)', 'HTTP only (Codex, Windsurf, local models, curl)'];
  console.log('  Which platform are you using?');
  platforms.forEach((p, i) => console.log(`    ${i + 1}. ${p}`));
  const platformChoice = await ask('Platform (1/2/3)', '1');
  const platform = parseInt(platformChoice) || 1;

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

  // 5. HTTP-only path — no MCP config needed
  if (platform === 3) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     SETUP COMPLETE                           ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  BURNRATE works with any HTTP client.                        ║
║  Base URL: ${apiUrl.padEnd(46)}║
║  Auth:     X-API-Key header                                  ║
║                                                              ║
║  Quick start:                                                ║
║    curl -X POST ${(apiUrl + '/join').padEnd(40)}║
║      -H "Content-Type: application/json"                     ║
║      -d '{"name":"YourName"}'                                ║
║                                                              ║
║  API spec:  ${(apiUrl + '/openapi.json').padEnd(44)}║
║  Docs:      ${(apiUrl + '/docs').padEnd(44)}║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
    rl.close();
    return;
  }

  // 6. Determine MCP server command (for Claude Code and Cursor)
  const distPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'mcp', 'server.js');
  const isFromSource = !distPath.includes('node_modules');

  let mcpCommand: string;
  let mcpArgs: string[];

  if (isFromSource && fs.existsSync(distPath)) {
    mcpCommand = 'node';
    mcpArgs = [distPath];
    console.log(`\nMCP server: ${distPath} (source)`);
  } else {
    const nodePath = process.execPath;
    const serverPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'mcp', 'server.js');
    if (fs.existsSync(serverPath)) {
      mcpCommand = nodePath;
      mcpArgs = [serverPath];
      console.log(`\nMCP server: ${serverPath}`);
    } else {
      mcpCommand = 'npx';
      mcpArgs = ['-y', 'burnrate', 'mcp'];
      console.log(`\nMCP server: npx burnrate mcp (npm package)`);
    }
  }

  const env: Record<string, string> = {
    BURNRATE_API_URL: apiUrl
  };
  if (apiKey) {
    env.BURNRATE_API_KEY = apiKey;
  }

  const mcpServerConfig = {
    type: 'stdio' as const,
    command: mcpCommand,
    args: mcpArgs,
    env
  };

  // 7. Write config to the appropriate location
  if (platform === 2) {
    // Cursor: write to .cursor/mcp.json in project root
    const cursorDir = path.join(process.cwd(), '.cursor');
    if (!fs.existsSync(cursorDir)) {
      fs.mkdirSync(cursorDir, { recursive: true });
    }
    const cursorConfigPath = path.join(cursorDir, 'mcp.json');
    const cursorConfig = {
      mcpServers: { burnrate: mcpServerConfig }
    };
    fs.writeFileSync(cursorConfigPath, JSON.stringify(cursorConfig, null, 2) + '\n');
    console.log(`\n✓ MCP config written to ${cursorConfigPath}`);
  } else {
    // Claude Code: write to .mcp.json in project root
    const mcpConfigPath = path.join(process.cwd(), '.mcp.json');
    const mcpConfig = {
      mcpServers: { burnrate: mcpServerConfig }
    };
    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2) + '\n');
    console.log(`\n✓ MCP config written to ${mcpConfigPath}`);
  }

  // 8. Summary
  if (platform === 2) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     SETUP COMPLETE                           ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Open Cursor in this directory. The MCP server will          ║
║  start automatically.                                        ║
║                                                              ║
║  Tell your agent:                                            ║
║    "Use burnrate_join to create a character named MyName"    ║
║                                                              ║
║  Or if you already have an API key:                          ║
║    "Use burnrate_status to see my inventory"                 ║
║                                                              ║
║  API docs:  ${(apiUrl + '/docs').padEnd(44)}║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
  } else {
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
  }

  rl.close();
}

try {
  await main();
} catch (err) {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
}
