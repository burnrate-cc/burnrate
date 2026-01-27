/**
 * BURNRATE CLI Formatting
 * Terminal-native visual output
 */

import { GameDatabase } from '../db/database.js';
import { Zone, Player, Shipment, GameEvent, getSupplyState, Route } from '../core/types.js';

// ============================================================================
// MAIN VIEW
// ============================================================================

export function formatView(db: GameDatabase, player: Player): string {
  const tick = db.getCurrentTick();
  const season = db.getSeasonInfo();
  const zone = db.getZone(player.locationId);
  const routes = db.getRoutesFromZone(player.locationId);
  const shipments = db.getPlayerShipments(player.id).filter(s => s.status === 'in_transit');

  // Get recent events for alerts
  const events = db.getEvents({ limit: 10, actorId: player.id });
  const alerts = events.slice(0, 3).map(e => formatEventAlert(e, db));

  let output = '';
  output += `╔════════════════════════════════════════════════════════════════╗\n`;
  output += `║  BURNRATE  │  Tick ${tick.toString().padStart(6)}  │  Season ${season.seasonNumber} Week ${season.seasonWeek}  │  ${player.tier.charAt(0).toUpperCase() + player.tier.slice(1).padEnd(9)}  ║\n`;
  output += `╠════════════════════════════════════════════════════════════════╣\n`;
  output += `║  BALANCE: ${player.inventory.credits.toString().padEnd(8)} cr  │  SHIPMENTS: ${shipments.length.toString().padEnd(2)} active  │  REP: ${player.reputation.toString().padEnd(5)}  ║\n`;
  output += `╠════════════════════════════════════════════════════════════════╣\n`;

  // Alerts
  output += `║  ALERTS                                                        ║\n`;
  if (alerts.length === 0) {
    output += `║  (no recent alerts)                                            ║\n`;
  } else {
    for (const alert of alerts) {
      output += `║  ${alert.padEnd(62)} ║\n`;
    }
  }

  output += `╠════════════════════════════════════════════════════════════════╣\n`;

  // Current location
  if (zone) {
    const supplyState = getSupplyState(zone.supplyLevel);
    const supplyBar = makeSupplyBar(zone.supplyLevel, 20);
    const stateLabel = supplyState.toUpperCase().padEnd(9);

    output += `║  LOCATION: ${zone.name.padEnd(52)} ║\n`;
    output += `║  Supply: ${supplyBar} ${Math.round(zone.supplyLevel).toString().padStart(3)}%  ${stateLabel}    ║\n`;

    // Market summary
    const orders = db.getOrdersForZone(zone.id);
    const resources = ['fuel', 'rations', 'parts', 'metal'];
    const prices = resources.map(r => {
      const resourceOrders = orders.filter(o => o.resource === r);
      const avgPrice = resourceOrders.length > 0
        ? Math.round(resourceOrders.reduce((s, o) => s + o.price, 0) / resourceOrders.length)
        : '—';
      return `${r}: ${avgPrice}`;
    }).join('  │  ');
    output += `║  Market: ${prices.padEnd(54)} ║\n`;

    // Routes
    const routeStr = routes.slice(0, 3).map(r => {
      const toZone = db.getZone(r.toZoneId);
      const riskLabel = r.baseRisk < 0.1 ? 'safe' : r.baseRisk < 0.25 ? 'moderate' : 'dangerous';
      return `→${toZone?.name.split('.')[1] || '?'} (${riskLabel})`;
    }).join('  ');
    output += `║  Routes: ${routeStr.padEnd(54)} ║\n`;
  }

  output += `╚════════════════════════════════════════════════════════════════╝\n`;
  return output;
}

// ============================================================================
// ZONE VIEW
// ============================================================================

export function formatZone(db: GameDatabase, zone: Zone): string {
  const supplyState = getSupplyState(zone.supplyLevel);
  const supplyBar = makeSupplyBar(zone.supplyLevel, 30);
  const routes = db.getRoutesFromZone(zone.id);

  let output = '';
  output += `\n┌─ ZONE: ${zone.name} ${'─'.repeat(50 - zone.name.length)}┐\n`;
  output += `│ Type: ${zone.type.toUpperCase().padEnd(56)} │\n`;
  output += `│ Owner: ${(zone.ownerId || 'Neutral').padEnd(55)} │\n`;
  output += `│ ${'─'.repeat(62)} │\n`;
  output += `│ Supply: ${supplyBar} ${Math.round(zone.supplyLevel).toString().padStart(3)}%           │\n`;
  output += `│ State: ${supplyState.toUpperCase().padEnd(55)} │\n`;
  output += `│ Stockpile: ${zone.suStockpile.toString().padEnd(8)} SU                                     │\n`;
  output += `│ Burn Rate: ${zone.burnRate.toString().padEnd(8)} SU/tick                                 │\n`;
  if (zone.burnRate > 0) {
    const hoursLeft = zone.suStockpile > 0 ? (zone.suStockpile / zone.burnRate * 10 / 60).toFixed(1) : '0';
    output += `│ Time Until Empty: ${hoursLeft.padEnd(6)} hours                                │\n`;
  }
  output += `│ Compliance Streak: ${zone.complianceStreak.toString().padEnd(6)} ticks                              │\n`;
  output += `│ Garrison: ${zone.garrisonLevel.toString().padEnd(52)} │\n`;
  output += `│ ${'─'.repeat(62)} │\n`;
  output += `│ ROUTES FROM HERE                                              │\n`;

  for (const route of routes.slice(0, 6)) {
    const toZone = db.getZone(route.toZoneId);
    const riskBar = makeRiskBar(route.baseRisk * route.chokepointRating, 10);
    const riskPct = Math.round(route.baseRisk * route.chokepointRating * 100);
    output += `│   → ${(toZone?.name || 'Unknown').padEnd(25)} ${riskBar} ${riskPct.toString().padStart(2)}%  ${route.distance}t  │\n`;
  }
  if (routes.length > 6) {
    output += `│   ... and ${routes.length - 6} more routes                                      │\n`;
  }

  output += `└${'─'.repeat(64)}┘\n`;
  return output;
}

// ============================================================================
// ROUTES VIEW
// ============================================================================

export function formatRoutes(db: GameDatabase, fromZoneId: string): string {
  const fromZone = db.getZone(fromZoneId);
  const routes = db.getRoutesFromZone(fromZoneId);

  let output = '';
  output += `\n┌─ ROUTES FROM ${fromZone?.name || 'Unknown'} ${'─'.repeat(40 - (fromZone?.name.length || 7))}┐\n`;
  output += `│ Signal: — (no recent intel)                                    │\n`;
  output += `├──────────────────────────────────────────────────────────────────┤\n`;

  for (const route of routes) {
    const toZone = db.getZone(route.toZoneId);
    const riskBar = makeRiskBar(route.baseRisk * route.chokepointRating, 10);
    const riskPct = Math.round(route.baseRisk * route.chokepointRating * 100);
    const riskLabel = riskPct < 10 ? 'SAFE' : riskPct < 25 ? 'MODERATE' : riskPct < 50 ? 'DANGEROUS' : 'AVOID';

    output += `│ → ${(toZone?.name || 'Unknown').padEnd(30)}                                 │\n`;
    output += `│   Distance: ${route.distance} ticks  │  Capacity: ${route.capacity.toString().padEnd(4)}  │  Risk: ${riskBar} ${riskPct.toString().padStart(2)}% │\n`;
    if (route.chokepointRating > 1) {
      output += `│   ⚠ Chokepoint: +${Math.round((route.chokepointRating - 1) * 100)}% intercept modifier                        │\n`;
    }
  }

  output += `├──────────────────────────────────────────────────────────────────┤\n`;
  output += `│ Legend: ░ <10%  ▒ 10-30%  ▓ 30-50%  █ >50%                     │\n`;
  output += `└──────────────────────────────────────────────────────────────────┘\n`;
  return output;
}

// ============================================================================
// MARKET VIEW
// ============================================================================

export function formatMarket(db: GameDatabase, zoneId: string, resource?: string): string {
  const zone = db.getZone(zoneId);
  const orders = db.getOrdersForZone(zoneId, resource);
  const buys = orders.filter(o => o.side === 'buy').sort((a, b) => b.price - a.price);
  const sells = orders.filter(o => o.side === 'sell').sort((a, b) => a.price - b.price);

  let output = '';
  output += `\n┌─ MARKET: ${zone?.name || 'Unknown'} ${resource ? `(${resource})` : ''} ${'─'.repeat(35)}┐\n`;
  output += `│ Market Depth: ${zone?.marketDepth.toFixed(1)}x                                            │\n`;
  output += `├──────────────────────────────────────────────────────────────────┤\n`;

  if (resource) {
    // Show order book for specific resource
    output += `│ BUY ORDERS                          │ SELL ORDERS                 │\n`;
    output += `│ Price     Qty                       │ Price     Qty               │\n`;
    output += `├─────────────────────────────────────┼─────────────────────────────┤\n`;

    const maxRows = Math.max(buys.length, sells.length, 1);
    for (let i = 0; i < Math.min(maxRows, 8); i++) {
      const buy = buys[i];
      const sell = sells[i];
      const buyStr = buy ? `${buy.price.toString().padStart(6)} cr  ${buy.quantity.toString().padStart(6)}` : ''.padEnd(16);
      const sellStr = sell ? `${sell.price.toString().padStart(6)} cr  ${sell.quantity.toString().padStart(6)}` : ''.padEnd(16);
      output += `│ ${buyStr.padEnd(35)} │ ${sellStr.padEnd(27)} │\n`;
    }
  } else {
    // Show summary of all resources
    output += `│ Resource       Best Bid    Best Ask    Spread                    │\n`;
    output += `├──────────────────────────────────────────────────────────────────┤\n`;

    const resources = ['ore', 'fuel', 'grain', 'fiber', 'metal', 'chemicals', 'rations', 'textiles', 'ammo', 'medkits', 'parts', 'comms'];
    for (const res of resources) {
      const resOrders = orders.filter(o => o.resource === res);
      const resBuys = resOrders.filter(o => o.side === 'buy');
      const resSells = resOrders.filter(o => o.side === 'sell');
      const bestBid = resBuys.length > 0 ? Math.max(...resBuys.map(o => o.price)) : null;
      const bestAsk = resSells.length > 0 ? Math.min(...resSells.map(o => o.price)) : null;
      const spread = bestBid && bestAsk ? bestAsk - bestBid : null;

      const bidStr = bestBid ? `${bestBid} cr` : '—';
      const askStr = bestAsk ? `${bestAsk} cr` : '—';
      const spreadStr = spread !== null ? `${spread} cr` : '—';

      output += `│ ${res.padEnd(14)} ${bidStr.padStart(10)}  ${askStr.padStart(10)}  ${spreadStr.padStart(10)}              │\n`;
    }
  }

  output += `└──────────────────────────────────────────────────────────────────┘\n`;
  return output;
}

// ============================================================================
// SHIPMENTS VIEW
// ============================================================================

export function formatShipments(shipments: Shipment[]): string {
  let output = '';
  output += `\n┌─ YOUR SHIPMENTS ${'─'.repeat(48)}┐\n`;

  if (shipments.length === 0) {
    output += `│ No active shipments                                            │\n`;
  } else {
    output += `│ ID         Type      Status       ETA    Cargo                 │\n`;
    output += `├──────────────────────────────────────────────────────────────────┤\n`;

    for (const s of shipments) {
      const id = s.id.slice(0, 8);
      const cargoStr = Object.entries(s.cargo)
        .filter(([_, v]) => v && v > 0)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ')
        .slice(0, 20);
      output += `│ ${id}   ${s.type.padEnd(9)} ${s.status.padEnd(12)} ${s.ticksToNextZone.toString().padEnd(4)}t  ${cargoStr.padEnd(20)} │\n`;
    }
  }

  output += `└──────────────────────────────────────────────────────────────────┘\n`;
  return output;
}

// ============================================================================
// EVENTS VIEW
// ============================================================================

export function formatEvents(events: GameEvent[]): string {
  let output = '';
  output += `\n┌─ RECENT EVENTS ${'─'.repeat(49)}┐\n`;

  if (events.length === 0) {
    output += `│ No recent events                                               │\n`;
  } else {
    for (const e of events) {
      const line = formatEventLine(e);
      output += `│ ${line.padEnd(63)} │\n`;
    }
  }

  output += `└──────────────────────────────────────────────────────────────────┘\n`;
  return output;
}

// ============================================================================
// HELP
// ============================================================================

export function formatHelp(): string {
  return `
╔══════════════════════════════════════════════════════════════════╗
║                          BURNRATE                                ║
║         A logistics war MMO for Claude Code                      ║
║            The front doesn't feed itself.                        ║
╠══════════════════════════════════════════════════════════════════╣
║ GETTING STARTED                                                  ║
║   burnrate join <name>      Create a new character               ║
║   burnrate view             See the world and your status        ║
║   burnrate status           See your inventory and stats         ║
╠══════════════════════════════════════════════════════════════════╣
║ VIEWING                                                          ║
║   burnrate view zone <name>    Details on a specific zone        ║
║   burnrate view routes         Routes from your location         ║
║   burnrate view market [res]   Market orders (optional: filter)  ║
║   burnrate view shipments      Your active shipments             ║
║   burnrate view events [n]     Recent events (default: 20)       ║
╠══════════════════════════════════════════════════════════════════╣
║ TRADING                                                          ║
║   burnrate buy <res> <qty> [--limit <price>]                     ║
║   burnrate sell <res> <qty> [--limit <price>]                    ║
╠══════════════════════════════════════════════════════════════════╣
║ SHIPPING                                                         ║
║   burnrate ship --from <zone> --to <zone> --cargo "res:qty,..."  ║
║       Options: --type courier|freight|convoy (default: courier)  ║
╠══════════════════════════════════════════════════════════════════╣
║ INTEL                                                            ║
║   burnrate scan <zone>      Gather intel on a zone               ║
╠══════════════════════════════════════════════════════════════════╣
║ COMBAT                                                           ║
║   burnrate hire <type> [--count n]   Hire escort or raider units ║
╠══════════════════════════════════════════════════════════════════╣
║ SUPPLY                                                           ║
║   burnrate supply <amount>  Deposit SU to current zone           ║
╠══════════════════════════════════════════════════════════════════╣
║ Supply Units (SU) require: 2 rations + 1 fuel + 1 parts + 1 ammo ║
║ Controlled zones burn SU each tick. No supply = zone collapses.  ║
╚══════════════════════════════════════════════════════════════════╝
`;
}

// ============================================================================
// HELPERS
// ============================================================================

function makeSupplyBar(level: number, width: number): string {
  const filled = Math.min(width, Math.round((level / 100) * width));
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function makeRiskBar(risk: number, width: number): string {
  const normalizedRisk = Math.min(1, risk);
  const filled = Math.round(normalizedRisk * width);
  const empty = width - filled;

  let bar = '';
  for (let i = 0; i < filled; i++) {
    const pos = i / width;
    if (pos < 0.3) bar += '▒';
    else if (pos < 0.5) bar += '▓';
    else bar += '█';
  }
  bar += '░'.repeat(empty);
  return bar;
}

function formatEventAlert(event: GameEvent, db: GameDatabase): string {
  switch (event.type) {
    case 'shipment_arrived':
      return `✓ Shipment arrived at ${event.data.destination}`;
    case 'shipment_intercepted':
      return `⚠ Shipment intercepted! Lost cargo.`;
    case 'zone_state_changed':
      return `⚠ ${event.data.zoneName} now ${(event.data.newState as string).toUpperCase()}`;
    case 'trade_executed':
      return `✓ Trade: ${event.data.quantity} ${event.data.resource} at ${event.data.price} cr`;
    default:
      return `• ${event.type.replace(/_/g, ' ')}`;
  }
}

function formatEventLine(event: GameEvent): string {
  const tick = `[${event.tick}]`.padEnd(8);
  switch (event.type) {
    case 'tick':
      return `${tick} Tick processed`;
    case 'shipment_created':
      return `${tick} Shipment created: ${event.data.from} → ${event.data.to}`;
    case 'shipment_arrived':
      return `${tick} Shipment arrived at ${event.data.destination}`;
    case 'shipment_intercepted':
      return `${tick} ⚠ Shipment intercepted!`;
    case 'trade_executed':
      return `${tick} Trade: ${event.data.quantity} ${event.data.resource} @ ${event.data.price}`;
    case 'zone_supplied':
      return `${tick} Supplied ${event.data.zoneName || event.data.zoneId}`;
    case 'zone_state_changed':
      return `${tick} ${event.data.zoneName}: ${event.data.previousState} → ${event.data.newState}`;
    default:
      return `${tick} ${event.type.replace(/_/g, ' ')}`;
  }
}
