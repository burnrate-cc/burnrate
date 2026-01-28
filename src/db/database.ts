/**
 * BURNRATE Database Layer
 * SQLite-based persistence for game state
 */

import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import {
  Zone, Route, Player, Faction, Shipment, Unit,
  MarketOrder, Contract, IntelReport, GameEvent,
  WorldState, emptyInventory, Inventory, ZoneType,
  BURN_RATES, SubscriptionTier, FactionMember, FactionRank
} from '../core/types.js';

export class GameDatabase {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      -- World state
      CREATE TABLE IF NOT EXISTS world (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_tick INTEGER NOT NULL DEFAULT 0,
        season_number INTEGER NOT NULL DEFAULT 1,
        season_week INTEGER NOT NULL DEFAULT 1
      );

      -- Zones
      CREATE TABLE IF NOT EXISTS zones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        owner_id TEXT,
        supply_level REAL NOT NULL DEFAULT 100,
        burn_rate INTEGER NOT NULL,
        compliance_streak INTEGER NOT NULL DEFAULT 0,
        su_stockpile INTEGER NOT NULL DEFAULT 0,
        inventory TEXT NOT NULL DEFAULT '{}',
        production_capacity INTEGER NOT NULL DEFAULT 0,
        garrison_level INTEGER NOT NULL DEFAULT 0,
        market_depth REAL NOT NULL DEFAULT 1.0
      );

      -- Routes
      CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        from_zone_id TEXT NOT NULL,
        to_zone_id TEXT NOT NULL,
        distance INTEGER NOT NULL,
        capacity INTEGER NOT NULL,
        base_risk REAL NOT NULL,
        chokepoint_rating REAL NOT NULL DEFAULT 1.0,
        FOREIGN KEY (from_zone_id) REFERENCES zones(id),
        FOREIGN KEY (to_zone_id) REFERENCES zones(id)
      );

      -- Players
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        tier TEXT NOT NULL DEFAULT 'freelance',
        inventory TEXT NOT NULL DEFAULT '{}',
        location_id TEXT NOT NULL,
        faction_id TEXT,
        reputation INTEGER NOT NULL DEFAULT 0,
        actions_today INTEGER NOT NULL DEFAULT 0,
        last_action_tick INTEGER NOT NULL DEFAULT 0,
        licenses TEXT NOT NULL DEFAULT '{"courier":true,"freight":false,"convoy":false}',
        FOREIGN KEY (location_id) REFERENCES zones(id),
        FOREIGN KEY (faction_id) REFERENCES factions(id)
      );

      -- Factions
      CREATE TABLE IF NOT EXISTS factions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        tag TEXT NOT NULL UNIQUE,
        founder_id TEXT NOT NULL,
        treasury TEXT NOT NULL DEFAULT '{}',
        officer_withdraw_limit INTEGER NOT NULL DEFAULT 1000,
        doctrine_hash TEXT,
        upgrades TEXT NOT NULL DEFAULT '{}',
        relations TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY (founder_id) REFERENCES players(id)
      );

      -- Faction members
      CREATE TABLE IF NOT EXISTS faction_members (
        faction_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        rank TEXT NOT NULL DEFAULT 'member',
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (faction_id, player_id),
        FOREIGN KEY (faction_id) REFERENCES factions(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      );

      -- Shipments
      CREATE TABLE IF NOT EXISTS shipments (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        type TEXT NOT NULL,
        path TEXT NOT NULL,
        current_position INTEGER NOT NULL DEFAULT 0,
        ticks_to_next_zone INTEGER NOT NULL,
        cargo TEXT NOT NULL DEFAULT '{}',
        escort_ids TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_transit',
        FOREIGN KEY (player_id) REFERENCES players(id)
      );

      -- Units
      CREATE TABLE IF NOT EXISTS units (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        type TEXT NOT NULL,
        location_id TEXT NOT NULL,
        strength INTEGER NOT NULL,
        speed INTEGER NOT NULL,
        maintenance INTEGER NOT NULL,
        assignment_id TEXT,
        for_sale_price INTEGER,
        FOREIGN KEY (player_id) REFERENCES players(id),
        FOREIGN KEY (location_id) REFERENCES zones(id)
      );

      -- Market orders
      CREATE TABLE IF NOT EXISTS market_orders (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        zone_id TEXT NOT NULL,
        resource TEXT NOT NULL,
        side TEXT NOT NULL,
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        original_quantity INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (player_id) REFERENCES players(id),
        FOREIGN KEY (zone_id) REFERENCES zones(id)
      );

      -- Trades
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        zone_id TEXT NOT NULL,
        resource TEXT NOT NULL,
        buyer_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        executed_at INTEGER NOT NULL,
        FOREIGN KEY (zone_id) REFERENCES zones(id)
      );

      -- Contracts
      CREATE TABLE IF NOT EXISTS contracts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        poster_id TEXT NOT NULL,
        poster_type TEXT NOT NULL,
        accepted_by TEXT,
        details TEXT NOT NULL DEFAULT '{}',
        deadline INTEGER NOT NULL,
        reward TEXT NOT NULL DEFAULT '{}',
        bonus TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL
      );

      -- Intel reports
      CREATE TABLE IF NOT EXISTS intel (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        faction_id TEXT,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        gathered_at INTEGER NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        signal_quality INTEGER NOT NULL,
        FOREIGN KEY (player_id) REFERENCES players(id),
        FOREIGN KEY (faction_id) REFERENCES factions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_intel_faction ON intel(faction_id);

      -- Game events (event sourcing)
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        tick INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        actor_id TEXT,
        actor_type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor_id);

      -- Initialize world state
      INSERT OR IGNORE INTO world (id, current_tick, season_number, season_week)
      VALUES (1, 0, 1, 1);
    `);
  }

  // ============================================================================
  // WORLD STATE
  // ============================================================================

  getCurrentTick(): number {
    const row = this.db.prepare('SELECT current_tick FROM world WHERE id = 1').get() as { current_tick: number };
    return row.current_tick;
  }

  incrementTick(): number {
    this.db.prepare('UPDATE world SET current_tick = current_tick + 1 WHERE id = 1').run();
    return this.getCurrentTick();
  }

  getSeasonInfo(): { seasonNumber: number; seasonWeek: number } {
    const row = this.db.prepare('SELECT season_number, season_week FROM world WHERE id = 1').get() as any;
    return { seasonNumber: row.season_number, seasonWeek: row.season_week };
  }

  // ============================================================================
  // ZONES
  // ============================================================================

  createZone(zone: Omit<Zone, 'id'>): Zone {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO zones (id, name, type, owner_id, supply_level, burn_rate, compliance_streak,
                         su_stockpile, inventory, production_capacity, garrison_level, market_depth)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, zone.name, zone.type, zone.ownerId, zone.supplyLevel, zone.burnRate,
      zone.complianceStreak, zone.suStockpile, JSON.stringify(zone.inventory),
      zone.productionCapacity, zone.garrisonLevel, zone.marketDepth
    );
    return { id, ...zone };
  }

  getZone(id: string): Zone | null {
    const row = this.db.prepare('SELECT * FROM zones WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToZone(row);
  }

  getAllZones(): Zone[] {
    const rows = this.db.prepare('SELECT * FROM zones').all() as any[];
    return rows.map(this.rowToZone);
  }

  updateZone(id: string, updates: Partial<Zone>): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.ownerId !== undefined) { sets.push('owner_id = ?'); values.push(updates.ownerId); }
    if (updates.supplyLevel !== undefined) { sets.push('supply_level = ?'); values.push(updates.supplyLevel); }
    if (updates.complianceStreak !== undefined) { sets.push('compliance_streak = ?'); values.push(updates.complianceStreak); }
    if (updates.suStockpile !== undefined) { sets.push('su_stockpile = ?'); values.push(updates.suStockpile); }
    if (updates.inventory !== undefined) { sets.push('inventory = ?'); values.push(JSON.stringify(updates.inventory)); }
    if (updates.garrisonLevel !== undefined) { sets.push('garrison_level = ?'); values.push(updates.garrisonLevel); }

    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE zones SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  private rowToZone(row: any): Zone {
    return {
      id: row.id,
      name: row.name,
      type: row.type as ZoneType,
      ownerId: row.owner_id,
      supplyLevel: row.supply_level,
      burnRate: row.burn_rate,
      complianceStreak: row.compliance_streak,
      suStockpile: row.su_stockpile,
      inventory: JSON.parse(row.inventory),
      productionCapacity: row.production_capacity,
      garrisonLevel: row.garrison_level,
      marketDepth: row.market_depth,
      medkitStockpile: row.medkit_stockpile || 0,
      commsStockpile: row.comms_stockpile || 0
    };
  }

  // ============================================================================
  // ROUTES
  // ============================================================================

  createRoute(route: Omit<Route, 'id'>): Route {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO routes (id, from_zone_id, to_zone_id, distance, capacity, base_risk, chokepoint_rating)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, route.fromZoneId, route.toZoneId, route.distance, route.capacity, route.baseRisk, route.chokepointRating);
    return { id, ...route };
  }

  getRoute(id: string): Route | null {
    const row = this.db.prepare('SELECT * FROM routes WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToRoute(row);
  }

  getRoutesBetween(fromZoneId: string, toZoneId: string): Route[] {
    const rows = this.db.prepare(
      'SELECT * FROM routes WHERE from_zone_id = ? AND to_zone_id = ?'
    ).all(fromZoneId, toZoneId) as any[];
    return rows.map(this.rowToRoute);
  }

  getRoutesFromZone(zoneId: string): Route[] {
    const rows = this.db.prepare('SELECT * FROM routes WHERE from_zone_id = ?').all(zoneId) as any[];
    return rows.map(this.rowToRoute);
  }

  getAllRoutes(): Route[] {
    const rows = this.db.prepare('SELECT * FROM routes').all() as any[];
    return rows.map(this.rowToRoute);
  }

  private rowToRoute(row: any): Route {
    return {
      id: row.id,
      fromZoneId: row.from_zone_id,
      toZoneId: row.to_zone_id,
      distance: row.distance,
      capacity: row.capacity,
      baseRisk: row.base_risk,
      chokepointRating: row.chokepoint_rating
    };
  }

  // ============================================================================
  // PLAYERS
  // ============================================================================

  createPlayer(name: string, startingZoneId: string): Player {
    const id = uuid();
    const inventory = { ...emptyInventory(), credits: 500 };  // Starting credits
    const licenses = { courier: true, freight: false, convoy: false };

    this.db.prepare(`
      INSERT INTO players (id, name, tier, inventory, location_id, reputation, licenses)
      VALUES (?, ?, 'freelance', ?, ?, 0, ?)
    `).run(id, name, JSON.stringify(inventory), startingZoneId, JSON.stringify(licenses));

    return {
      id, name, tier: 'freelance', inventory, locationId: startingZoneId,
      factionId: null, reputation: 0, actionsToday: 0, lastActionTick: 0, licenses,
      tutorialStep: 0
    };
  }

  getPlayer(id: string): Player | null {
    const row = this.db.prepare('SELECT * FROM players WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToPlayer(row);
  }

  getPlayerByName(name: string): Player | null {
    const row = this.db.prepare('SELECT * FROM players WHERE name = ?').get(name) as any;
    if (!row) return null;
    return this.rowToPlayer(row);
  }

  getAllPlayers(): Player[] {
    const rows = this.db.prepare('SELECT * FROM players').all() as any[];
    return rows.map(this.rowToPlayer);
  }

  updatePlayer(id: string, updates: Partial<Player>): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.inventory !== undefined) { sets.push('inventory = ?'); values.push(JSON.stringify(updates.inventory)); }
    if (updates.locationId !== undefined) { sets.push('location_id = ?'); values.push(updates.locationId); }
    if (updates.factionId !== undefined) { sets.push('faction_id = ?'); values.push(updates.factionId); }
    if (updates.reputation !== undefined) { sets.push('reputation = ?'); values.push(updates.reputation); }
    if (updates.actionsToday !== undefined) { sets.push('actions_today = ?'); values.push(updates.actionsToday); }
    if (updates.lastActionTick !== undefined) { sets.push('last_action_tick = ?'); values.push(updates.lastActionTick); }
    if (updates.tier !== undefined) { sets.push('tier = ?'); values.push(updates.tier); }
    if (updates.licenses !== undefined) { sets.push('licenses = ?'); values.push(JSON.stringify(updates.licenses)); }

    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  private rowToPlayer(row: any): Player {
    return {
      id: row.id,
      name: row.name,
      tier: row.tier as SubscriptionTier,
      inventory: JSON.parse(row.inventory),
      locationId: row.location_id,
      factionId: row.faction_id,
      reputation: row.reputation,
      actionsToday: row.actions_today,
      lastActionTick: row.last_action_tick,
      licenses: JSON.parse(row.licenses),
      tutorialStep: row.tutorial_step || 0
    };
  }

  // ============================================================================
  // FACTIONS
  // ============================================================================

  createFaction(name: string, tag: string, founderId: string): Faction {
    const id = uuid();
    const treasury = emptyInventory();
    const upgrades = {
      relayNetwork: 0,
      routeFortification: 0,
      productionBonus: 0,
      garrisonStrength: 0,
      marketDepth: 0
    };
    const tick = this.getCurrentTick();

    this.db.prepare(`
      INSERT INTO factions (id, name, tag, founder_id, treasury, upgrades, relations)
      VALUES (?, ?, ?, ?, ?, ?, '{}')
    `).run(id, name, tag, founderId, JSON.stringify(treasury), JSON.stringify(upgrades));

    // Add founder as member
    this.db.prepare(`
      INSERT INTO faction_members (faction_id, player_id, rank, joined_at)
      VALUES (?, ?, 'founder', ?)
    `).run(id, founderId, tick);

    // Update player's faction
    this.updatePlayer(founderId, { factionId: id });

    return {
      id, name, tag, founderId, treasury,
      officerWithdrawLimit: 1000,
      members: [{ playerId: founderId, rank: 'founder', joinedAt: tick }],
      controlledZones: [],
      doctrineHash: null,
      upgrades,
      relations: {}
    };
  }

  getFaction(id: string): Faction | null {
    const row = this.db.prepare('SELECT * FROM factions WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToFaction(row);
  }

  getAllFactions(): Faction[] {
    const rows = this.db.prepare('SELECT * FROM factions').all() as any[];
    return rows.map(r => this.rowToFaction(r));
  }

  private rowToFaction(row: any): Faction {
    const members = this.db.prepare(
      'SELECT player_id, rank, joined_at FROM faction_members WHERE faction_id = ?'
    ).all(row.id) as any[];

    const controlledZones = this.db.prepare(
      'SELECT id FROM zones WHERE owner_id = ?'
    ).all(row.id).map((z: any) => z.id);

    return {
      id: row.id,
      name: row.name,
      tag: row.tag,
      founderId: row.founder_id,
      treasury: JSON.parse(row.treasury),
      officerWithdrawLimit: row.officer_withdraw_limit,
      members: members.map(m => ({
        playerId: m.player_id,
        rank: m.rank as FactionRank,
        joinedAt: m.joined_at
      })),
      controlledZones,
      doctrineHash: row.doctrine_hash,
      upgrades: JSON.parse(row.upgrades),
      relations: JSON.parse(row.relations)
    };
  }

  addFactionMember(factionId: string, playerId: string, rank: FactionRank = 'member'): void {
    const tick = this.getCurrentTick();
    this.db.prepare(`
      INSERT INTO faction_members (faction_id, player_id, rank, joined_at)
      VALUES (?, ?, ?, ?)
    `).run(factionId, playerId, rank, tick);
    this.updatePlayer(playerId, { factionId });
  }

  removeFactionMember(factionId: string, playerId: string): void {
    this.db.prepare('DELETE FROM faction_members WHERE faction_id = ? AND player_id = ?').run(factionId, playerId);
    this.updatePlayer(playerId, { factionId: null });
  }

  updateFactionMemberRank(factionId: string, playerId: string, rank: FactionRank): void {
    this.db.prepare('UPDATE faction_members SET rank = ? WHERE faction_id = ? AND player_id = ?').run(rank, factionId, playerId);
  }

  // ============================================================================
  // SHIPMENTS
  // ============================================================================

  createShipment(shipment: Omit<Shipment, 'id'>): Shipment {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO shipments (id, player_id, type, path, current_position, ticks_to_next_zone,
                             cargo, escort_ids, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, shipment.playerId, shipment.type, JSON.stringify(shipment.path),
      shipment.currentPosition, shipment.ticksToNextZone, JSON.stringify(shipment.cargo),
      JSON.stringify(shipment.escortIds), shipment.createdAt, shipment.status
    );
    return { id, ...shipment };
  }

  getShipment(id: string): Shipment | null {
    const row = this.db.prepare('SELECT * FROM shipments WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToShipment(row);
  }

  getActiveShipments(): Shipment[] {
    const rows = this.db.prepare("SELECT * FROM shipments WHERE status = 'in_transit'").all() as any[];
    return rows.map(this.rowToShipment);
  }

  getPlayerShipments(playerId: string): Shipment[] {
    const rows = this.db.prepare('SELECT * FROM shipments WHERE player_id = ?').all(playerId) as any[];
    return rows.map(this.rowToShipment);
  }

  updateShipment(id: string, updates: Partial<Shipment>): void {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.currentPosition !== undefined) { sets.push('current_position = ?'); values.push(updates.currentPosition); }
    if (updates.ticksToNextZone !== undefined) { sets.push('ticks_to_next_zone = ?'); values.push(updates.ticksToNextZone); }
    if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.escortIds !== undefined) { sets.push('escort_ids = ?'); values.push(JSON.stringify(updates.escortIds)); }

    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE shipments SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  private rowToShipment(row: any): Shipment {
    return {
      id: row.id,
      playerId: row.player_id,
      type: row.type,
      path: JSON.parse(row.path),
      currentPosition: row.current_position,
      ticksToNextZone: row.ticks_to_next_zone,
      cargo: JSON.parse(row.cargo),
      escortIds: JSON.parse(row.escort_ids),
      createdAt: row.created_at,
      status: row.status
    };
  }

  // ============================================================================
  // MARKET ORDERS
  // ============================================================================

  createOrder(order: Omit<MarketOrder, 'id'>): MarketOrder {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO market_orders (id, player_id, zone_id, resource, side, price, quantity, original_quantity, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, order.playerId, order.zoneId, order.resource, order.side, order.price, order.quantity, order.originalQuantity, order.createdAt);
    return { id, ...order };
  }

  getOrder(id: string): MarketOrder | null {
    const row = this.db.prepare('SELECT * FROM market_orders WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToOrder(row);
  }

  getOrdersForZone(zoneId: string, resource?: string): MarketOrder[] {
    let query = 'SELECT * FROM market_orders WHERE zone_id = ? AND quantity > 0';
    const params: any[] = [zoneId];
    if (resource) {
      query += ' AND resource = ?';
      params.push(resource);
    }
    query += ' ORDER BY side, price';
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(this.rowToOrder);
  }

  updateOrder(id: string, quantity: number): void {
    this.db.prepare('UPDATE market_orders SET quantity = ? WHERE id = ?').run(quantity, id);
  }

  deleteOrder(id: string): void {
    this.db.prepare('DELETE FROM market_orders WHERE id = ?').run(id);
  }

  private rowToOrder(row: any): MarketOrder {
    return {
      id: row.id,
      playerId: row.player_id,
      zoneId: row.zone_id,
      resource: row.resource,
      side: row.side,
      price: row.price,
      quantity: row.quantity,
      originalQuantity: row.original_quantity,
      createdAt: row.created_at
    };
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  recordEvent(event: Omit<GameEvent, 'id'>): GameEvent {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO events (id, type, tick, timestamp, actor_id, actor_type, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, event.type, event.tick, event.timestamp.toISOString(), event.actorId, event.actorType, JSON.stringify(event.data));
    return { id, ...event };
  }

  getEvents(options: { limit?: number; offset?: number; type?: string; actorId?: string; sincesTick?: number } = {}): GameEvent[] {
    let query = 'SELECT * FROM events WHERE 1=1';
    const params: any[] = [];

    if (options.type) { query += ' AND type = ?'; params.push(options.type); }
    if (options.actorId) { query += ' AND actor_id = ?'; params.push(options.actorId); }
    if (options.sincesTick !== undefined) { query += ' AND tick >= ?'; params.push(options.sincesTick); }

    query += ' ORDER BY tick DESC, created_at DESC';
    if (options.limit) { query += ' LIMIT ?'; params.push(options.limit); }
    if (options.offset) { query += ' OFFSET ?'; params.push(options.offset); }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      tick: row.tick,
      timestamp: new Date(row.timestamp),
      actorId: row.actor_id,
      actorType: row.actor_type,
      data: JSON.parse(row.data)
    }));
  }

  // ============================================================================
  // CONTRACTS
  // ============================================================================

  createContract(contract: Omit<Contract, 'id'>): Contract {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO contracts (id, type, poster_id, poster_type, accepted_by, details, deadline, reward, bonus, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, contract.type, contract.posterId, contract.posterType, contract.acceptedBy,
      JSON.stringify(contract.details), contract.deadline, JSON.stringify(contract.reward),
      contract.bonus ? JSON.stringify(contract.bonus) : null, contract.status, contract.createdAt
    );
    return { id, ...contract };
  }

  getContract(id: string): Contract | null {
    const row = this.db.prepare('SELECT * FROM contracts WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToContract(row);
  }

  getOpenContracts(zoneId?: string): Contract[] {
    let query = "SELECT * FROM contracts WHERE status = 'open'";
    const params: any[] = [];
    // Note: zoneId filtering would need to parse details JSON; for now return all open
    query += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(this.rowToContract);
  }

  updateContract(id: string, updates: { status?: string; acceptedBy?: string }): void {
    const sets: string[] = [];
    const values: any[] = [];
    if (updates.status) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.acceptedBy) { sets.push('accepted_by = ?'); values.push(updates.acceptedBy); }
    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE contracts SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  private rowToContract(row: any): Contract {
    return {
      id: row.id,
      type: row.type,
      posterId: row.poster_id,
      posterType: row.poster_type,
      acceptedBy: row.accepted_by,
      details: JSON.parse(row.details),
      deadline: row.deadline,
      reward: JSON.parse(row.reward),
      bonus: row.bonus ? JSON.parse(row.bonus) : undefined,
      status: row.status,
      createdAt: row.created_at
    };
  }

  // ============================================================================
  // UNITS
  // ============================================================================

  createUnit(unit: Omit<Unit, 'id'>): Unit {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO units (id, player_id, type, location_id, strength, speed, maintenance, assignment_id, for_sale_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, unit.playerId, unit.type, unit.locationId, unit.strength, unit.speed, unit.maintenance, unit.assignmentId, unit.forSalePrice);
    return { id, ...unit };
  }

  getUnit(id: string): Unit | null {
    const row = this.db.prepare('SELECT * FROM units WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.rowToUnit(row);
  }

  getPlayerUnits(playerId: string): Unit[] {
    const rows = this.db.prepare('SELECT * FROM units WHERE player_id = ?').all(playerId) as any[];
    return rows.map(this.rowToUnit);
  }

  updateUnit(id: string, updates: Partial<Unit>): void {
    const sets: string[] = [];
    const values: any[] = [];
    if (updates.locationId !== undefined) { sets.push('location_id = ?'); values.push(updates.locationId); }
    if (updates.assignmentId !== undefined) { sets.push('assignment_id = ?'); values.push(updates.assignmentId); }
    if (updates.playerId !== undefined) { sets.push('player_id = ?'); values.push(updates.playerId); }
    if (updates.forSalePrice !== undefined) { sets.push('for_sale_price = ?'); values.push(updates.forSalePrice); }
    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE units SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteUnit(id: string): void {
    this.db.prepare('DELETE FROM units WHERE id = ?').run(id);
  }

  private rowToUnit(row: any): Unit {
    return {
      id: row.id,
      playerId: row.player_id,
      type: row.type,
      locationId: row.location_id,
      strength: row.strength,
      speed: row.speed,
      maintenance: row.maintenance,
      assignmentId: row.assignment_id,
      forSalePrice: row.for_sale_price
    };
  }

  getUnitsForSaleAtZone(zoneId: string): Unit[] {
    const rows = this.db.prepare(
      'SELECT * FROM units WHERE location_id = ? AND for_sale_price IS NOT NULL'
    ).all(zoneId) as any[];
    return rows.map(this.rowToUnit);
  }

  // ============================================================================
  // INTEL
  // ============================================================================

  createIntel(intel: Omit<IntelReport, 'id'>): IntelReport {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO intel (id, player_id, faction_id, target_type, target_id, gathered_at, data, signal_quality)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, intel.playerId, intel.factionId, intel.targetType, intel.targetId, intel.gatheredAt, JSON.stringify(intel.data), intel.signalQuality);
    return { id, ...intel };
  }

  getPlayerIntel(playerId: string, limit: number = 100): IntelReport[] {
    const rows = this.db.prepare(
      'SELECT * FROM intel WHERE player_id = ? ORDER BY gathered_at DESC LIMIT ?'
    ).all(playerId, limit) as any[];
    return rows.map(this.rowToIntel);
  }

  getFactionIntel(factionId: string, limit: number = 100): IntelReport[] {
    const rows = this.db.prepare(
      'SELECT * FROM intel WHERE faction_id = ? ORDER BY gathered_at DESC LIMIT ?'
    ).all(factionId, limit) as any[];
    return rows.map(this.rowToIntel);
  }

  getLatestIntelForTarget(targetType: 'zone' | 'route', targetId: string, factionId?: string): IntelReport | null {
    let query = 'SELECT * FROM intel WHERE target_type = ? AND target_id = ?';
    const params: any[] = [targetType, targetId];

    if (factionId) {
      query += ' AND faction_id = ?';
      params.push(factionId);
    }

    query += ' ORDER BY gathered_at DESC LIMIT 1';
    const row = this.db.prepare(query).get(...params) as any;
    return row ? this.rowToIntel(row) : null;
  }

  private rowToIntel(row: any): IntelReport {
    return {
      id: row.id,
      playerId: row.player_id,
      factionId: row.faction_id,
      targetType: row.target_type,
      targetId: row.target_id,
      gatheredAt: row.gathered_at,
      data: JSON.parse(row.data),
      signalQuality: row.signal_quality
    };
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  close(): void {
    this.db.close();
  }

  /** Run arbitrary SQL (for testing/migrations) */
  exec(sql: string): void {
    this.db.exec(sql);
  }
}
