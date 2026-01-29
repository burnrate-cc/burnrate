#!/usr/bin/env node
/**
 * BURNRATE CLI
 * A logistics war MMO for Claude Code
 * The front doesn't feed itself.
 */

// Route 'setup' command to the setup script before loading heavy dependencies
if (process.argv[2] === 'setup') {
  const { setupComplete } = await import('./setup.js');
  await setupComplete;
  process.exit(0);
}

import { Command } from 'commander';
import { GameDatabase } from '../db/database.js';
import { GameEngine } from '../core/engine.js';
import { generateWorld, seedMarkets } from '../core/worldgen.js';
import { formatView, formatZone, formatRoutes, formatMarket, formatShipments, formatEvents, formatHelp } from './format.js';
import { getSupplyState, TIER_LIMITS, SHIPMENT_SPECS, Resource } from '../core/types.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Database path
const DB_DIR = path.join(os.homedir(), '.burnrate');
const DB_PATH = path.join(DB_DIR, 'game.db');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize
const db = new GameDatabase(DB_PATH);
const engine = new GameEngine(db);

// Check if world needs initialization
const zones = db.getAllZones();
if (zones.length === 0) {
  console.log('Initializing new world for Season 1...');
  generateWorld(db);
  seedMarkets(db);
  console.log('World created. Welcome to BURNRATE.\n');
}

// Get or create player session
function getPlayer(name?: string) {
  const configPath = path.join(DB_DIR, 'player.json');

  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return db.getPlayer(config.playerId);
  }

  if (!name) {
    return null;
  }

  // Create new player
  const hubs = db.getAllZones().filter(z => z.type === 'hub');
  const startZone = hubs[0];
  const player = db.createPlayer(name, startZone.id);

  fs.writeFileSync(configPath, JSON.stringify({ playerId: player.id }));
  return player;
}

const program = new Command();

program
  .name('burnrate')
  .description('A logistics war MMO for Claude Code. The front doesn\'t feed itself.')
  .version('0.1.0');

// ============================================================================
// VIEW COMMANDS
// ============================================================================

program
  .command('view')
  .description('View the world state and your status')
  .argument('[target]', 'What to view: zone, routes, market, shipments, events')
  .argument('[id]', 'Target ID (zone name, resource, etc.)')
  .action((target, id) => {
    const player = getPlayer();

    if (!target) {
      // Main dashboard
      if (!player) {
        console.log('No player found. Run: burnrate join <name>');
        return;
      }
      console.log(formatView(db, player));
      return;
    }

    switch (target) {
      case 'zone': {
        const zoneName = id;
        const allZones = db.getAllZones();
        const zone = zoneName
          ? allZones.find(z => z.name.toLowerCase() === zoneName.toLowerCase())
          : player ? db.getZone(player.locationId) : allZones[0];
        if (!zone) {
          console.log(`Zone not found: ${zoneName}`);
          return;
        }
        console.log(formatZone(db, zone));
        break;
      }

      case 'routes': {
        const fromZone = player ? db.getZone(player.locationId) : null;
        if (!fromZone) {
          console.log('Join the game first: burnrate join <name>');
          return;
        }
        console.log(formatRoutes(db, fromZone.id));
        break;
      }

      case 'market': {
        const resource = id;
        const zoneId = player?.locationId;
        if (!zoneId) {
          console.log('Join the game first: burnrate join <name>');
          return;
        }
        console.log(formatMarket(db, zoneId, resource));
        break;
      }

      case 'shipments': {
        if (!player) {
          console.log('Join the game first: burnrate join <name>');
          return;
        }
        const shipments = db.getPlayerShipments(player.id);
        console.log(formatShipments(shipments));
        break;
      }

      case 'events': {
        const limit = id ? parseInt(id) : 20;
        const events = db.getEvents({ limit, actorId: player?.id });
        console.log(formatEvents(events));
        break;
      }

      default:
        console.log(`Unknown view target: ${target}`);
        console.log('Try: zone, routes, market, shipments, events');
    }
  });

// ============================================================================
// JOIN COMMAND
// ============================================================================

program
  .command('join')
  .description('Join the game with a new character')
  .argument('<name>', 'Your player name')
  .action((name) => {
    const existing = db.getPlayerByName(name);
    if (existing) {
      console.log(`Name "${name}" is taken. Choose another.`);
      return;
    }

    const player = getPlayer(name);
    if (player) {
      console.log(`\nWelcome to BURNRATE, ${player.name}!`);
      console.log(`\nYou start at ${db.getZone(player.locationId)?.name} with:`);
      console.log(`  ${player.inventory.credits} credits`);
      console.log(`  Courier license (can ship up to 10 units)`);
      console.log(`\nRun 'burnrate view' to see the world.`);
      console.log(`Run 'burnrate help' for commands.\n`);
    }
  });

// ============================================================================
// ROUTE COMMAND
// ============================================================================

program
  .command('route')
  .description('View direct routes from a zone')
  .argument('[from]', 'Zone name (defaults to your location)')
  .action((from) => {
    const player = getPlayer();
    const allZones = db.getAllZones();

    let fromZone;
    if (from) {
      fromZone = allZones.find(z => z.name.toLowerCase() === from.toLowerCase());
      if (!fromZone) {
        console.log(`Zone not found: ${from}`);
        return;
      }
    } else if (player) {
      fromZone = db.getZone(player.locationId);
    } else {
      console.log('Specify a zone or join the game first');
      return;
    }

    if (!fromZone) return;

    const routes = db.getRoutesFromZone(fromZone.id);
    if (routes.length === 0) {
      console.log(`\nNo routes from ${fromZone.name}\n`);
      return;
    }

    console.log(`\n┌─ ROUTES FROM: ${fromZone.name} ─────────────────────────────────┐`);
    console.log(`│ Destination          │ Dist │ Risk  │ Choke │`);
    console.log(`├──────────────────────┼──────┼───────┼───────┤`);

    for (const route of routes) {
      const toZone = db.getZone(route.toZoneId);
      const name = (toZone?.name || 'Unknown').padEnd(20).slice(0, 20);
      const dist = route.distance.toString().padStart(4);
      const risk = (Math.round(route.baseRisk * 100) + '%').padStart(5);
      const choke = route.chokepointRating.toFixed(1).padStart(5);
      console.log(`│ ${name} │ ${dist} │ ${risk} │ ${choke} │`);
    }

    console.log(`└──────────────────────┴──────┴───────┴───────┘`);
    console.log(`\nMulti-hop routing? Build your own pathfinder.\n`);
  });

// ============================================================================
// SHIP COMMAND
// ============================================================================

program
  .command('ship')
  .description('Create a shipment to move cargo')
  .requiredOption('--to <zone>', 'Destination zone')
  .requiredOption('--cargo <cargo>', 'Cargo in format "resource:amount,resource:amount"')
  .option('--type <type>', 'Shipment type: courier, freight, convoy', 'courier')
  .option('--via <zones>', 'Intermediate zones for multi-hop (comma-separated)')
  .action((options) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    // Parse cargo
    const cargo: Record<string, number> = {};
    for (const part of options.cargo.split(',')) {
      const [resource, amount] = part.split(':');
      cargo[resource.trim()] = parseInt(amount);
    }

    // Find zones
    const allZones = db.getAllZones();
    const fromZone = db.getZone(player.locationId);
    const toZone = allZones.find(z => z.name.toLowerCase() === options.to.toLowerCase());

    if (!fromZone) {
      console.log('Could not determine your location');
      return;
    }
    if (!toZone) {
      console.log(`Zone not found: ${options.to}`);
      return;
    }

    // Build path
    const path: string[] = [fromZone.id];

    if (options.via) {
      // Multi-hop: player specified waypoints
      for (const waypoint of options.via.split(',')) {
        const zone = allZones.find(z => z.name.toLowerCase() === waypoint.trim().toLowerCase());
        if (!zone) {
          console.log(`Waypoint not found: ${waypoint}`);
          return;
        }
        path.push(zone.id);
      }
    }

    path.push(toZone.id);

    // Validate all legs have direct routes
    for (let i = 0; i < path.length - 1; i++) {
      const routes = db.getRoutesBetween(path[i], path[i + 1]);
      if (routes.length === 0) {
        const fromName = db.getZone(path[i])?.name || path[i];
        const toName = db.getZone(path[i + 1])?.name || path[i + 1];
        console.log(`\n✗ No direct route: ${fromName} → ${toName}`);
        console.log(`  Use 'burnrate route ${fromName}' to see connections\n`);
        return;
      }
    }

    const result = engine.createShipmentWithPath(
      player.id,
      options.type,
      path,
      cargo
    );

    if (result.success && result.shipment) {
      const pathNames = path.map(id => db.getZone(id)?.name.split('.').pop() || id.slice(0, 6));
      console.log(`\nShipment #${result.shipment.id.slice(0, 8)} created`);
      console.log(`├─ Type: ${result.shipment.type}`);
      console.log(`├─ Route: ${pathNames.join(' → ')}`);
      console.log(`├─ Hops: ${path.length - 1}`);
      console.log(`└─ Status: In transit\n`);
    } else {
      console.log(`\n✗ ${result.error}\n`);
    }
  });

// ============================================================================
// TRADE COMMANDS
// ============================================================================

program
  .command('buy')
  .description('Place a buy order')
  .argument('<resource>', 'Resource to buy')
  .argument('<quantity>', 'Amount to buy')
  .option('--limit <price>', 'Max price per unit')
  .action((resource, quantity, options) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const price = options.limit ? parseInt(options.limit) : 100;  // Default high limit
    const qty = parseInt(quantity);

    const result = engine.placeOrder(
      player.id,
      player.locationId,
      resource,
      'buy',
      price,
      qty
    );

    if (result.success) {
      console.log(`\n✓ Buy order placed: ${qty} ${resource} at ${price} cr/unit\n`);
    } else {
      console.log(`\n✗ ${result.error}\n`);
    }
  });

program
  .command('sell')
  .description('Place a sell order')
  .argument('<resource>', 'Resource to sell')
  .argument('<quantity>', 'Amount to sell')
  .option('--limit <price>', 'Min price per unit')
  .action((resource, quantity, options) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const price = options.limit ? parseInt(options.limit) : 1;  // Default low limit
    const qty = parseInt(quantity);

    const result = engine.placeOrder(
      player.id,
      player.locationId,
      resource,
      'sell',
      price,
      qty
    );

    if (result.success) {
      console.log(`\n✓ Sell order placed: ${qty} ${resource} at ${price} cr/unit\n`);
    } else {
      console.log(`\n✗ ${result.error}\n`);
    }
  });

// ============================================================================
// SCAN COMMAND
// ============================================================================

program
  .command('scan')
  .description('Gather intel on a zone or route')
  .argument('<target>', 'Zone name or route ID')
  .action((target) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    // Try to find as zone first
    const allZones = db.getAllZones();
    const zone = allZones.find(z => z.name.toLowerCase() === target.toLowerCase());

    if (zone) {
      const result = engine.scan(player.id, 'zone', zone.id);
      if (result.success && result.intel) {
        console.log(`\n┌─ INTEL: ${zone.name} ───────────────────────────┐`);
        console.log(`│ Type: ${result.intel.type}`);
        console.log(`│ Owner: ${result.intel.owner || 'Neutral'}`);
        console.log(`│ Supply: ${result.intel.supplyState} (${Math.round(result.intel.supplyLevel)}%)`);
        console.log(`│ Market Activity: ${result.intel.marketActivity} orders`);
        console.log(`└───────────────────────────────────────────────────┘\n`);
      } else {
        console.log(`\n✗ ${result.error}\n`);
      }
    } else {
      console.log(`Zone not found: ${target}`);
    }
  });

// ============================================================================
// SUPPLY COMMAND
// ============================================================================

program
  .command('supply')
  .description('Deposit Supply Units to a zone')
  .argument('<amount>', 'Amount of SU to deposit')
  .action((amount) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const result = engine.depositSU(player.id, player.locationId, parseInt(amount));
    if (result.success) {
      const zone = db.getZone(player.locationId);
      console.log(`\n✓ Deposited ${amount} SU to ${zone?.name}`);
      console.log(`  New stockpile: ${zone?.suStockpile} SU\n`);
    } else {
      console.log(`\n✗ ${result.error}\n`);
    }
  });


// ============================================================================
// TICK COMMAND (for testing/development)
// ============================================================================

program
  .command('tick')
  .description('Process a game tick (dev/testing)')
  .option('--count <n>', 'Number of ticks to process', '1')
  .action((options) => {
    const count = parseInt(options.count);
    for (let i = 0; i < count; i++) {
      const result = engine.processTick();
      if (i === count - 1) {
        console.log(`\nTick ${result.tick} processed. ${result.events.length} events.\n`);
      }
    }
  });

// ============================================================================
// DEV COMMANDS
// ============================================================================

program
  .command('dev:grant')
  .description('Grant resources to yourself (dev/testing)')
  .argument('<resource>', 'Resource to grant (or "starter" for a starter pack)')
  .argument('[amount]', 'Amount to grant', '100')
  .action((resource, amount) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const newInventory = { ...player.inventory };

    if (resource === 'starter') {
      // Starter pack for testing
      newInventory.credits += 5000;
      newInventory.ore += 100;
      newInventory.fuel += 100;
      newInventory.grain += 100;
      newInventory.fiber += 100;
      newInventory.rations += 50;
      newInventory.parts += 50;
      newInventory.ammo += 50;
      console.log('\n✓ Starter pack granted: 5000 cr + raw materials + supplies\n');
    } else if (resource === 'credits') {
      newInventory.credits += parseInt(amount);
      console.log(`\n✓ Granted ${amount} credits\n`);
    } else if (resource in newInventory) {
      (newInventory as any)[resource] += parseInt(amount);
      console.log(`\n✓ Granted ${amount} ${resource}\n`);
    } else {
      console.log(`Unknown resource: ${resource}`);
      return;
    }

    db.updatePlayer(player.id, { inventory: newInventory });
  });

program
  .command('dev:move')
  .description('Teleport to a zone (dev/testing)')
  .argument('<zone>', 'Zone name to move to')
  .action((zoneName) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const allZones = db.getAllZones();
    const zone = allZones.find(z => z.name.toLowerCase() === zoneName.toLowerCase());

    if (!zone) {
      console.log(`Zone not found: ${zoneName}`);
      console.log('Available zones:', allZones.map(z => z.name).join(', '));
      return;
    }

    db.updatePlayer(player.id, { locationId: zone.id });
    console.log(`\n✓ Teleported to ${zone.name}\n`);
  });

// ============================================================================
// FACTION COMMANDS
// ============================================================================

program
  .command('faction')
  .description('Faction management')
  .argument('<action>', 'Action: create, info, join, leave, deposit, members')
  .argument('[args...]', 'Action arguments')
  .action((action, args) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    switch (action) {
      case 'create': {
        if (args.length < 2) {
          console.log('Usage: burnrate faction create <name> <tag>');
          return;
        }
        const [name, tag] = args;
        if (player.factionId) {
          console.log('You are already in a faction. Leave first.');
          return;
        }
        const faction = db.createFaction(name, tag.toUpperCase(), player.id);
        console.log(`\n✓ Faction "${faction.name}" [${faction.tag}] created!`);
        console.log(`  You are the Founder.\n`);
        break;
      }

      case 'info': {
        const factionId = player.factionId || args[0];
        if (!factionId) {
          console.log('You are not in a faction. Specify faction ID or join one.');
          return;
        }
        const faction = db.getFaction(factionId);
        if (!faction) {
          console.log('Faction not found.');
          return;
        }
        console.log(`\n┌─ FACTION: ${faction.name} [${faction.tag}] ───────────────────────┐`);
        console.log(`│ Members: ${faction.members.length}/50`);
        console.log(`│ Controlled Zones: ${faction.controlledZones.length}`);
        console.log(`│ Treasury: ${faction.treasury.credits} cr`);
        console.log(`│ Upgrades:`);
        console.log(`│   Relay Network: ${faction.upgrades.relayNetwork}`);
        console.log(`│   Route Fortification: ${faction.upgrades.routeFortification}`);
        console.log(`│   Production Bonus: ${faction.upgrades.productionBonus}`);
        console.log(`└────────────────────────────────────────────────────────────┘\n`);
        break;
      }

      case 'members': {
        if (!player.factionId) {
          console.log('You are not in a faction.');
          return;
        }
        const faction = db.getFaction(player.factionId);
        if (!faction) return;
        console.log(`\n┌─ MEMBERS: ${faction.name} ────────────────────────────────────┐`);
        for (const member of faction.members) {
          const memberPlayer = db.getPlayer(member.playerId);
          const rankIcon = member.rank === 'founder' ? '★' : member.rank === 'officer' ? '◆' : '○';
          console.log(`│ ${rankIcon} ${memberPlayer?.name.padEnd(20)} ${member.rank.padEnd(10)} │`);
        }
        console.log(`└────────────────────────────────────────────────────────────┘\n`);
        break;
      }

      case 'join': {
        // For now, just join by faction name (in real game, would need invite)
        if (args.length < 1) {
          console.log('Usage: burnrate faction join <faction-name>');
          return;
        }
        if (player.factionId) {
          console.log('You are already in a faction. Leave first.');
          return;
        }
        const factions = db.getAllFactions();
        const faction = factions.find(f => f.name.toLowerCase() === args[0].toLowerCase());
        if (!faction) {
          console.log('Faction not found.');
          return;
        }
        if (faction.members.length >= 50) {
          console.log('Faction is full (50 members max).');
          return;
        }
        db.addFactionMember(faction.id, player.id, 'member');
        console.log(`\n✓ Joined ${faction.name} [${faction.tag}] as Member\n`);
        break;
      }

      case 'leave': {
        if (!player.factionId) {
          console.log('You are not in a faction.');
          return;
        }
        const faction = db.getFaction(player.factionId);
        if (!faction) return;
        if (faction.founderId === player.id) {
          console.log('Founders cannot leave. Transfer ownership first or disband.');
          return;
        }
        db.removeFactionMember(faction.id, player.id);
        console.log(`\n✓ Left ${faction.name}\n`);
        break;
      }

      case 'deposit': {
        if (!player.factionId) {
          console.log('You are not in a faction.');
          return;
        }
        if (args.length < 1) {
          console.log('Usage: burnrate faction deposit <amount>');
          return;
        }
        const amount = parseInt(args[0]);
        if (player.inventory.credits < amount) {
          console.log('Insufficient credits.');
          return;
        }
        const faction = db.getFaction(player.factionId);
        if (!faction) return;

        // Update player
        const newPlayerInv = { ...player.inventory };
        newPlayerInv.credits -= amount;
        db.updatePlayer(player.id, { inventory: newPlayerInv });

        // Update faction treasury (need to add this to db)
        console.log(`\n✓ Deposited ${amount} cr to ${faction.name} treasury\n`);
        break;
      }

      case 'intel': {
        if (!player.factionId) {
          console.log('You are not in a faction.');
          return;
        }
        const faction = db.getFaction(player.factionId);
        if (!faction) return;

        const limit = args[0] ? parseInt(args[0]) : 20;
        const intelReports = db.getFactionIntel(player.factionId, limit);
        const tick = db.getCurrentTick();

        console.log(`\n┌─ FACTION INTEL: ${faction.name} [${faction.tag}] ─────────────────────┐`);
        if (intelReports.length === 0) {
          console.log(`│ No intel gathered. Use 'burnrate scan <zone>' to gather.    │`);
        } else {
          console.log(`│ Target               │ Age  │ Quality │ Key Info            │`);
          console.log(`├──────────────────────┼──────┼─────────┼─────────────────────┤`);
          for (const report of intelReports) {
            const age = tick - report.gatheredAt;
            const ageStr = `${age}t`.padStart(4);
            const qualityStr = `${report.signalQuality}%`.padStart(4);

            let targetName = report.targetId.slice(0, 18);
            let keyInfo = '';

            if (report.targetType === 'zone') {
              const zone = db.getZone(report.targetId);
              targetName = (zone?.name || report.targetId).slice(0, 18).padEnd(18);
              const data = report.data as any;
              keyInfo = `${data.supplyState || '?'} ${data.suStockpile || 0}SU`;
            } else {
              targetName = 'Route'.padEnd(18);
              const data = report.data as any;
              keyInfo = data.raiderPresence ? `Raiders! str:${data.raiderStrength}` : 'Clear';
            }

            console.log(`│ ${targetName.padEnd(20)} │ ${ageStr} │  ${qualityStr}   │ ${keyInfo.padEnd(19)} │`);
          }
        }
        console.log(`└──────────────────────┴──────┴─────────┴─────────────────────┘`);
        console.log(`\nIntel decays over time. Fresh scans yield better data.\n`);
        break;
      }

      default:
        console.log('Unknown faction action. Try: create, info, join, leave, deposit, members, intel');
    }
  });

// ============================================================================
// CONTRACT COMMANDS
// ============================================================================

program
  .command('contracts')
  .description('View and manage contracts')
  .argument('[action]', 'Action: list, post, accept, complete')
  .argument('[args...]', 'Action arguments')
  .action((action, args) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const tick = db.getCurrentTick();

    if (!action || action === 'list') {
      // List available contracts
      const contracts = db.getOpenContracts();
      console.log(`\n┌─ AVAILABLE CONTRACTS ────────────────────────────────────────┐`);
      if (contracts.length === 0) {
        console.log(`│ No open contracts                                            │`);
      } else {
        for (const c of contracts.slice(0, 10)) {
          const deadline = c.deadline - tick;
          const typeStr = c.type.toUpperCase().padEnd(8);
          const rewardStr = `${c.reward.credits} cr`.padEnd(10);
          console.log(`│ ${c.id.slice(0, 8)}  ${typeStr}  ${rewardStr}  ${deadline}t left │`);
        }
      }
      console.log(`└──────────────────────────────────────────────────────────────┘\n`);
      return;
    }

    switch (action) {
      case 'post': {
        // Post a new haul contract
        if (args.length < 5) {
          console.log('Usage: burnrate contracts post <type> <from> <to> <resource:qty> <reward>');
          console.log('Example: burnrate contracts post haul Hub.Central Factory.North fuel:20 500');
          return;
        }
        const [type, from, to, cargoStr, rewardStr] = args;
        if (type !== 'haul') {
          console.log('Currently only "haul" contracts are supported.');
          return;
        }

        const allZones = db.getAllZones();
        const fromZone = allZones.find(z => z.name.toLowerCase() === from.toLowerCase());
        const toZone = allZones.find(z => z.name.toLowerCase() === to.toLowerCase());
        if (!fromZone || !toZone) {
          console.log('Zone not found.');
          return;
        }

        const [resource, qtyStr] = cargoStr.split(':');
        const qty = parseInt(qtyStr);
        const reward = parseInt(rewardStr);

        if (player.inventory.credits < reward) {
          console.log('Insufficient credits to fund contract reward.');
          return;
        }

        // Deduct reward from player
        const newInv = { ...player.inventory };
        newInv.credits -= reward;
        db.updatePlayer(player.id, { inventory: newInv });

        const contract = db.createContract({
          type: 'haul',
          posterId: player.id,
          posterType: 'player',
          acceptedBy: null,
          details: {
            fromZoneId: fromZone.id,
            toZoneId: toZone.id,
            resource: resource as Resource,
            quantity: qty
          },
          deadline: tick + 100,
          reward: { credits: reward, reputation: 10 },
          status: 'open',
          createdAt: tick
        });

        console.log(`\n✓ Contract posted: ${contract.id.slice(0, 8)}`);
        console.log(`  Haul ${qty} ${resource} from ${fromZone.name} to ${toZone.name}`);
        console.log(`  Reward: ${reward} cr  Deadline: 100 ticks\n`);
        break;
      }

      case 'accept': {
        if (args.length < 1) {
          console.log('Usage: burnrate contracts accept <contract-id>');
          return;
        }
        const contracts = db.getOpenContracts();
        const contract = contracts.find(c => c.id.startsWith(args[0]));
        if (!contract) {
          console.log('Contract not found or already taken.');
          return;
        }
        db.updateContract(contract.id, { status: 'active', acceptedBy: player.id });
        console.log(`\n✓ Contract ${contract.id.slice(0, 8)} accepted\n`);
        break;
      }

      default:
        console.log('Unknown action. Try: list, post, accept');
    }
  });

// ============================================================================
// PRODUCE COMMAND
// ============================================================================

program
  .command('produce')
  .description('Convert resources at a Factory')
  .argument('<output>', 'What to produce: metal, chemicals, rations, textiles, ammo, medkits, parts, comms, escort, raider')
  .argument('<quantity>', 'How many units to produce')
  .action((output, quantity) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const result = engine.produce(player.id, output, parseInt(quantity));
    if (result.success) {
      if (result.units && result.units.length > 0) {
        // Unit production
        const unit = result.units[0];
        console.log(`\n✓ Produced ${result.produced} ${output} unit(s)`);
        console.log(`  Strength: ${unit.strength}  Speed: ${unit.speed}  Maintenance: ${unit.maintenance} cr/tick`);
        console.log(`  Use 'burnrate units' to view your units\n`);
      } else {
        // Resource production
        console.log(`\n✓ Produced ${result.produced} ${output}\n`);
      }
    } else {
      console.log(`\n✗ ${result.error}\n`);
    }
  });

// ============================================================================
// EXTRACT COMMAND
// ============================================================================

program
  .command('extract')
  .description('Extract raw resources from a Field')
  .argument('<quantity>', 'How many units to extract')
  .action((quantity) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const result = engine.extract(player.id, parseInt(quantity));
    if (result.success && result.extracted) {
      console.log(`\n✓ Extracted ${result.extracted.amount} ${result.extracted.resource}\n`);
    } else {
      console.log(`\n✗ ${result.error}\n`);
    }
  });

// ============================================================================
// CAPTURE COMMAND
// ============================================================================

program
  .command('capture')
  .description('Capture a neutral or collapsed zone for your faction')
  .action(() => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const zone = db.getZone(player.locationId);
    if (!zone) {
      console.log('Zone not found');
      return;
    }

    const result = engine.captureZone(player.id, player.locationId);
    if (result.success) {
      const faction = player.factionId ? db.getFaction(player.factionId) : null;
      console.log(`\n✓ ${zone.name} captured for ${faction?.name || 'your faction'}!\n`);
    } else {
      console.log(`\n✗ ${result.error}\n`);
    }
  });

// ============================================================================
// UNITS COMMAND
// ============================================================================

program
  .command('units')
  .description('View and manage your combat units')
  .argument('[action]', 'Action: list, escort, raider')
  .argument('[args...]', 'Action arguments')
  .action((action, args) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const units = db.getPlayerUnits(player.id);

    if (!action || action === 'list') {
      console.log(`\n┌─ YOUR UNITS ─────────────────────────────────────────────┐`);
      if (units.length === 0) {
        console.log(`│ No units. Hire at Hubs: burnrate hire escort             │`);
      } else {
        for (const u of units) {
          const location = db.getZone(u.locationId);
          const assignStr = u.assignmentId ? `→ ${u.assignmentId.slice(0, 8)}` : 'idle';
          console.log(`│ ${u.id.slice(0, 8)}  ${u.type.padEnd(8)}  str:${u.strength.toString().padEnd(3)} ${assignStr.padEnd(14)} ${location?.name.slice(0, 15) || ''} │`);
        }
      }
      console.log(`└───────────────────────────────────────────────────────────┘\n`);
      return;
    }

    switch (action) {
      case 'escort': {
        // Assign escort to shipment
        if (args.length < 2) {
          console.log('Usage: burnrate units escort <unit-id> <shipment-id>');
          return;
        }
        const [unitId, shipmentId] = args;
        const unit = units.find(u => u.id.startsWith(unitId));
        if (!unit) {
          console.log('Unit not found. Use "burnrate units" to list your units.');
          return;
        }
        const shipments = db.getPlayerShipments(player.id);
        const shipment = shipments.find(s => s.id.startsWith(shipmentId));
        if (!shipment) {
          console.log('Shipment not found. Use "burnrate view shipments" to list.');
          return;
        }

        const result = engine.assignEscort(player.id, unit.id, shipment.id);
        if (result.success) {
          console.log(`\n✓ Escort ${unit.id.slice(0, 8)} assigned to shipment ${shipment.id.slice(0, 8)}\n`);
        } else {
          console.log(`\n✗ ${result.error}\n`);
        }
        break;
      }

      case 'raider': {
        // Deploy raider on route
        if (args.length < 2) {
          console.log('Usage: burnrate units raider <unit-id> <from-zone> <to-zone>');
          console.log('Example: burnrate units raider abc123 Hub.Central Factory.North');
          return;
        }
        const [unitId, ...routeArgs] = args;
        const unit = units.find(u => u.id.startsWith(unitId));
        if (!unit) {
          console.log('Unit not found. Use "burnrate units" to list your units.');
          return;
        }

        // Find route between zones
        if (routeArgs.length < 2) {
          console.log('Specify both from and to zones.');
          return;
        }
        const allZones = db.getAllZones();
        const fromZone = allZones.find(z => z.name.toLowerCase() === routeArgs[0].toLowerCase());
        const toZone = allZones.find(z => z.name.toLowerCase() === routeArgs[1].toLowerCase());
        if (!fromZone || !toZone) {
          console.log('Zone not found.');
          return;
        }

        const routes = db.getRoutesBetween(fromZone.id, toZone.id);
        if (routes.length === 0) {
          console.log('No route between those zones.');
          return;
        }

        const result = engine.deployRaider(player.id, unit.id, routes[0].id);
        if (result.success) {
          console.log(`\n✓ Raider ${unit.id.slice(0, 8)} deployed on ${fromZone.name} → ${toZone.name}\n`);
        } else {
          console.log(`\n✗ ${result.error}\n`);
        }
        break;
      }

      case 'sell': {
        // List unit for sale
        if (args.length < 2) {
          console.log('Usage: burnrate units sell <unit-id> <price>');
          return;
        }
        const [sellUnitId, priceStr] = args;
        const unitToSell = units.find(u => u.id.startsWith(sellUnitId));
        if (!unitToSell) {
          console.log('Unit not found. Use "burnrate units" to list your units.');
          return;
        }
        const price = parseInt(priceStr);
        if (isNaN(price) || price < 1) {
          console.log('Price must be a positive number.');
          return;
        }

        const sellResult = engine.listUnitForSale(player.id, unitToSell.id, price);
        if (sellResult.success) {
          console.log(`\n✓ ${unitToSell.type} ${unitToSell.id.slice(0, 8)} listed for ${price} cr`);
          console.log(`  Location: ${db.getZone(unitToSell.locationId)?.name}\n`);
        } else {
          console.log(`\n✗ ${sellResult.error}\n`);
        }
        break;
      }

      case 'unsell': {
        // Remove unit from sale
        if (args.length < 1) {
          console.log('Usage: burnrate units unsell <unit-id>');
          return;
        }
        const unitToUnsell = units.find(u => u.id.startsWith(args[0]));
        if (!unitToUnsell) {
          console.log('Unit not found.');
          return;
        }

        const unsellResult = engine.unlistUnit(player.id, unitToUnsell.id);
        if (unsellResult.success) {
          console.log(`\n✓ ${unitToUnsell.type} ${unitToUnsell.id.slice(0, 8)} removed from sale\n`);
        } else {
          console.log(`\n✗ ${unsellResult.error}\n`);
        }
        break;
      }

      default:
        console.log('Unknown action. Try: list, escort, raider, sell, unsell');
    }
  });

// ============================================================================
// HIRE COMMAND (buy units from marketplace)
// ============================================================================

program
  .command('hire')
  .description('Hire (buy) a unit from the marketplace at your current Hub')
  .argument('[unit-id]', 'Unit ID to hire (omit to list available units)')
  .action((unitId) => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const zone = db.getZone(player.locationId);
    if (!zone || zone.type !== 'hub') {
      console.log('\nUnits can only be hired at Hubs. Travel to a Hub first.\n');
      return;
    }

    const unitsForSale = db.getUnitsForSaleAtZone(player.locationId);

    if (!unitId) {
      // List available units
      console.log(`\n┌─ UNITS FOR HIRE: ${zone.name} ────────────────────────────────┐`);
      if (unitsForSale.length === 0) {
        console.log(`│ No units for sale. Players must produce and list units.     │`);
      } else {
        console.log(`│ ID        │ Type    │ Str │ Spd │ Maint │ Price     │`);
        console.log(`├───────────┼─────────┼─────┼─────┼───────┼───────────┤`);
        for (const u of unitsForSale) {
          const seller = db.getPlayer(u.playerId);
          const sellerName = seller?.name.slice(0, 10) || 'Unknown';
          console.log(`│ ${u.id.slice(0, 8)}  │ ${u.type.padEnd(7)} │ ${u.strength.toString().padStart(3)} │ ${u.speed.toString().padStart(3)} │ ${(u.maintenance + '/t').padStart(5)} │ ${(u.forSalePrice + ' cr').padStart(9)} │`);
        }
      }
      console.log(`└───────────┴─────────┴─────┴─────┴───────┴───────────┘`);
      console.log(`\nTo hire: burnrate hire <unit-id>\n`);
      return;
    }

    // Find and hire unit
    const unit = unitsForSale.find(u => u.id.startsWith(unitId));
    if (!unit) {
      console.log(`\nUnit not found or not for sale. Use 'burnrate hire' to list available units.\n`);
      return;
    }

    const result = engine.hireUnit(player.id, unit.id);
    if (result.success && result.unit) {
      console.log(`\n✓ Hired ${result.unit.type} for ${unit.forSalePrice} cr`);
      console.log(`  Strength: ${result.unit.strength}  Maintenance: ${result.unit.maintenance} cr/tick`);
      console.log(`  Use 'burnrate units' to view your units\n`);
    } else {
      console.log(`\n✗ ${result.error}\n`);
    }
  });

// ============================================================================
// STATUS COMMAND
// ============================================================================

program
  .command('status')
  .description('Show your current status')
  .action(() => {
    const player = getPlayer();
    if (!player) {
      console.log('Join the game first: burnrate join <name>');
      return;
    }

    const zone = db.getZone(player.locationId);
    const tick = db.getCurrentTick();
    const limits = TIER_LIMITS[player.tier];

    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║  ${player.name.padEnd(20)}  │  ${player.tier.toUpperCase().padEnd(10)}  │  Tick ${tick.toString().padStart(6)}  ║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║  Location: ${(zone?.name || 'Unknown').padEnd(43)} ║`);
    console.log(`║  Credits: ${player.inventory.credits.toString().padEnd(44)} ║`);
    console.log(`║  Reputation: ${player.reputation.toString().padEnd(41)} ║`);
    console.log(`║  Actions: ${player.actionsToday}/${limits.dailyActions} today`.padEnd(56) + `║`);
    console.log(`╠═══════════════════════════════════════════════════════╣`);
    console.log(`║  INVENTORY                                            ║`);

    const inv = player.inventory;
    console.log(`║  ore: ${inv.ore.toString().padEnd(6)} fuel: ${inv.fuel.toString().padEnd(6)} grain: ${inv.grain.toString().padEnd(6)} fiber: ${inv.fiber.toString().padEnd(4)} ║`);
    console.log(`║  metal: ${inv.metal.toString().padEnd(4)} chem: ${inv.chemicals.toString().padEnd(6)} rations: ${inv.rations.toString().padEnd(4)} text: ${inv.textiles.toString().padEnd(5)} ║`);
    console.log(`║  ammo: ${inv.ammo.toString().padEnd(5)} med: ${inv.medkits.toString().padEnd(7)} parts: ${inv.parts.toString().padEnd(6)} comms: ${inv.comms.toString().padEnd(4)} ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝\n`);
  });

// ============================================================================
// SERVER COMMAND
// ============================================================================

program
  .command('server')
  .description('Manage the tick server')
  .argument('<action>', 'Action: status, start, stop')
  .option('--interval <ms>', 'Tick interval in milliseconds (start only)', '600000')
  .action((action, options) => {
    const statusPath = path.join(DB_DIR, 'server-status.json');
    const pidPath = path.join(DB_DIR, 'server.pid');

    switch (action) {
      case 'status': {
        if (!fs.existsSync(statusPath)) {
          console.log('\nServer status: Not running\n');
          return;
        }
        try {
          const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
          const lastTick = new Date(status.lastTickTime);
          const elapsed = Math.floor((Date.now() - lastTick.getTime()) / 1000);

          console.log(`\n┌─ TICK SERVER STATUS ────────────────────────────────────┐`);
          console.log(`│ Status: ${status.running ? 'RUNNING' : 'STOPPED'}`.padEnd(58) + `│`);
          console.log(`│ PID: ${status.pid}`.padEnd(58) + `│`);
          console.log(`│ Current Tick: ${status.currentTick}`.padEnd(58) + `│`);
          console.log(`│ Ticks Processed: ${status.tickCount}`.padEnd(58) + `│`);
          console.log(`│ Tick Interval: ${status.intervalMs / 60000} minutes`.padEnd(58) + `│`);
          console.log(`│ Last Tick: ${elapsed}s ago`.padEnd(58) + `│`);
          console.log(`└──────────────────────────────────────────────────────────┘\n`);
        } catch {
          console.log('\nServer status: Unknown (corrupted status file)\n');
        }
        break;
      }

      case 'start': {
        console.log('\nTo start the tick server, run in a separate terminal:');
        console.log(`  BURNRATE_TICK_INTERVAL=${options.interval} node dist/server/tick-server.js`);
        console.log('\nOr for testing (1 tick per second):');
        console.log('  BURNRATE_TICK_INTERVAL=1000 node dist/server/tick-server.js\n');
        break;
      }

      case 'stop': {
        if (!fs.existsSync(statusPath)) {
          console.log('\nServer is not running\n');
          return;
        }
        try {
          const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
          console.log(`\nTo stop the server, kill process ${status.pid}:`);
          console.log(`  kill ${status.pid}\n`);
        } catch {
          console.log('\nCould not read server status\n');
        }
        break;
      }

      default:
        console.log('Unknown action. Try: status, start, stop');
    }
  });

// ============================================================================
// HELP COMMAND
// ============================================================================

program
  .command('help')
  .description('Show detailed help')
  .action(() => {
    console.log(formatHelp());
  });

// Parse and execute
program.parse();
