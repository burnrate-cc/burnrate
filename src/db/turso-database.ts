/**
 * BURNRATE Database Layer (Turso/LibSQL)
 * Multiplayer-ready persistence using Turso distributed SQLite
 */

import { createClient, Client, InStatement, Transaction } from '@libsql/client';
import { v4 as uuid } from 'uuid';
import {
  Zone, Route, Player, Faction, Shipment, Unit,
  MarketOrder, Contract, IntelReport, GameEvent, Inventory,
  emptyInventory, ZoneType, SubscriptionTier, FactionRank,
  IntelReportWithFreshness, getIntelFreshness, getDecayedSignalQuality, applyIntelDecay,
  SeasonScore, calculateSeasonScore
} from '../core/types.js';

export class TursoDatabase {
  private client: Client;

  constructor(url?: string, authToken?: string) {
    // Use environment variables or fall back to local file for dev
    this.client = createClient({
      url: url || process.env.TURSO_DATABASE_URL || 'file:local.db',
      authToken: authToken || process.env.TURSO_AUTH_TOKEN,
    });
  }

  async initialize(): Promise<void> {
    await this.initSchema();
  }

  // ============================================================================
  // TRANSACTION SUPPORT
  // ============================================================================

  /**
   * Execute multiple statements in a single transaction.
   * All statements succeed or all fail.
   */
  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const statements: InStatement[] = [];
    const ctx = new TransactionContext(statements);

    // Collect all statements
    const result = await fn(ctx);

    // Execute as batch with write mode (transaction)
    if (statements.length > 0) {
      await this.client.batch(statements, 'write');
    }

    return result;
  }

  /**
   * Execute a batch of independent statements efficiently.
   * Not a transaction - some may succeed while others fail.
   */
  async batch(statements: InStatement[]): Promise<void> {
    if (statements.length > 0) {
      await this.client.batch(statements);
    }
  }

  private async initSchema(): Promise<void> {
    const statements: string[] = [
      // World state
      `CREATE TABLE IF NOT EXISTS world (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        current_tick INTEGER NOT NULL DEFAULT 0,
        season_number INTEGER NOT NULL DEFAULT 1,
        season_week INTEGER NOT NULL DEFAULT 1
      )`,

      // Zones
      `CREATE TABLE IF NOT EXISTS zones (
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
        market_depth REAL NOT NULL DEFAULT 1.0,
        medkit_stockpile INTEGER NOT NULL DEFAULT 0,
        comms_stockpile INTEGER NOT NULL DEFAULT 0
      )`,

      // Routes
      `CREATE TABLE IF NOT EXISTS routes (
        id TEXT PRIMARY KEY,
        from_zone_id TEXT NOT NULL,
        to_zone_id TEXT NOT NULL,
        distance INTEGER NOT NULL,
        capacity INTEGER NOT NULL,
        base_risk REAL NOT NULL,
        chokepoint_rating REAL NOT NULL DEFAULT 1.0,
        FOREIGN KEY (from_zone_id) REFERENCES zones(id),
        FOREIGN KEY (to_zone_id) REFERENCES zones(id)
      )`,

      // Players
      `CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        api_key TEXT UNIQUE,
        tier TEXT NOT NULL DEFAULT 'freelance',
        inventory TEXT NOT NULL DEFAULT '{}',
        location_id TEXT NOT NULL,
        faction_id TEXT,
        reputation INTEGER NOT NULL DEFAULT 0,
        actions_today INTEGER NOT NULL DEFAULT 0,
        last_action_tick INTEGER NOT NULL DEFAULT 0,
        licenses TEXT NOT NULL DEFAULT '{"courier":true,"freight":false,"convoy":false}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (location_id) REFERENCES zones(id),
        FOREIGN KEY (faction_id) REFERENCES factions(id)
      )`,

      // Factions
      `CREATE TABLE IF NOT EXISTS factions (
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
      )`,

      // Faction members
      `CREATE TABLE IF NOT EXISTS faction_members (
        faction_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        rank TEXT NOT NULL DEFAULT 'member',
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (faction_id, player_id),
        FOREIGN KEY (faction_id) REFERENCES factions(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      )`,

      // Shipments
      `CREATE TABLE IF NOT EXISTS shipments (
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
      )`,

      // Units
      `CREATE TABLE IF NOT EXISTS units (
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
      )`,

      // Market orders
      `CREATE TABLE IF NOT EXISTS market_orders (
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
      )`,

      // Trades
      `CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        zone_id TEXT NOT NULL,
        resource TEXT NOT NULL,
        buyer_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        executed_at INTEGER NOT NULL,
        FOREIGN KEY (zone_id) REFERENCES zones(id)
      )`,

      // Contracts
      `CREATE TABLE IF NOT EXISTS contracts (
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
      )`,

      // Intel reports
      `CREATE TABLE IF NOT EXISTS intel (
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
      )`,

      // Game events
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        tick INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        actor_id TEXT,
        actor_type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Season scores
      `CREATE TABLE IF NOT EXISTS season_scores (
        id TEXT PRIMARY KEY,
        season_number INTEGER NOT NULL,
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_name TEXT NOT NULL,
        zones_controlled INTEGER NOT NULL DEFAULT 0,
        supply_delivered INTEGER NOT NULL DEFAULT 0,
        shipments_completed INTEGER NOT NULL DEFAULT 0,
        contracts_completed INTEGER NOT NULL DEFAULT 0,
        reputation_gained INTEGER NOT NULL DEFAULT 0,
        combat_victories INTEGER NOT NULL DEFAULT 0,
        total_score INTEGER NOT NULL DEFAULT 0,
        UNIQUE(season_number, entity_id)
      )`,

      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick)`,
      `CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`,
      `CREATE INDEX IF NOT EXISTS idx_events_actor ON events(actor_id)`,
      `CREATE INDEX IF NOT EXISTS idx_intel_faction ON intel(faction_id)`,
      `CREATE INDEX IF NOT EXISTS idx_players_api_key ON players(api_key)`,
      `CREATE INDEX IF NOT EXISTS idx_season_scores_season ON season_scores(season_number)`,
      `CREATE INDEX IF NOT EXISTS idx_season_scores_total ON season_scores(total_score DESC)`,

      // Initialize world state
      `INSERT OR IGNORE INTO world (id, current_tick, season_number, season_week) VALUES (1, 0, 1, 1)`,
    ];

    for (const sql of statements) {
      await this.client.execute(sql);
    }
  }

  // ============================================================================
  // WORLD STATE
  // ============================================================================

  async getCurrentTick(): Promise<number> {
    const result = await this.client.execute('SELECT current_tick FROM world WHERE id = 1');
    return (result.rows[0]?.current_tick as number) || 0;
  }

  async incrementTick(): Promise<number> {
    await this.client.execute('UPDATE world SET current_tick = current_tick + 1 WHERE id = 1');
    return this.getCurrentTick();
  }

  async getSeasonInfo(): Promise<{ seasonNumber: number; seasonWeek: number }> {
    const result = await this.client.execute('SELECT season_number, season_week FROM world WHERE id = 1');
    const row = result.rows[0];
    return {
      seasonNumber: (row?.season_number as number) || 1,
      seasonWeek: (row?.season_week as number) || 1
    };
  }

  // ============================================================================
  // ZONES
  // ============================================================================

  async createZone(zone: Omit<Zone, 'id'>): Promise<Zone> {
    const id = uuid();
    await this.client.execute({
      sql: `INSERT INTO zones (id, name, type, owner_id, supply_level, burn_rate, compliance_streak,
                               su_stockpile, inventory, production_capacity, garrison_level, market_depth,
                               medkit_stockpile, comms_stockpile)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, zone.name, zone.type, zone.ownerId, zone.supplyLevel, zone.burnRate,
             zone.complianceStreak, zone.suStockpile, JSON.stringify(zone.inventory),
             zone.productionCapacity, zone.garrisonLevel, zone.marketDepth,
             zone.medkitStockpile, zone.commsStockpile]
    });
    return { id, ...zone };
  }

  async getZone(id: string): Promise<Zone | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM zones WHERE id = ?',
      args: [id]
    });
    if (result.rows.length === 0) return null;
    return this.rowToZone(result.rows[0]);
  }

  async getAllZones(): Promise<Zone[]> {
    const result = await this.client.execute('SELECT * FROM zones');
    return result.rows.map(row => this.rowToZone(row));
  }

  async updateZone(id: string, updates: Partial<Zone>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.ownerId !== undefined) { sets.push('owner_id = ?'); values.push(updates.ownerId); }
    if (updates.supplyLevel !== undefined) { sets.push('supply_level = ?'); values.push(updates.supplyLevel); }
    if (updates.complianceStreak !== undefined) { sets.push('compliance_streak = ?'); values.push(updates.complianceStreak); }
    if (updates.suStockpile !== undefined) { sets.push('su_stockpile = ?'); values.push(updates.suStockpile); }
    if (updates.inventory !== undefined) { sets.push('inventory = ?'); values.push(JSON.stringify(updates.inventory)); }
    if (updates.garrisonLevel !== undefined) { sets.push('garrison_level = ?'); values.push(updates.garrisonLevel); }
    if (updates.medkitStockpile !== undefined) { sets.push('medkit_stockpile = ?'); values.push(updates.medkitStockpile); }
    if (updates.commsStockpile !== undefined) { sets.push('comms_stockpile = ?'); values.push(updates.commsStockpile); }

    if (sets.length === 0) return;
    values.push(id);
    await this.client.execute({
      sql: `UPDATE zones SET ${sets.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  private rowToZone(row: any): Zone {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as ZoneType,
      ownerId: row.owner_id as string | null,
      supplyLevel: row.supply_level as number,
      burnRate: row.burn_rate as number,
      complianceStreak: row.compliance_streak as number,
      suStockpile: row.su_stockpile as number,
      inventory: JSON.parse(row.inventory as string),
      productionCapacity: row.production_capacity as number,
      garrisonLevel: row.garrison_level as number,
      marketDepth: row.market_depth as number,
      medkitStockpile: (row.medkit_stockpile as number) || 0,
      commsStockpile: (row.comms_stockpile as number) || 0
    };
  }

  // ============================================================================
  // ROUTES
  // ============================================================================

  async createRoute(route: Omit<Route, 'id'>): Promise<Route> {
    const id = uuid();
    await this.client.execute({
      sql: `INSERT INTO routes (id, from_zone_id, to_zone_id, distance, capacity, base_risk, chokepoint_rating)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, route.fromZoneId, route.toZoneId, route.distance, route.capacity, route.baseRisk, route.chokepointRating]
    });
    return { id, ...route };
  }

  async getRoute(id: string): Promise<Route | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM routes WHERE id = ?',
      args: [id]
    });
    if (result.rows.length === 0) return null;
    return this.rowToRoute(result.rows[0]);
  }

  async getRoutesBetween(fromZoneId: string, toZoneId: string): Promise<Route[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM routes WHERE from_zone_id = ? AND to_zone_id = ?',
      args: [fromZoneId, toZoneId]
    });
    return result.rows.map(row => this.rowToRoute(row));
  }

  async getRoutesFromZone(zoneId: string): Promise<Route[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM routes WHERE from_zone_id = ?',
      args: [zoneId]
    });
    return result.rows.map(row => this.rowToRoute(row));
  }

  async getAllRoutes(): Promise<Route[]> {
    const result = await this.client.execute('SELECT * FROM routes');
    return result.rows.map(row => this.rowToRoute(row));
  }

  private rowToRoute(row: any): Route {
    return {
      id: row.id as string,
      fromZoneId: row.from_zone_id as string,
      toZoneId: row.to_zone_id as string,
      distance: row.distance as number,
      capacity: row.capacity as number,
      baseRisk: row.base_risk as number,
      chokepointRating: row.chokepoint_rating as number
    };
  }

  // ============================================================================
  // PLAYERS
  // ============================================================================

  async createPlayer(name: string, startingZoneId: string): Promise<Player & { apiKey: string }> {
    const id = uuid();
    const apiKey = `br_${uuid().replace(/-/g, '')}`;
    const inventory = { ...emptyInventory(), credits: 500 };
    const licenses = { courier: true, freight: false, convoy: false };

    await this.client.execute({
      sql: `INSERT INTO players (id, name, api_key, tier, inventory, location_id, reputation, licenses)
            VALUES (?, ?, ?, 'freelance', ?, ?, 0, ?)`,
      args: [id, name, apiKey, JSON.stringify(inventory), startingZoneId, JSON.stringify(licenses)]
    });

    return {
      id, name, tier: 'freelance', inventory, locationId: startingZoneId,
      factionId: null, reputation: 0, actionsToday: 0, lastActionTick: 0, licenses,
      apiKey
    };
  }

  async getPlayer(id: string): Promise<Player | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM players WHERE id = ?',
      args: [id]
    });
    if (result.rows.length === 0) return null;
    return this.rowToPlayer(result.rows[0]);
  }

  async getPlayerByApiKey(apiKey: string): Promise<Player | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM players WHERE api_key = ?',
      args: [apiKey]
    });
    if (result.rows.length === 0) return null;
    return this.rowToPlayer(result.rows[0]);
  }

  async getPlayerByName(name: string): Promise<Player | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM players WHERE name = ?',
      args: [name]
    });
    if (result.rows.length === 0) return null;
    return this.rowToPlayer(result.rows[0]);
  }

  async getAllPlayers(): Promise<Player[]> {
    const result = await this.client.execute('SELECT * FROM players');
    return result.rows.map(row => this.rowToPlayer(row));
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<void> {
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
    await this.client.execute({
      sql: `UPDATE players SET ${sets.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  private rowToPlayer(row: any): Player {
    return {
      id: row.id as string,
      name: row.name as string,
      tier: row.tier as SubscriptionTier,
      inventory: JSON.parse(row.inventory as string),
      locationId: row.location_id as string,
      factionId: row.faction_id as string | null,
      reputation: row.reputation as number,
      actionsToday: row.actions_today as number,
      lastActionTick: row.last_action_tick as number,
      licenses: JSON.parse(row.licenses as string)
    };
  }

  // ============================================================================
  // FACTIONS
  // ============================================================================

  async createFaction(name: string, tag: string, founderId: string): Promise<Faction> {
    const id = uuid();
    const treasury = emptyInventory();
    const upgrades = {
      relayNetwork: 0,
      routeFortification: 0,
      productionBonus: 0,
      garrisonStrength: 0,
      marketDepth: 0
    };
    const tick = await this.getCurrentTick();

    await this.client.execute({
      sql: `INSERT INTO factions (id, name, tag, founder_id, treasury, upgrades, relations)
            VALUES (?, ?, ?, ?, ?, ?, '{}')`,
      args: [id, name, tag, founderId, JSON.stringify(treasury), JSON.stringify(upgrades)]
    });

    await this.client.execute({
      sql: `INSERT INTO faction_members (faction_id, player_id, rank, joined_at) VALUES (?, ?, 'founder', ?)`,
      args: [id, founderId, tick]
    });

    await this.updatePlayer(founderId, { factionId: id });

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

  async getFaction(id: string): Promise<Faction | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM factions WHERE id = ?',
      args: [id]
    });
    if (result.rows.length === 0) return null;
    return this.rowToFaction(result.rows[0]);
  }

  async getAllFactions(): Promise<Faction[]> {
    const result = await this.client.execute('SELECT * FROM factions');
    const factions: Faction[] = [];
    for (const row of result.rows) {
      factions.push(await this.rowToFaction(row));
    }
    return factions;
  }

  private async rowToFaction(row: any): Promise<Faction> {
    const membersResult = await this.client.execute({
      sql: 'SELECT player_id, rank, joined_at FROM faction_members WHERE faction_id = ?',
      args: [row.id]
    });

    const zonesResult = await this.client.execute({
      sql: 'SELECT id FROM zones WHERE owner_id = ?',
      args: [row.id]
    });

    return {
      id: row.id as string,
      name: row.name as string,
      tag: row.tag as string,
      founderId: row.founder_id as string,
      treasury: JSON.parse(row.treasury as string),
      officerWithdrawLimit: row.officer_withdraw_limit as number,
      members: membersResult.rows.map(m => ({
        playerId: m.player_id as string,
        rank: m.rank as FactionRank,
        joinedAt: m.joined_at as number
      })),
      controlledZones: zonesResult.rows.map(z => z.id as string),
      doctrineHash: row.doctrine_hash as string | null,
      upgrades: JSON.parse(row.upgrades as string),
      relations: JSON.parse(row.relations as string)
    };
  }

  async addFactionMember(factionId: string, playerId: string, rank: FactionRank = 'member'): Promise<void> {
    const tick = await this.getCurrentTick();
    await this.client.execute({
      sql: `INSERT INTO faction_members (faction_id, player_id, rank, joined_at) VALUES (?, ?, ?, ?)`,
      args: [factionId, playerId, rank, tick]
    });
    await this.updatePlayer(playerId, { factionId });
  }

  async removeFactionMember(factionId: string, playerId: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM faction_members WHERE faction_id = ? AND player_id = ?',
      args: [factionId, playerId]
    });
    await this.updatePlayer(playerId, { factionId: null });
  }

  // ============================================================================
  // SHIPMENTS
  // ============================================================================

  async createShipment(shipment: Omit<Shipment, 'id'>): Promise<Shipment> {
    const id = uuid();
    await this.client.execute({
      sql: `INSERT INTO shipments (id, player_id, type, path, current_position, ticks_to_next_zone,
                                   cargo, escort_ids, created_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, shipment.playerId, shipment.type, JSON.stringify(shipment.path),
             shipment.currentPosition, shipment.ticksToNextZone, JSON.stringify(shipment.cargo),
             JSON.stringify(shipment.escortIds), shipment.createdAt, shipment.status]
    });
    return { id, ...shipment };
  }

  async getShipment(id: string): Promise<Shipment | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM shipments WHERE id = ?',
      args: [id]
    });
    if (result.rows.length === 0) return null;
    return this.rowToShipment(result.rows[0]);
  }

  async getActiveShipments(): Promise<Shipment[]> {
    const result = await this.client.execute("SELECT * FROM shipments WHERE status = 'in_transit'");
    return result.rows.map(row => this.rowToShipment(row));
  }

  async getPlayerShipments(playerId: string): Promise<Shipment[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM shipments WHERE player_id = ?',
      args: [playerId]
    });
    return result.rows.map(row => this.rowToShipment(row));
  }

  async updateShipment(id: string, updates: Partial<Shipment>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.currentPosition !== undefined) { sets.push('current_position = ?'); values.push(updates.currentPosition); }
    if (updates.ticksToNextZone !== undefined) { sets.push('ticks_to_next_zone = ?'); values.push(updates.ticksToNextZone); }
    if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.escortIds !== undefined) { sets.push('escort_ids = ?'); values.push(JSON.stringify(updates.escortIds)); }

    if (sets.length === 0) return;
    values.push(id);
    await this.client.execute({
      sql: `UPDATE shipments SET ${sets.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  private rowToShipment(row: any): Shipment {
    return {
      id: row.id as string,
      playerId: row.player_id as string,
      type: row.type as any,
      path: JSON.parse(row.path as string),
      currentPosition: row.current_position as number,
      ticksToNextZone: row.ticks_to_next_zone as number,
      cargo: JSON.parse(row.cargo as string),
      escortIds: JSON.parse(row.escort_ids as string),
      createdAt: row.created_at as number,
      status: row.status as any
    };
  }

  // ============================================================================
  // UNITS
  // ============================================================================

  async createUnit(unit: Omit<Unit, 'id'>): Promise<Unit> {
    const id = uuid();
    await this.client.execute({
      sql: `INSERT INTO units (id, player_id, type, location_id, strength, speed, maintenance, assignment_id, for_sale_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, unit.playerId, unit.type, unit.locationId, unit.strength, unit.speed, unit.maintenance, unit.assignmentId, unit.forSalePrice]
    });
    return { id, ...unit };
  }

  async getUnit(id: string): Promise<Unit | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM units WHERE id = ?',
      args: [id]
    });
    if (result.rows.length === 0) return null;
    return this.rowToUnit(result.rows[0]);
  }

  async getPlayerUnits(playerId: string): Promise<Unit[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM units WHERE player_id = ?',
      args: [playerId]
    });
    return result.rows.map(row => this.rowToUnit(row));
  }

  async getUnitsForSaleAtZone(zoneId: string): Promise<Unit[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM units WHERE location_id = ? AND for_sale_price IS NOT NULL',
      args: [zoneId]
    });
    return result.rows.map(row => this.rowToUnit(row));
  }

  async updateUnit(id: string, updates: Partial<Unit>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.locationId !== undefined) { sets.push('location_id = ?'); values.push(updates.locationId); }
    if (updates.assignmentId !== undefined) { sets.push('assignment_id = ?'); values.push(updates.assignmentId); }
    if (updates.playerId !== undefined) { sets.push('player_id = ?'); values.push(updates.playerId); }
    if (updates.forSalePrice !== undefined) { sets.push('for_sale_price = ?'); values.push(updates.forSalePrice); }

    if (sets.length === 0) return;
    values.push(id);
    await this.client.execute({
      sql: `UPDATE units SET ${sets.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  async deleteUnit(id: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM units WHERE id = ?',
      args: [id]
    });
  }

  private rowToUnit(row: any): Unit {
    return {
      id: row.id as string,
      playerId: row.player_id as string,
      type: row.type as any,
      locationId: row.location_id as string,
      strength: row.strength as number,
      speed: row.speed as number,
      maintenance: row.maintenance as number,
      assignmentId: row.assignment_id as string | null,
      forSalePrice: row.for_sale_price as number | null
    };
  }

  // ============================================================================
  // MARKET ORDERS
  // ============================================================================

  async createOrder(order: Omit<MarketOrder, 'id'>): Promise<MarketOrder> {
    const id = uuid();
    await this.client.execute({
      sql: `INSERT INTO market_orders (id, player_id, zone_id, resource, side, price, quantity, original_quantity, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, order.playerId, order.zoneId, order.resource, order.side, order.price, order.quantity, order.originalQuantity, order.createdAt]
    });
    return { id, ...order };
  }

  async getOrdersForZone(zoneId: string, resource?: string): Promise<MarketOrder[]> {
    let sql = 'SELECT * FROM market_orders WHERE zone_id = ? AND quantity > 0';
    const args: any[] = [zoneId];
    if (resource) {
      sql += ' AND resource = ?';
      args.push(resource);
    }
    sql += ' ORDER BY side, price';
    const result = await this.client.execute({ sql, args });
    return result.rows.map(row => this.rowToOrder(row));
  }

  async updateOrder(id: string, quantity: number): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE market_orders SET quantity = ? WHERE id = ?',
      args: [quantity, id]
    });
  }

  private rowToOrder(row: any): MarketOrder {
    return {
      id: row.id as string,
      playerId: row.player_id as string,
      zoneId: row.zone_id as string,
      resource: row.resource as any,
      side: row.side as any,
      price: row.price as number,
      quantity: row.quantity as number,
      originalQuantity: row.original_quantity as number,
      createdAt: row.created_at as number
    };
  }

  // ============================================================================
  // CONTRACTS
  // ============================================================================

  async createContract(contract: Omit<Contract, 'id'>): Promise<Contract> {
    const id = uuid();
    await this.client.execute({
      sql: `INSERT INTO contracts (id, type, poster_id, poster_type, accepted_by, details, deadline, reward, bonus, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, contract.type, contract.posterId, contract.posterType, contract.acceptedBy,
             JSON.stringify(contract.details), contract.deadline, JSON.stringify(contract.reward),
             contract.bonus ? JSON.stringify(contract.bonus) : null, contract.status, contract.createdAt]
    });
    return { id, ...contract };
  }

  async getOpenContracts(): Promise<Contract[]> {
    const result = await this.client.execute("SELECT * FROM contracts WHERE status = 'open' ORDER BY created_at DESC");
    return result.rows.map(row => this.rowToContract(row));
  }

  async updateContract(id: string, updates: { status?: string; acceptedBy?: string }): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];
    if (updates.status) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.acceptedBy) { sets.push('accepted_by = ?'); values.push(updates.acceptedBy); }
    if (sets.length === 0) return;
    values.push(id);
    await this.client.execute({
      sql: `UPDATE contracts SET ${sets.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  private rowToContract(row: any): Contract {
    return {
      id: row.id as string,
      type: row.type as any,
      posterId: row.poster_id as string,
      posterType: row.poster_type as any,
      acceptedBy: row.accepted_by as string | null,
      details: JSON.parse(row.details as string),
      deadline: row.deadline as number,
      reward: JSON.parse(row.reward as string),
      bonus: row.bonus ? JSON.parse(row.bonus as string) : undefined,
      status: row.status as any,
      createdAt: row.created_at as number
    };
  }

  // ============================================================================
  // INTEL
  // ============================================================================

  async createIntel(intel: Omit<IntelReport, 'id'>): Promise<IntelReport> {
    const id = uuid();
    await this.client.execute({
      sql: `INSERT INTO intel (id, player_id, faction_id, target_type, target_id, gathered_at, data, signal_quality)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, intel.playerId, intel.factionId, intel.targetType, intel.targetId, intel.gatheredAt, JSON.stringify(intel.data), intel.signalQuality]
    });
    return { id, ...intel };
  }

  async getFactionIntel(factionId: string, limit: number = 100): Promise<IntelReport[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM intel WHERE faction_id = ? ORDER BY gathered_at DESC LIMIT ?',
      args: [factionId, limit]
    });
    return result.rows.map(row => this.rowToIntel(row));
  }

  private rowToIntel(row: any): IntelReport {
    return {
      id: row.id as string,
      playerId: row.player_id as string,
      factionId: row.faction_id as string | null,
      targetType: row.target_type as any,
      targetId: row.target_id as string,
      gatheredAt: row.gathered_at as number,
      data: JSON.parse(row.data as string),
      signalQuality: row.signal_quality as number
    };
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  async recordEvent(event: Omit<GameEvent, 'id'>): Promise<GameEvent> {
    const id = uuid();
    await this.client.execute({
      sql: `INSERT INTO events (id, type, tick, timestamp, actor_id, actor_type, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [id, event.type, event.tick, event.timestamp.toISOString(), event.actorId, event.actorType, JSON.stringify(event.data)]
    });
    return { id, ...event };
  }

  async getEvents(options: { limit?: number; type?: string; actorId?: string } = {}): Promise<GameEvent[]> {
    let sql = 'SELECT * FROM events WHERE 1=1';
    const args: any[] = [];

    if (options.type) { sql += ' AND type = ?'; args.push(options.type); }
    if (options.actorId) { sql += ' AND actor_id = ?'; args.push(options.actorId); }

    sql += ' ORDER BY tick DESC, created_at DESC';
    if (options.limit) { sql += ' LIMIT ?'; args.push(options.limit); }

    const result = await this.client.execute({ sql, args });
    return result.rows.map(row => ({
      id: row.id as string,
      type: row.type as any,
      tick: row.tick as number,
      timestamp: new Date(row.timestamp as string),
      actorId: row.actor_id as string | null,
      actorType: row.actor_type as any,
      data: JSON.parse(row.data as string)
    }));
  }

  // ============================================================================
  // PLAYER INTEL (with freshness)
  // ============================================================================

  async getPlayerIntel(playerId: string, limit: number = 100): Promise<IntelReport[]> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM intel WHERE player_id = ? ORDER BY gathered_at DESC LIMIT ?',
      args: [playerId, limit]
    });
    return result.rows.map(row => this.rowToIntel(row));
  }

  /**
   * Get player intel with freshness calculation and data decay applied.
   * This is the recommended method for retrieving intel for display.
   */
  async getPlayerIntelWithFreshness(playerId: string, limit: number = 100): Promise<IntelReportWithFreshness[]> {
    const currentTick = await this.getCurrentTick();
    const rawIntel = await this.getPlayerIntel(playerId, limit);
    return rawIntel.map(intel => this.applyFreshnessToIntel(intel, currentTick));
  }

  /**
   * Get faction intel with freshness calculation and data decay applied.
   */
  async getFactionIntelWithFreshness(factionId: string, limit: number = 100): Promise<IntelReportWithFreshness[]> {
    const currentTick = await this.getCurrentTick();
    const rawIntel = await this.getFactionIntel(factionId, limit);
    return rawIntel.map(intel => this.applyFreshnessToIntel(intel, currentTick));
  }

  /**
   * Get the most recent intel on a specific target (zone or route).
   * Returns intel with freshness applied.
   */
  async getTargetIntel(
    playerId: string,
    factionId: string | null,
    targetType: 'zone' | 'route',
    targetId: string
  ): Promise<IntelReportWithFreshness | null> {
    const currentTick = await this.getCurrentTick();

    // First try player's own intel
    let result = await this.client.execute({
      sql: `SELECT * FROM intel
            WHERE player_id = ? AND target_type = ? AND target_id = ?
            ORDER BY gathered_at DESC LIMIT 1`,
      args: [playerId, targetType, targetId]
    });

    // If not found and player has a faction, try faction intel
    if (result.rows.length === 0 && factionId) {
      result = await this.client.execute({
        sql: `SELECT * FROM intel
              WHERE faction_id = ? AND target_type = ? AND target_id = ?
              ORDER BY gathered_at DESC LIMIT 1`,
        args: [factionId, targetType, targetId]
      });
    }

    if (result.rows.length === 0) return null;
    return this.applyFreshnessToIntel(this.rowToIntel(result.rows[0]), currentTick);
  }

  /**
   * Delete expired intel older than a threshold to keep database clean.
   * Called periodically during tick processing.
   */
  async cleanupExpiredIntel(maxAgeTicks: number = 200): Promise<number> {
    const currentTick = await this.getCurrentTick();
    const threshold = currentTick - maxAgeTicks;

    const result = await this.client.execute({
      sql: 'DELETE FROM intel WHERE gathered_at < ?',
      args: [threshold]
    });

    return result.rowsAffected;
  }

  /**
   * Apply freshness calculation to raw intel data
   */
  private applyFreshnessToIntel(intel: IntelReport, currentTick: number): IntelReportWithFreshness {
    const ageInTicks = currentTick - intel.gatheredAt;
    const freshness = getIntelFreshness(intel.gatheredAt, currentTick);
    const effectiveSignalQuality = getDecayedSignalQuality(intel.signalQuality, intel.gatheredAt, currentTick);
    const decayedData = applyIntelDecay(intel.data, freshness);

    return {
      ...intel,
      data: decayedData,
      freshness,
      effectiveSignalQuality,
      ageInTicks
    };
  }

  // ============================================================================
  // CONTRACT QUERIES
  // ============================================================================

  async getContract(id: string): Promise<Contract | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM contracts WHERE id = ?',
      args: [id]
    });
    if (result.rows.length === 0) return null;
    return this.rowToContract(result.rows[0]);
  }

  async getContractsAtZone(zoneId: string): Promise<Contract[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM contracts
            WHERE status = 'open'
            AND (json_extract(details, '$.fromZoneId') = ? OR json_extract(details, '$.toZoneId') = ?)
            ORDER BY created_at DESC`,
      args: [zoneId, zoneId]
    });
    return result.rows.map(row => this.rowToContract(row));
  }

  async getPlayerContracts(playerId: string): Promise<Contract[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM contracts WHERE poster_id = ? OR accepted_by = ? ORDER BY created_at DESC`,
      args: [playerId, playerId]
    });
    return result.rows.map(row => this.rowToContract(row));
  }

  // ============================================================================
  // FACTION MEMBER RANK
  // ============================================================================

  async getFactionMemberRank(factionId: string, playerId: string): Promise<FactionRank | null> {
    const result = await this.client.execute({
      sql: 'SELECT rank FROM faction_members WHERE faction_id = ? AND player_id = ?',
      args: [factionId, playerId]
    });
    if (result.rows.length === 0) return null;
    return result.rows[0].rank as FactionRank;
  }

  async updateFactionMemberRank(factionId: string, playerId: string, rank: FactionRank): Promise<void> {
    await this.client.execute({
      sql: 'UPDATE faction_members SET rank = ? WHERE faction_id = ? AND player_id = ?',
      args: [rank, factionId, playerId]
    });
  }

  // ============================================================================
  // FACTION UPDATES
  // ============================================================================

  async updateFaction(id: string, updates: Partial<{
    founderId: string;
    treasury: Inventory;
    officerWithdrawLimit: number;
    doctrineHash: string | null;
    upgrades: Faction['upgrades'];
    relations: Record<string, 'allied' | 'neutral' | 'war'>;
  }>): Promise<void> {
    const sets: string[] = [];
    const values: any[] = [];

    if (updates.founderId !== undefined) { sets.push('founder_id = ?'); values.push(updates.founderId); }
    if (updates.treasury !== undefined) { sets.push('treasury = ?'); values.push(JSON.stringify(updates.treasury)); }
    if (updates.officerWithdrawLimit !== undefined) { sets.push('officer_withdraw_limit = ?'); values.push(updates.officerWithdrawLimit); }
    if (updates.doctrineHash !== undefined) { sets.push('doctrine_hash = ?'); values.push(updates.doctrineHash); }
    if (updates.upgrades !== undefined) { sets.push('upgrades = ?'); values.push(JSON.stringify(updates.upgrades)); }
    if (updates.relations !== undefined) { sets.push('relations = ?'); values.push(JSON.stringify(updates.relations)); }

    if (sets.length === 0) return;
    values.push(id);
    await this.client.execute({
      sql: `UPDATE factions SET ${sets.join(', ')} WHERE id = ?`,
      args: values
    });
  }

  // ============================================================================
  // SEASON SCORES
  // ============================================================================

  async getOrCreateSeasonScore(
    seasonNumber: number,
    entityId: string,
    entityType: 'player' | 'faction',
    entityName: string
  ): Promise<SeasonScore> {
    // Try to get existing
    const result = await this.client.execute({
      sql: 'SELECT * FROM season_scores WHERE season_number = ? AND entity_id = ?',
      args: [seasonNumber, entityId]
    });

    if (result.rows.length > 0) {
      return this.rowToSeasonScore(result.rows[0]);
    }

    // Create new
    const id = uuid();
    await this.client.execute({
      sql: `INSERT INTO season_scores (id, season_number, entity_id, entity_type, entity_name,
            zones_controlled, supply_delivered, shipments_completed, contracts_completed,
            reputation_gained, combat_victories, total_score)
            VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0)`,
      args: [id, seasonNumber, entityId, entityType, entityName]
    });

    return {
      id,
      seasonNumber,
      entityId,
      entityType,
      entityName,
      zonesControlled: 0,
      supplyDelivered: 0,
      shipmentsCompleted: 0,
      contractsCompleted: 0,
      reputationGained: 0,
      combatVictories: 0,
      totalScore: 0
    };
  }

  async incrementSeasonScore(
    seasonNumber: number,
    entityId: string,
    entityType: 'player' | 'faction',
    entityName: string,
    field: 'supplyDelivered' | 'shipmentsCompleted' | 'contractsCompleted' | 'reputationGained' | 'combatVictories',
    amount: number
  ): Promise<void> {
    // Ensure record exists
    await this.getOrCreateSeasonScore(seasonNumber, entityId, entityType, entityName);

    const fieldMap: Record<string, string> = {
      supplyDelivered: 'supply_delivered',
      shipmentsCompleted: 'shipments_completed',
      contractsCompleted: 'contracts_completed',
      reputationGained: 'reputation_gained',
      combatVictories: 'combat_victories'
    };

    const dbField = fieldMap[field];

    // Increment the field and recalculate total
    await this.client.execute({
      sql: `UPDATE season_scores
            SET ${dbField} = ${dbField} + ?,
                total_score = (zones_controlled * 100 + supply_delivered * 1 + shipments_completed * 10 +
                              contracts_completed * 25 + reputation_gained * 2 + combat_victories * 50)
            WHERE season_number = ? AND entity_id = ?`,
      args: [amount, seasonNumber, entityId]
    });
  }

  async updateSeasonZoneScores(seasonNumber: number): Promise<void> {
    // Get all factions and their controlled zone counts
    const factions = await this.getAllFactions();

    for (const faction of factions) {
      const zoneCount = faction.controlledZones.length;

      // Update or create score record
      await this.getOrCreateSeasonScore(seasonNumber, faction.id, 'faction', faction.name);

      await this.client.execute({
        sql: `UPDATE season_scores
              SET zones_controlled = ?,
                  total_score = (? * 100 + supply_delivered * 1 + shipments_completed * 10 +
                                contracts_completed * 25 + reputation_gained * 2 + combat_victories * 50)
              WHERE season_number = ? AND entity_id = ?`,
        args: [zoneCount, zoneCount, seasonNumber, faction.id]
      });
    }
  }

  async getSeasonLeaderboard(
    seasonNumber: number,
    entityType?: 'player' | 'faction',
    limit: number = 50
  ): Promise<SeasonScore[]> {
    let sql = 'SELECT * FROM season_scores WHERE season_number = ?';
    const args: any[] = [seasonNumber];

    if (entityType) {
      sql += ' AND entity_type = ?';
      args.push(entityType);
    }

    sql += ' ORDER BY total_score DESC LIMIT ?';
    args.push(limit);

    const result = await this.client.execute({ sql, args });
    return result.rows.map((row, index) => ({
      ...this.rowToSeasonScore(row),
      rank: index + 1
    }));
  }

  async getEntitySeasonScore(seasonNumber: number, entityId: string): Promise<SeasonScore | null> {
    const result = await this.client.execute({
      sql: 'SELECT * FROM season_scores WHERE season_number = ? AND entity_id = ?',
      args: [seasonNumber, entityId]
    });

    if (result.rows.length === 0) return null;
    return this.rowToSeasonScore(result.rows[0]);
  }

  async advanceSeason(): Promise<{ newSeason: number; newWeek: number }> {
    const season = await this.getSeasonInfo();
    const newSeason = season.seasonNumber + 1;

    await this.client.execute({
      sql: 'UPDATE world SET season_number = ?, season_week = 1 WHERE id = 1',
      args: [newSeason]
    });

    return { newSeason, newWeek: 1 };
  }

  async advanceWeek(): Promise<{ seasonNumber: number; newWeek: number }> {
    const season = await this.getSeasonInfo();
    const newWeek = season.seasonWeek + 1;

    await this.client.execute({
      sql: 'UPDATE world SET season_week = ? WHERE id = 1',
      args: [newWeek]
    });

    return { seasonNumber: season.seasonNumber, newWeek };
  }

  /**
   * Reset the game world for a new season.
   * Archives scores, resets zones/inventories, preserves accounts/licenses/factions.
   */
  async seasonReset(newSeasonNumber: number): Promise<void> {
    // Reset all zones to neutral defaults
    await this.client.execute(
      `UPDATE zones SET owner_id = NULL, supply_level = 100, compliance_streak = 0,
       su_stockpile = 0, inventory = '{}', garrison_level = 0,
       medkit_stockpile = 0, comms_stockpile = 0`
    );

    // Reset player inventories/credits, preserve accounts/licenses/factions
    const startingInventory = JSON.stringify({ ...emptyInventory(), credits: 500 });
    await this.client.execute({
      sql: `UPDATE players SET inventory = ?, actions_today = 0, last_action_tick = 0,
            reputation = CAST(reputation * 0.5 AS INTEGER)`,
      args: [startingInventory]
    });

    // Clear all active shipments
    await this.client.execute(`DELETE FROM shipments`);

    // Clear all units
    await this.client.execute(`DELETE FROM units`);

    // Clear all market orders
    await this.client.execute(`DELETE FROM market_orders`);

    // Clear all active contracts
    await this.client.execute(`DELETE FROM contracts WHERE status IN ('open', 'accepted')`);

    // Clear all intel
    await this.client.execute(`DELETE FROM intel`);

    // Reset faction treasuries
    const emptyTreasury = JSON.stringify(emptyInventory());
    await this.client.execute({
      sql: `UPDATE factions SET treasury = ?`,
      args: [emptyTreasury]
    });

    // Advance to new season
    await this.client.execute({
      sql: 'UPDATE world SET season_number = ?, season_week = 1 WHERE id = 1',
      args: [newSeasonNumber]
    });
  }

  private rowToSeasonScore(row: any): SeasonScore {
    return {
      id: row.id as string,
      seasonNumber: row.season_number as number,
      entityId: row.entity_id as string,
      entityType: row.entity_type as 'player' | 'faction',
      entityName: row.entity_name as string,
      zonesControlled: row.zones_controlled as number,
      supplyDelivered: row.supply_delivered as number,
      shipmentsCompleted: row.shipments_completed as number,
      contractsCompleted: row.contracts_completed as number,
      reputationGained: row.reputation_gained as number,
      combatVictories: row.combat_victories as number,
      totalScore: row.total_score as number
    };
  }
}

// ============================================================================
// TRANSACTION CONTEXT
// ============================================================================

/**
 * Collects statements to be executed in a transaction.
 * Call add() to queue statements, they execute when transaction() completes.
 */
export class TransactionContext {
  constructor(private statements: InStatement[]) {}

  /**
   * Add a statement to the transaction
   */
  add(sql: string, args: any[] = []): void {
    this.statements.push({ sql, args });
  }

  /**
   * Generate a UUID for use in the transaction
   */
  uuid(): string {
    return uuid();
  }
}
