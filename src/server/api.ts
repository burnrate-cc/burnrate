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
  errorResponse, validateBody, ErrorCodes
} from './errors.js';
import {
  JoinSchema, TravelSchema, ExtractSchema, ProduceSchema, ShipSchema,
  MarketOrderSchema, ScanSchema, SupplySchema, FactionCreateSchema,
  ContractCreateSchema, EscortAssignSchema, RaiderDeploySchema, UnitSellSchema
} from './validation.js';
import { rateLimitMiddleware, tierRateLimitMiddleware, writeRateLimitMiddleware } from './rate-limit.js';

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
app.use('*', cors());

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

// ============================================================================
// PUBLIC ENDPOINTS (no auth required)
// ============================================================================

app.get('/', (c) => {
  return c.json({
    name: 'BURNRATE',
    tagline: 'The front doesn\'t feed itself.',
    version: '1.0.0',
    docs: '/docs'
  });
});

app.get('/health', async (c) => {
  try {
    const tick = await db.getCurrentTick();
    return c.json({ status: 'ok', tick });
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

  return c.json({
    success: true,
    message: `Welcome to BURNRATE, ${name}! Save your API key - you'll need it for all requests.`,
    apiKey: player.apiKey,
    playerId: player.id,
    location: hub.name
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
    throw new GameError(ErrorCodes.NO_ROUTE, result.error || 'Travel failed');
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
    throw new GameError(ErrorCodes.WRONG_ZONE_TYPE, result.error || 'Extraction failed');
  }

  return c.json({ success: true, extracted: result.extracted });
});

// Produce resources/units at a Factory
app.post('/produce', authMiddleware, writeRateLimitMiddleware(), async (c) => {
  const playerId = getPlayerId(c);
  const { output, quantity } = await validateBody(c, ProduceSchema);

  const result = await engine.produce(playerId, output, quantity);
  if (!result.success) {
    throw new GameError(ErrorCodes.INSUFFICIENT_RESOURCES, result.error || 'Production failed');
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
    throw new GameError(ErrorCodes.INSUFFICIENT_RESOURCES, result.error || 'Shipment failed');
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
    throw new GameError(ErrorCodes.INSUFFICIENT_RESOURCES, result.error || 'Order failed');
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
    throw new GameError(ErrorCodes.INSUFFICIENT_RESOURCES, result.error || 'Supply failed');
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
    throw new GameError(ErrorCodes.INSUFFICIENT_RESOURCES, result.error || 'Stockpile deposit failed');
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
    throw new GameError(ErrorCodes.ALREADY_IN_FACTION, result.error || 'Faction creation failed');
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
// ADMIN / TICK SERVER
// ============================================================================

app.post('/admin/tick', async (c) => {
  const adminKey = c.req.header('X-Admin-Key');
  if (adminKey !== process.env.ADMIN_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const result = await engine.processTick();
  return c.json({ tick: result.tick, eventCount: result.events.length });
});

app.post('/admin/init-world', async (c) => {
  const adminKey = c.req.header('X-Admin-Key');
  if (adminKey !== process.env.ADMIN_KEY) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

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
    serve({
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
  });
}

export default app;
