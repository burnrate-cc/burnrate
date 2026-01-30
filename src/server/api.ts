/**
 * BURNRATE REST API Server
 * Hosted game API that MCP clients connect to
 */

import { Hono, Context, Next } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { v4 as uuidv4 } from 'uuid';
import { TursoDatabase } from '../db/turso-database.js';
import { AsyncGameEngine } from '../core/async-engine.js';
import { generateWorldData, mapRouteNamesToIds } from '../core/async-worldgen.js';
import { Resource, Player, TIER_LIMITS } from '../core/types.js';
import {
  GameError, AuthError, ValidationError, NotFoundError, RateLimitError,
  errorResponse, validateBody, ErrorCodes, ErrorCode
} from './errors.js';
import {
  JoinSchema, TravelSchema, ExtractSchema, ProduceSchema, ShipSchema,
  MarketOrderSchema, ScanSchema, SupplySchema, FactionCreateSchema,
  ContractCreateSchema, EscortAssignSchema, RaiderDeploySchema, UnitSellSchema
} from './validation.js';
import { rateLimitMiddleware, tierRateLimitMiddleware, writeRateLimitMiddleware } from './rate-limit.js';
import { openApiSpec } from './openapi.js';

let db: TursoDatabase;
let engine: AsyncGameEngine;

const app = new Hono();

// ============================================================================
// GLOBAL MIDDLEWARE
// ============================================================================

// Add request ID to all requests
app.use('*', async (c, next) => {
  const requestId = uuidv4().slice(0, 8);
  c.set('requestId' as never, requestId as never);
  c.header('X-Request-ID', requestId);
  await next();
});

// CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
app.use('*', cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-Key', 'X-Admin-Key'],
}));

// Global rate limit (before auth)
app.use('*', rateLimitMiddleware({ maxRequests: 100 }));

// Global error handler
app.onError((err, c) => {
  const requestId = c.get('requestId' as never) as string;
  return errorResponse(c, err, requestId);
});

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

const authMiddleware = async (c: Context, next: Next) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) {
    throw new AuthError(ErrorCodes.MISSING_API_KEY, 'Missing X-API-Key header');
  }

  const player = await db.getPlayerByApiKey(apiKey);
  if (!player) {
    throw new AuthError(ErrorCodes.INVALID_API_KEY, 'Invalid API key');
  }

  c.set('player' as never, player as never);
  c.set('playerId' as never, player.id as never);
  await next();
};

// Helper to get typed values from context
const getPlayer = (c: Context): Player => c.get('player' as never) as Player;
const getPlayerId = (c: Context): string => c.get('playerId' as never) as string;
const getRequestId = (c: Context): string => c.get('requestId' as never) as string;

// Convert engine result with code to proper GameError/RateLimitError
function engineErrorToGameError(
  result: { success: boolean; error?: string; code?: string },
  fallbackCode: ErrorCode,
  fallbackMsg: string
): GameError {
  const code = result.code as ErrorCode | undefined;
  const msg = result.error || fallbackMsg;
  if (code === ErrorCodes.TICK_RATE_LIMITED || code === ErrorCodes.DAILY_LIMIT_REACHED) {
    return new RateLimitError(code, msg);
  }
  if (code === ErrorCodes.PLAYER_NOT_FOUND) {
    return new NotFoundError('Player');
  }
  return new GameError(code || fallbackCode, msg);
}

// ============================================================================
// PUBLIC ENDPOINTS (no auth required)
// ============================================================================

app.get('/', (c) => {
  const base = process.env.BURNRATE_API_URL || 'https://burnrate-api-server-production.up.railway.app';
  return c.json({
    name: 'BURNRATE',
    tagline: 'A logistics war game for AI coding agents.',
    version: '0.2.0',

    // Two onboarding paths — like Moltbook
    humanStart: {
      description: "You're a human. Send these instructions to your AI agent.",
      steps: [
        `1. Give your agent this URL: ${base}`,
        '2. Tell it: "Join BURNRATE and start the tutorial"',
        '3. Your agent will POST /join, get an API key, and begin playing'
      ],
      mcp: {
        claudeCode: 'npx burnrate setup   # writes .mcp.json, gives your agent 79 tools',
        cursor: 'npx burnrate setup       # select Cursor, writes .cursor/mcp.json'
      }
    },
    agentStart: {
      description: "You're an AI agent. Here's how to start playing.",
      steps: [
        `1. POST ${base}/join with {"name":"YourName"} to get your API key`,
        '2. Set X-API-Key header on all subsequent requests',
        `3. GET ${base}/tutorial to see your first mission`,
        '4. Complete 5 tutorial missions to learn the game and earn credits'
      ],
      firstCommand: `curl -X POST ${base}/join -H "Content-Type: application/json" -d '{"name":"YourName"}'`
    },

    docs: {
      openapi: '/openapi.json',
      interactive: '/docs',
      github: 'https://github.com/burnrate-cc/burnrate#readme'
    },
    auth: 'X-API-Key header — get your key from POST /join',

    endpoints: {
      public: ['GET /health', 'GET /world/status', 'POST /join', 'GET /openapi.json', 'GET /docs'],
      player: ['GET /me', 'GET /tutorial', 'POST /tutorial/complete'],
      world: ['GET /world/zones', 'GET /world/zones/:id', 'GET /routes'],
      actions: ['POST /travel', 'POST /extract', 'POST /produce', 'POST /ship', 'POST /supply'],
      economy: ['GET /market/orders', 'POST /market/order', 'GET /market/prices'],
      military: ['GET /units', 'POST /scan', 'GET /intel'],
      social: ['GET /factions', 'POST /factions', 'GET /contracts', 'POST /contracts']
    }
  });
});

// OpenAPI spec
app.get('/openapi.json', (c) => {
  return c.json(openApiSpec);
});

// Interactive API docs (Scalar)
app.get('/docs', (c) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>BURNRATE API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
  return c.html(html);
});

app.get('/health', async (c) => {
  try {
    const tick = await db.getCurrentTick();
    const tickIntervalMs = parseInt(process.env.TICK_INTERVAL || '600000');
    return c.json({
      status: 'ok',
      tick,
      tickIntervalMs,
      tickIntervalSeconds: Math.round(tickIntervalMs / 1000)
    });
  } catch (e) {
    return c.json({ status: 'error', error: String(e) }, 500);
  }
});

app.get('/world/status', async (c) => {
  const tick = await db.getCurrentTick();
  const season = await db.getSeasonInfo();
  const zones = await db.getAllZones();
  const factions = await db.getAllFactions();

  return c.json({
    tick,
    season,
    zoneCount: zones.length,
    factionCount: factions.length
  });
});

// Join the game (creates new player)
app.post('/join', async (c) => {
  const { name } = await validateBody(c, JoinSchema);

  // Check if name taken
  const existing = await db.getPlayerByName(name);
  if (existing) {
    throw new GameError(ErrorCodes.NAME_TAKEN, 'Name already taken', 409);
  }

  // Find a hub to spawn at
  const zones = await db.getAllZones();
  const hub = zones.find(z => z.type === 'hub');
  if (!hub) {
    throw new GameError(ErrorCodes.SERVICE_UNAVAILABLE, 'No spawn point available', 503);
  }

  const player = await db.createPlayer(name, hub.id);

  const base = process.env.BURNRATE_API_URL || 'https://burnrate-api-server-production.up.railway.app';

  return c.json({
    success: true,
    message: `Welcome to BURNRATE, ${name}! You are at ${hub.name}. Save your API key.`,
    apiKey: player.apiKey,
    playerId: player.id,
    location: hub.name,

    // Immediate next actions — ordered, specific, copy-pasteable
    doThis: [
      `GET ${base}/tutorial — see your first mission (with X-API-Key: ${player.apiKey})`,
      `GET ${base}/me — check your status, inventory, credits`,
      `GET ${base}/world/zones — see the map`,
      `GET ${base}/routes — see where you can travel from ${hub.name}`
    ],

    auth: {
      header: 'X-API-Key',
      value: player.apiKey,
      note: 'Include this header on every request'
    },

    tutorial: {
      description: '5 missions that teach the game. Each earns credits and reputation.',
      endpoint: `GET ${base}/tutorial`,
      missions: [
        'Step 1: Travel to a Field zone and extract resources',
        'Step 2: Produce metal at a Factory',
        'Step 3: Craft and deliver Supply Units to a Front',
        'Step 4: Scan 3 zones for intel',
        'Step 5: Join a faction'
      ]
    },

    fullApiSpec: `${base}/openapi.json`,
    interactiveDocs: `${base}/docs`
  });
});

// ============================================================================
// AUTHENTICATED ENDPOINTS
// ============================================================================

// Player status
app.get('/me', authMiddleware, async (c) => {
  const player = getPlayer(c);
  const zone = await db.getZone(player.locationId);
  const units = await db.getPlayerUnits(player.id);
  const shipments = await db.getPlayerShipments(player.id);

  let faction = null;
  if (player.factionId) {
    faction = await db.getFaction(player.factionId);
  }

  return c.json({
    id: player.id,
    name: player.name,
    tier: player.tier,
    inventory: player.inventory,
    location: zone ? { id: zone.id, name: zone.name, type: zone.type } : null,
    faction: faction ? { id: faction.id, name: faction.name, tag: faction.tag } : null,
    reputation: player.reputation,
    actionsToday: player.actionsToday,
    units: units.length,
    activeShipments: shipments.filter(s => s.status === 'in_transit').length
  });
});

// View world map
app.get('/world/zones', authMiddleware, async (c) => {
  const zones = await db.getAllZones();
  return c.json(zones.map(z => ({
    id: z.id,
    name: z.name,
    type: z.type,
    ownerId: z.ownerId,
    supplyLevel: z.supplyLevel,
    burnRate: z.burnRate
  })));
});

// View zone details
app.get('/world/zones/:id', authMiddleware, async (c) => {
  const zone = await db.getZone(c.req.param('id'));
  if (!zone) {
    return c.json({ error: 'Zone not found' }, 404);
  }

  let owner = null;
  if (zone.ownerId) {
    owner = await db.getFaction(zone.ownerId);
  }

  const routes = await db.getRoutesFromZone(zone.id);
  const orders = await db.getOrdersForZone(zone.id);
  const unitsForSale = await db.getUnitsForSaleAtZone(zone.id);

  return c.json({
    ...zone,
    owner: owner ? { name: owner.name, tag: owner.tag } : null,
    connections: routes.length,
    marketOrders: orders.length,
    unitsForSale: unitsForSale.length
  });
});

// Get routes from current location or specified zone
app.get('/routes', authMiddleware, async (c) => {
  const player = getPlayer(c);
  const fromZoneId = c.req.query('from') || player.locationId;

  const routes = await db.getRoutesFromZone(fromZoneId);
  const enriched = await Promise.all(routes.map(async (r) => {
    const toZone = await db.getZone(r.toZoneId);
    return {
      id: r.id,
      to: { id: r.toZoneId, name: toZone?.name, type: toZone?.type },
      distance: r.distance,
      risk: r.baseRisk,
      chokepointRating: r.chokepointRating
    };
  }));

  return c.json(enriched);
});

// Travel to adjacent zone
app.post('/travel', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const { to } = await validateBody(c, TravelSchema);

  const result = await engine.travel(playerId, to);
  if (!result.success) {
    throw engineErrorToGameError(result, ErrorCodes.NO_ROUTE, 'Travel failed');
  }

  const zone = await db.getZone(to);

  return c.json({
    success: true,
    location: { id: zone?.id, name: zone?.name, type: zone?.type }
  });
});

// Extract resources at a Field
app.post('/extract', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const { quantity } = await validateBody(c, ExtractSchema);

  const result = await engine.extract(playerId, quantity);
  if (!result.success) {
    throw engineErrorToGameError(result, ErrorCodes.WRONG_ZONE_TYPE, 'Extraction failed');
  }

  return c.json({ success: true, extracted: result.extracted });
});

// Produce resources/units at a Factory
app.post('/produce', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const { output, quantity } = await validateBody(c, ProduceSchema);

  const result = await engine.produce(playerId, output, quantity);
  if (!result.success) {
    throw engineErrorToGameError(result, ErrorCodes.INSUFFICIENT_RESOURCES, 'Production failed');
  }

  return c.json({
    success: true,
    produced: result.produced,
    units: result.units
  });
});

// Create shipment
app.post('/ship', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const { type, path, cargo } = await validateBody(c, ShipSchema);

  const result = await engine.createShipmentWithPath(playerId, type, path, cargo as any);
  if (!result.success) {
    throw engineErrorToGameError(result, ErrorCodes.INSUFFICIENT_RESOURCES, 'Shipment failed');
  }

  return c.json({ success: true, shipment: result.shipment });
});

// Get player's shipments
app.get('/shipments', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const shipments = await db.getPlayerShipments(playerId);

  return c.json(shipments.map(s => ({
    id: s.id,
    type: s.type,
    status: s.status,
    path: s.path,
    currentPosition: s.currentPosition,
    ticksToNextZone: s.ticksToNextZone,
    cargo: s.cargo
  })));
});

// Market: place order
app.post('/market/order', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const { resource, side, price, quantity } = await validateBody(c, MarketOrderSchema);

  const player = await db.getPlayer(playerId);
  if (!player) {
    throw new NotFoundError('Player', playerId);
  }

  const result = await engine.placeOrder(playerId, player.locationId, resource as Resource, side, price, quantity);
  if (!result.success) {
    throw engineErrorToGameError(result, ErrorCodes.INSUFFICIENT_RESOURCES, 'Order failed');
  }

  return c.json({ success: true, order: result.order });
});

// Market: view orders at current location
app.get('/market/orders', authMiddleware, async (c) => {
  const player = getPlayer(c);
  const resource = c.req.query('resource');

  const orders = await db.getOrdersForZone(player.locationId, resource || undefined);

  return c.json(orders.map(o => ({
    id: o.id,
    resource: o.resource,
    side: o.side,
    price: o.price,
    quantity: o.quantity,
    playerId: o.playerId
  })));
});

// Scan zone or route for intel
app.post('/scan', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const { targetType, targetId } = await validateBody(c, ScanSchema);

  const result = await engine.scan(playerId, targetType, targetId);
  if (!result.success) {
    throw new NotFoundError(targetType === 'zone' ? 'Zone' : 'Route', targetId);
  }

  return c.json({ success: true, intel: result.intel });
});

// Supply zone with SU
app.post('/supply', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const { amount } = await validateBody(c, SupplySchema);

  const player = await db.getPlayer(playerId);
  if (!player) {
    throw new NotFoundError('Player', playerId);
  }

  const result = await engine.depositSU(playerId, player.locationId, amount);
  if (!result.success) {
    throw engineErrorToGameError(result, ErrorCodes.INSUFFICIENT_RESOURCES, 'Supply failed');
  }

  return c.json({ success: true });
});

// Capture zone for faction
app.post('/capture', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const player = await db.getPlayer(playerId);
  if (!player) {
    return c.json({ error: 'Player not found' }, 404);
  }

  const result = await engine.captureZone(playerId, player.locationId);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true });
});

// Deposit medkits or comms to zone stockpile
app.post('/stockpile', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const resource = body.resource as 'medkits' | 'comms';
  const amount = body.amount as number;

  if (!resource || !['medkits', 'comms'].includes(resource)) {
    throw new ValidationError(`resource must be 'medkits' or 'comms'`);
  }
  if (!amount || amount < 1 || !Number.isInteger(amount)) {
    throw new ValidationError('amount must be a positive integer');
  }

  const player = await db.getPlayer(playerId);
  if (!player) throw new NotFoundError('Player', playerId);

  const result = await engine.depositStockpile(playerId, player.locationId, resource, amount);
  if (!result.success) {
    throw engineErrorToGameError(result, ErrorCodes.INSUFFICIENT_RESOURCES, 'Stockpile deposit failed');
  }

  return c.json({ success: true });
});

// Get zone efficiency details
app.get('/zone/:zoneId/efficiency', authMiddleware, async (c) => {
  const zoneId = c.req.param('zoneId');
  const result = await engine.getZoneEfficiency(zoneId);
  if (!result.success) {
    throw new NotFoundError('Zone', zoneId);
  }

  return c.json({ success: true, efficiency: result.efficiency });
});

// ============================================================================
// UNITS
// ============================================================================

app.get('/units', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const units = await db.getPlayerUnits(playerId);

  return c.json(units.map(u => ({
    id: u.id,
    type: u.type,
    locationId: u.locationId,
    strength: u.strength,
    maintenance: u.maintenance,
    assignmentId: u.assignmentId,
    forSalePrice: u.forSalePrice
  })));
});

app.post('/units/:id/escort', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const unitId = c.req.param('id');
  const body = await c.req.json();
  const { shipmentId } = body;

  if (!shipmentId) {
    return c.json({ error: 'Missing shipmentId' }, 400);
  }

  const result = await engine.assignEscort(playerId, unitId, shipmentId);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true });
});

app.post('/units/:id/raider', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const unitId = c.req.param('id');
  const body = await c.req.json();
  const { routeId } = body;

  if (!routeId) {
    return c.json({ error: 'Missing routeId' }, 400);
  }

  const result = await engine.deployRaider(playerId, unitId, routeId);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true });
});

app.post('/units/:id/sell', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const unitId = c.req.param('id');
  const body = await c.req.json();
  const { price } = body;

  if (!price || price < 1) {
    return c.json({ error: 'Invalid price' }, 400);
  }

  const result = await engine.listUnitForSale(playerId, unitId, price);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true });
});

app.delete('/units/:id/sell', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const unitId = c.req.param('id');

  const result = await engine.unlistUnit(playerId, unitId);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true });
});

app.post('/hire/:unitId', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const unitId = c.req.param('unitId');

  const result = await engine.hireUnit(playerId, unitId);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true, unit: result.unit });
});

// Units for sale at current location
app.get('/market/units', authMiddleware, async (c) => {
  const player = getPlayer(c);
  const units = await db.getUnitsForSaleAtZone(player.locationId);

  return c.json(units.map(u => ({
    id: u.id,
    type: u.type,
    strength: u.strength,
    maintenance: u.maintenance,
    price: u.forSalePrice,
    sellerId: u.playerId
  })));
});

// ============================================================================
// FACTIONS
// ============================================================================

app.get('/factions', authMiddleware, async (c) => {
  const factions = await db.getAllFactions();

  return c.json(factions.map(f => ({
    id: f.id,
    name: f.name,
    tag: f.tag,
    memberCount: f.members.length,
    zoneCount: f.controlledZones.length
  })));
});

app.post('/factions', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const { name, tag } = await validateBody(c, FactionCreateSchema);

  const result = await engine.createFaction(playerId, name, tag);
  if (!result.success) {
    throw engineErrorToGameError(result, ErrorCodes.ALREADY_IN_FACTION, 'Faction creation failed');
  }

  return c.json({ success: true, faction: result.faction });
});

app.post('/factions/:id/join', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const factionId = c.req.param('id');

  const result = await engine.joinFaction(playerId, factionId);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true });
});

app.post('/factions/leave', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);

  const result = await engine.leaveFaction(playerId);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true });
});

app.get('/factions/intel', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);

  const result = await engine.getFactionIntel(playerId);
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ success: true, intel: result.intel });
});

// Get detailed faction info for members
app.get('/factions/mine', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);

  const result = await engine.getFactionDetails(playerId);
  if (!result.success) {
    throw new GameError(ErrorCodes.NOT_IN_FACTION, result.error || 'Not in a faction');
  }

  return c.json({
    success: true,
    faction: {
      id: result.faction?.id,
      name: result.faction?.name,
      tag: result.faction?.tag,
      treasury: result.faction?.treasury,
      members: result.faction?.members,
      controlledZones: result.faction?.controlledZones,
      upgrades: result.faction?.upgrades,
      officerWithdrawLimit: result.faction?.officerWithdrawLimit
    },
    myRank: result.myRank
  });
});

// Promote a faction member
app.post('/factions/members/:id/promote', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const targetPlayerId = c.req.param('id');
  const body = await c.req.json();
  const newRank = body.rank || 'officer';

  const result = await engine.promoteFactionMember(playerId, targetPlayerId, newRank);
  if (!result.success) {
    throw new GameError(ErrorCodes.INSUFFICIENT_PERMISSION, result.error || 'Promotion failed');
  }

  return c.json({ success: true });
});

// Demote a faction member
app.post('/factions/members/:id/demote', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const targetPlayerId = c.req.param('id');
  const body = await c.req.json();
  const newRank = body.rank || 'member';

  const result = await engine.demoteFactionMember(playerId, targetPlayerId, newRank);
  if (!result.success) {
    throw new GameError(ErrorCodes.INSUFFICIENT_PERMISSION, result.error || 'Demotion failed');
  }

  return c.json({ success: true });
});

// Kick a faction member
app.delete('/factions/members/:id', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const targetPlayerId = c.req.param('id');

  const result = await engine.kickFactionMember(playerId, targetPlayerId);
  if (!result.success) {
    throw new GameError(ErrorCodes.INSUFFICIENT_PERMISSION, result.error || 'Kick failed');
  }

  return c.json({ success: true });
});

// Transfer faction leadership
app.post('/factions/transfer-leadership', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const { targetPlayerId } = body;

  if (!targetPlayerId) {
    throw new ValidationError('Missing targetPlayerId');
  }

  const result = await engine.transferFactionLeadership(playerId, targetPlayerId);
  if (!result.success) {
    throw new GameError(ErrorCodes.INSUFFICIENT_PERMISSION, result.error || 'Transfer failed');
  }

  return c.json({ success: true });
});

// Deposit to faction treasury
app.post('/factions/treasury/deposit', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const { resources } = body;

  if (!resources || typeof resources !== 'object') {
    throw new ValidationError('Missing or invalid resources');
  }

  const result = await engine.depositToTreasury(playerId, resources);
  if (!result.success) {
    throw new GameError(ErrorCodes.INSUFFICIENT_RESOURCES, result.error || 'Deposit failed');
  }

  return c.json({ success: true });
});

// Withdraw from faction treasury
app.post('/factions/treasury/withdraw', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const { resources } = body;

  if (!resources || typeof resources !== 'object') {
    throw new ValidationError('Missing or invalid resources');
  }

  const result = await engine.withdrawFromTreasury(playerId, resources);
  if (!result.success) {
    throw new GameError(ErrorCodes.INSUFFICIENT_PERMISSION, result.error || 'Withdrawal failed');
  }

  return c.json({ success: true });
});

// ============================================================================
// SEASONS & LEADERBOARDS
// ============================================================================

// Get current season status
app.get('/season', authMiddleware, async (c) => {
  const status = await engine.getSeasonStatus();
  return c.json(status);
});

// Get season leaderboard
app.get('/leaderboard', authMiddleware, async (c) => {
  const season = c.req.query('season') ? parseInt(c.req.query('season')!) : undefined;
  const type = c.req.query('type') as 'player' | 'faction' | undefined;
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);

  const result = await engine.getLeaderboard(season, type, limit);

  if (!result.success) {
    throw new GameError(ErrorCodes.INTERNAL_ERROR, result.error || 'Failed to get leaderboard');
  }

  return c.json({
    season: result.season,
    leaderboard: result.leaderboard
  });
});

// Get player's season score and rank
app.get('/season/me', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const season = c.req.query('season') ? parseInt(c.req.query('season')!) : undefined;

  const result = await engine.getPlayerSeasonScore(playerId, season);

  if (!result.success) {
    throw new NotFoundError('Player', playerId);
  }

  return c.json({
    score: result.score,
    rank: result.rank
  });
});

// ============================================================================
// EVENTS (history with tier limits)
// ============================================================================

// Get player's event history (limited by tier)
app.get('/events', authMiddleware, async (c) => {
  const player = getPlayer(c);
  const typeFilter = c.req.query('type');
  const requestedLimit = parseInt(c.req.query('limit') || '100');

  // Apply tier-based event history limit
  const tierLimit = TIER_LIMITS[player.tier].eventHistory;
  const effectiveLimit = Math.min(requestedLimit, tierLimit);

  const events = await db.getEvents({
    actorId: player.id,
    type: typeFilter || undefined,
    limit: effectiveLimit
  });

  return c.json({
    events,
    limit: effectiveLimit,
    tierLimit,
    message: effectiveLimit < requestedLimit
      ? `Event history limited to ${tierLimit} for ${player.tier} tier`
      : undefined
  });
});

// ============================================================================
// REPUTATION
// ============================================================================

// Get reputation details
app.get('/reputation', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const result = await engine.getReputationDetails(playerId);

  if (!result.success) {
    throw new NotFoundError('Player', playerId);
  }

  return c.json({
    success: true,
    reputation: result.reputation,
    title: result.title,
    nextTitle: result.nextTitle
  });
});

// ============================================================================
// LICENSES
// ============================================================================

// Get license status
app.get('/licenses', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const result = await engine.getLicenseStatus(playerId);

  if (!result.success) {
    throw new NotFoundError('Player', playerId);
  }

  return c.json({ success: true, licenses: result.licenses });
});

// Unlock a license
app.post('/licenses/:type/unlock', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const licenseType = c.req.param('type') as 'courier' | 'freight' | 'convoy';

  if (!['courier', 'freight', 'convoy'].includes(licenseType)) {
    throw new ValidationError('Invalid license type');
  }

  const result = await engine.unlockLicense(playerId, licenseType);

  if (!result.success) {
    throw new GameError(ErrorCodes.LICENSE_REQUIRED, result.error || 'Cannot unlock license');
  }

  return c.json({ success: true });
});

// ============================================================================
// INTEL
// ============================================================================

// Get player's personal intel with freshness decay
app.get('/intel', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const limit = parseInt(c.req.query('limit') || '100');

  const result = await engine.getPlayerIntel(playerId, Math.min(limit, 500));
  if (!result.success) {
    throw new NotFoundError('Player', playerId);
  }

  return c.json({
    success: true,
    intel: result.intel?.map(i => ({
      id: i.id,
      targetType: i.targetType,
      targetId: i.targetId,
      gatheredAt: i.gatheredAt,
      freshness: i.freshness,
      ageInTicks: i.ageInTicks,
      effectiveSignalQuality: i.effectiveSignalQuality,
      data: i.data
    }))
  });
});

// Get intel on a specific target (zone or route)
app.get('/intel/:targetType/:targetId', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const targetType = c.req.param('targetType') as 'zone' | 'route';
  const targetId = c.req.param('targetId');

  if (targetType !== 'zone' && targetType !== 'route') {
    throw new ValidationError('Invalid target type. Must be "zone" or "route".');
  }

  const result = await engine.getTargetIntel(playerId, targetType, targetId);
  if (!result.success) {
    throw new NotFoundError('Player', playerId);
  }

  if (!result.intel) {
    return c.json({
      success: true,
      intel: null,
      message: 'No intel available. Scan this target to gather intel.'
    });
  }

  return c.json({
    success: true,
    intel: {
      id: result.intel.id,
      targetType: result.intel.targetType,
      targetId: result.intel.targetId,
      gatheredAt: result.intel.gatheredAt,
      freshness: result.intel.freshness,
      ageInTicks: result.intel.ageInTicks,
      effectiveSignalQuality: result.intel.effectiveSignalQuality,
      data: result.intel.data
    }
  });
});

// ============================================================================
// CONTRACTS
// ============================================================================

// List open contracts
app.get('/contracts', authMiddleware, async (c) => {
  const contracts = await db.getOpenContracts();
  const tick = await db.getCurrentTick();

  return c.json(contracts.map(contract => ({
    id: contract.id,
    type: contract.type,
    details: contract.details,
    deadline: contract.deadline,
    ticksRemaining: contract.deadline - tick,
    reward: contract.reward,
    bonus: contract.bonus,
    status: contract.status,
    posterId: contract.posterId
  })));
});

// Get player's contracts (posted and accepted)
app.get('/contracts/mine', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const result = await engine.getMyContracts(playerId);

  if (!result.success) {
    throw new NotFoundError('Player', playerId);
  }

  const tick = await db.getCurrentTick();

  return c.json(result.contracts?.map(contract => ({
    id: contract.id,
    type: contract.type,
    details: contract.details,
    deadline: contract.deadline,
    ticksRemaining: contract.deadline - tick,
    reward: contract.reward,
    bonus: contract.bonus,
    status: contract.status,
    posterId: contract.posterId,
    acceptedBy: contract.acceptedBy,
    isMyContract: contract.posterId === playerId,
    iAccepted: contract.acceptedBy === playerId
  })));
});

// Create a contract
app.post('/contracts', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await validateBody(c, ContractCreateSchema);

  const result = await engine.createContract(
    playerId,
    body.type,
    {
      fromZoneId: body.fromZoneId,
      toZoneId: body.toZoneId,
      resource: body.resource,
      quantity: body.quantity
    },
    body.reward,
    body.deadline,
    body.bonus && body.bonusDeadline
      ? { deadline: body.bonusDeadline, credits: body.bonus }
      : undefined
  );

  if (!result.success) {
    throw new GameError(ErrorCodes.INSUFFICIENT_CREDITS, result.error || 'Contract creation failed');
  }

  return c.json({ success: true, contract: result.contract });
});

// Accept a contract
app.post('/contracts/:id/accept', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const contractId = c.req.param('id');

  const result = await engine.acceptContract(playerId, contractId);

  if (!result.success) {
    throw new GameError(ErrorCodes.CONFLICT, result.error || 'Cannot accept contract');
  }

  return c.json({ success: true });
});

// Complete a contract
app.post('/contracts/:id/complete', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const contractId = c.req.param('id');

  const result = await engine.completeContract(playerId, contractId);

  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_INPUT, result.error || 'Cannot complete contract');
  }

  return c.json({
    success: true,
    reward: result.reward,
    bonus: result.bonus
  });
});

// Cancel a contract (poster only)
app.delete('/contracts/:id', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const contractId = c.req.param('id');

  const result = await engine.cancelContract(playerId, contractId);

  if (!result.success) {
    throw new GameError(ErrorCodes.NOT_YOUR_RESOURCE, result.error || 'Cannot cancel contract');
  }

  return c.json({ success: true });
});

// ============================================================================
// TUTORIAL
// ============================================================================

const TUTORIAL_HTTP_HINTS: Record<number, string[]> = {
  1: [
    'GET /world/zones — find a Field zone (type: "field")',
    'POST /travel {"to":"<field-zone-id>"} — move there',
    'POST /extract {"quantity":10} — extract 10 raw resources',
    'POST /tutorial/complete {"step":1} — claim reward'
  ],
  2: [
    'GET /routes — find a route to a Factory zone',
    'POST /travel {"to":"<factory-zone-id>"} — move there',
    'POST /produce {"output":"metal","quantity":10} — produce 10 metal from ore',
    'POST /tutorial/complete {"step":2} — claim reward'
  ],
  3: [
    'Produce supply ingredients: ammo (from metal+chemicals), medkits (from chemicals+rations), parts (from metal+textiles), comms (from textiles+chemicals)',
    'POST /produce {"output":"supply_units","quantity":5} — craft 5 SU from strategic resources',
    'POST /travel to a Front zone (type: "front")',
    'POST /supply {"quantity":5} — deposit SU to the zone',
    'POST /tutorial/complete {"step":3} — claim reward'
  ],
  4: [
    'POST /scan {"depth":1} — scan your current zone and neighbors',
    'POST /travel to another zone, then POST /scan again',
    'Repeat until you have scanned 3 different zones',
    'GET /intel — review your gathered intelligence',
    'POST /tutorial/complete {"step":4} — claim reward'
  ],
  5: [
    'GET /factions — see available factions',
    'POST /factions/join {"factionId":"<id>"} — join a faction (or POST /factions to create one)',
    'POST /factions/treasury/deposit {"resource":"ore","quantity":1} — deposit any resource',
    'POST /tutorial/complete {"step":5} — claim reward'
  ]
};

app.get('/tutorial', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const result = await engine.getTutorialStatus(playerId);
  if (!result.success) throw new NotFoundError('Player', playerId);

  // Add HTTP hints for the current step
  const step = (result.step ?? 0) + 1;
  const httpHints = step <= 5 ? TUTORIAL_HTTP_HINTS[step] : undefined;

  return c.json({
    ...result,
    httpHints,
    note: step <= 5
      ? `Complete step ${step} by following the hints above, then POST /tutorial/complete {"step":${step}}`
      : 'Tutorial complete! You earned credits and reputation. Explore the world, trade, and compete.'
  });
});

app.post('/tutorial/complete', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const step = body.step as number;
  if (!step || step < 1 || step > 5) {
    throw new ValidationError('Step must be 1-5');
  }
  const result = await engine.completeTutorialStep(playerId, step);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Tutorial step failed');
  }
  return c.json(result);
});

// ============================================================================
// SUBSCRIPTION
// ============================================================================

app.post('/subscription/upgrade', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const { tier } = body;
  if (!tier || !['operator', 'command'].includes(tier)) {
    throw new ValidationError("Tier must be 'operator' or 'command'");
  }
  // In production, this would verify Stripe payment. For now, just update tier.
  await db.updatePlayer(playerId, { tier: tier as any });
  return c.json({ success: true, tier });
});

app.get('/subscription', authMiddleware, async (c) => {
  const player = getPlayer(c);
  return c.json({
    tier: player.tier,
    limits: TIER_LIMITS[player.tier]
  });
});

// ============================================================================
// DOCTRINES
// ============================================================================

app.get('/doctrines', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const result = await engine.getFactionDoctrines(playerId);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Failed to get doctrines');
  }
  return c.json(result);
});

app.post('/doctrines', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const { title, content } = body;
  if (!title || !content) {
    throw new ValidationError('Title and content are required');
  }
  const result = await engine.createDoctrine(playerId, title, content);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Failed to create doctrine');
  }
  return c.json(result);
});

app.put('/doctrines/:id', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const doctrineId = c.req.param('id');
  const body = await c.req.json();
  const { content } = body;
  if (!content) {
    throw new ValidationError('Content is required');
  }
  const result = await engine.updateDoctrine(playerId, doctrineId, content);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Failed to update doctrine');
  }
  return c.json(result);
});

app.delete('/doctrines/:id', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const doctrineId = c.req.param('id');
  const result = await engine.deleteDoctrine(playerId, doctrineId);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Failed to delete doctrine');
  }
  return c.json(result);
});

// ============================================================================
// ADVANCED MARKET ORDERS
// ============================================================================

app.post('/market/conditional', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const { zoneId, resource, side, triggerPrice, quantity, condition } = body;
  if (!zoneId || !resource || !side || !triggerPrice || !quantity || !condition) {
    throw new ValidationError('All fields required: zoneId, resource, side, triggerPrice, quantity, condition');
  }
  const result = await engine.createConditionalOrder(playerId, zoneId, resource, side, triggerPrice, quantity, condition);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Failed to create conditional order');
  }
  return c.json(result);
});

app.post('/market/time-weighted', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const { zoneId, resource, side, price, totalQuantity, quantityPerTick } = body;
  if (!zoneId || !resource || !side || !price || !totalQuantity || !quantityPerTick) {
    throw new ValidationError('All fields required: zoneId, resource, side, price, totalQuantity, quantityPerTick');
  }
  const result = await engine.createTimeWeightedOrder(playerId, zoneId, resource, side, price, totalQuantity, quantityPerTick);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Failed to create time-weighted order');
  }
  return c.json(result);
});

// ============================================================================
// WEBHOOKS
// ============================================================================

app.get('/webhooks', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const result = await engine.getWebhooks(playerId);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Failed to get webhooks');
  }
  return c.json(result);
});

app.post('/webhooks', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const { url, events } = body;
  if (!url || !events || !Array.isArray(events)) {
    throw new ValidationError('URL and events array are required');
  }
  const result = await engine.registerWebhook(playerId, url, events);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Failed to register webhook');
  }
  return c.json(result);
});

app.delete('/webhooks/:id', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const webhookId = c.req.param('id');
  const result = await engine.deleteWebhook(playerId, webhookId);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Failed to delete webhook');
  }
  return c.json(result);
});

// ============================================================================
// DATA EXPORT
// ============================================================================

app.get('/me/export', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const result = await engine.exportPlayerData(playerId);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Export failed');
  }
  return c.json(result);
});

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

app.post('/batch', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const body = await c.req.json();
  const { operations } = body;
  if (!operations || !Array.isArray(operations)) {
    throw new ValidationError('Operations array is required');
  }
  if (operations.length > 10) {
    throw new ValidationError('Maximum 10 operations per batch');
  }
  const result = await engine.executeBatch(playerId, operations);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Batch failed');
  }
  return c.json(result);
});

// ============================================================================
// FACTION ANALYTICS
// ============================================================================

app.get('/faction/analytics', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const result = await engine.getFactionAnalytics(playerId);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Analytics failed');
  }
  return c.json(result);
});

app.get('/faction/audit', authMiddleware, async (c) => {
  const playerId = getPlayerId(c);
  const limit = parseInt(c.req.query('limit') || '100');
  const result = await engine.getFactionAuditLogs(playerId, limit);
  if (!result.success) {
    throw new GameError(ErrorCodes.INVALID_STATE, result.error || 'Audit log failed');
  }
  return c.json(result);
});

// ============================================================================
// ADMIN / TICK SERVER
// ============================================================================

app.post('/admin/tick', async (c) => {
  if (!await adminAuth(c)) return c.json({ error: 'Unauthorized' }, 401);

  const result = await engine.processTick();
  return c.json({ tick: result.tick, eventCount: result.events.length });
});

// Admin middleware for all /admin routes below
const adminAuth = async (c: Context): Promise<boolean> => {
  const adminKey = c.req.header('X-Admin-Key');
  return adminKey === process.env.ADMIN_KEY;
};

app.get('/admin/dashboard', async (c) => {
  if (!await adminAuth(c)) return c.json({ error: 'Unauthorized' }, 401);

  const [players, zones, factions] = await Promise.all([
    db.getAllPlayers(),
    db.getAllZones(),
    db.getAllFactions()
  ]);

  const now = Date.now();
  const currentTick = await db.getCurrentTick();

  // Active = acted within last 144 ticks (1 day at 10min ticks)
  const activePlayers = players.filter(p => currentTick - p.lastActionTick < 144);
  // Recent = acted within last 6 ticks (1 hour)
  const recentPlayers = players.filter(p => currentTick - p.lastActionTick < 6);

  const controlledZones = zones.filter(z => z.ownerId);
  const criticalZones = zones.filter(z => z.supplyLevel < 50 && z.burnRate > 0);
  const collapsedZones = zones.filter(z => z.supplyLevel === 0 && z.burnRate > 0);

  const tierCounts = { freelance: 0, operator: 0, command: 0 };
  for (const p of players) {
    tierCounts[p.tier as keyof typeof tierCounts]++;
  }

  return c.json({
    overview: {
      totalPlayers: players.length,
      activePlayers24h: activePlayers.length,
      activePlayersLastHour: recentPlayers.length,
      totalFactions: factions.length,
      totalZones: zones.length,
      controlledZones: controlledZones.length,
      criticalZones: criticalZones.length,
      collapsedZones: collapsedZones.length,
      currentTick
    },
    tiers: tierCounts,
    topPlayers: players
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 20)
      .map(p => ({
        id: p.id,
        name: p.name,
        tier: p.tier,
        reputation: p.reputation,
        credits: p.inventory.credits,
        lastActionTick: p.lastActionTick,
        factionId: p.factionId,
        tutorialStep: p.tutorialStep
      })),
    factions: factions.map(f => ({
      id: f.id,
      name: f.name,
      tag: f.tag,
      memberCount: f.members.length,
      zoneCount: zones.filter(z => z.ownerId === f.id).length
    })),
    zoneHealth: {
      fortified: zones.filter(z => z.supplyLevel >= 100 && z.complianceStreak >= 50).length,
      supplied: zones.filter(z => z.supplyLevel >= 100 && z.complianceStreak < 50).length,
      strained: zones.filter(z => z.supplyLevel >= 50 && z.supplyLevel < 100).length,
      critical: criticalZones.length,
      collapsed: collapsedZones.length,
      neutral: zones.filter(z => !z.ownerId && z.burnRate === 0).length
    }
  });
});

app.get('/admin/players', async (c) => {
  if (!await adminAuth(c)) return c.json({ error: 'Unauthorized' }, 401);

  const players = await db.getAllPlayers();
  const limit = parseInt(c.req.query('limit') || '100');
  const sort = c.req.query('sort') || 'reputation';

  const sorted = [...players].sort((a, b) => {
    switch (sort) {
      case 'credits': return b.inventory.credits - a.inventory.credits;
      case 'activity': return b.lastActionTick - a.lastActionTick;
      case 'name': return a.name.localeCompare(b.name);
      default: return b.reputation - a.reputation;
    }
  });

  return c.json({
    total: players.length,
    players: sorted.slice(0, limit).map(p => ({
      id: p.id,
      name: p.name,
      tier: p.tier,
      reputation: p.reputation,
      credits: p.inventory.credits,
      lastActionTick: p.lastActionTick,
      locationId: p.locationId,
      factionId: p.factionId,
      tutorialStep: p.tutorialStep
    }))
  });
});

app.get('/admin/activity', async (c) => {
  if (!await adminAuth(c)) return c.json({ error: 'Unauthorized' }, 401);

  const limit = parseInt(c.req.query('limit') || '200');
  const type = c.req.query('type') || undefined;
  const events = await db.getEvents({ limit, type });

  return c.json({
    total: events.length,
    events: events.map(e => ({
      id: e.id,
      type: e.type,
      tick: e.tick,
      actorId: e.actorId,
      actorType: e.actorType,
      data: e.data,
      timestamp: e.timestamp
    }))
  });
});

app.post('/admin/init-world', async (c) => {
  if (!await adminAuth(c)) return c.json({ error: 'Unauthorized' }, 401);

  // Check if world already exists
  const existingZones = await db.getAllZones();
  if (existingZones.length > 0) {
    return c.json({ error: 'World already initialized', zoneCount: existingZones.length }, 400);
  }

  const world = generateWorldData();
  const zoneNameToId = new Map<string, string>();

  // Create zones and collect name->id mapping
  for (const zoneData of world.zones) {
    const zone = await db.createZone(zoneData);
    zoneNameToId.set(zone.name, zone.id);
  }

  // Map route names to IDs and create routes
  const routesWithIds = mapRouteNamesToIds(world.routes, zoneNameToId);
  for (const routeData of routesWithIds) {
    await db.createRoute(routeData);
  }

  return c.json({
    success: true,
    zones: world.zones.length,
    routes: world.routes.length
  });
});

// ============================================================================
// INITIALIZATION
// ============================================================================

export async function createApp(tursoUrl?: string, authToken?: string) {
  db = new TursoDatabase(tursoUrl, authToken);
  await db.initialize();
  engine = new AsyncGameEngine(db);
  return app;
}

// For direct execution
const port = parseInt(process.env.PORT || '3000');

if (process.env.NODE_ENV !== 'test') {
  createApp().then((application) => {
    const server = serve({
      fetch: application.fetch,
      port
    }, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                        BURNRATE API                          ║
║              The front doesn't feed itself.                  ║
╠══════════════════════════════════════════════════════════════╣
║  Server running on port ${port.toString().padEnd(36)}║
║  Health check: GET /health                                   ║
║  Join game:    POST /join { "name": "YourName" }             ║
╚══════════════════════════════════════════════════════════════╝
`);
    });

    const shutdown = () => {
      console.log('\nShutting down API server...');
      server.close(() => {
        console.log('API server stopped.');
        process.exit(0);
      });
      // Force exit after 5 seconds if connections don't close
      setTimeout(() => process.exit(1), 5000);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

export default app;
