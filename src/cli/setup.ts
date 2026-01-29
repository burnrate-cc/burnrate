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

  // 5. Find MCP server path
  // When installed via npm, the MCP server is in the package's dist/ folder
  // When running from source, it's relative to this file
  let mcpServerPath: string;

  // Check if we're running from an npm install (dist/cli/setup.js)
  const distPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'mcp', 'server.js');
  if (fs.existsSync(distPath)) {
    mcpServerPath = distPath;
  } else {
    // Fallback: ask the user
    mcpServerPath = await ask(
      'Path to MCP server (dist/mcp/server.js)',
      path.join(process.cwd(), 'dist', 'mcp', 'server.js')
    );
  }

  console.log(`\nMCP server path: ${mcpServerPath}`);

  // 6. Write Claude Code settings
  const claudeSettingsDir = path.join(os.homedir(), '.claude');
  const claudeSettingsPath = path.join(claudeSettingsDir, 'settings.json');

  let settings: any = {};
  if (fs.existsSync(claudeSettingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf-8'));
    } catch {
      console.log('  ⚠ Could not parse existing settings.json, creating new one.');
    }
  }

  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  const env: Record<string, string> = {
    BURNRATE_API_URL: apiUrl
  };
  if (apiKey) {
    env.BURNRATE_API_KEY = apiKey;
  }

  settings.mcpServers.burnrate = {
    command: 'node',
    args: [mcpServerPath],
    env
  };

  // Ensure directory exists
  if (!fs.existsSync(claudeSettingsDir)) {
    fs.mkdirSync(claudeSettingsDir, { recursive: true });
  }

  fs.writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2));
  console.log(`\n✓ Claude Code MCP settings written to ${claudeSettingsPath}`);

  // 7. Summary
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                     SETUP COMPLETE                           ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Restart Claude Code to load the MCP server.                 ║
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
