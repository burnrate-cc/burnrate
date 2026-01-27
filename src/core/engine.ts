/**
 * BURNRATE Game Engine
 * Handles tick processing, supply burn, shipment movement, and combat resolution
 */

import { GameDatabase } from '../db/database.js';
import {
  Zone, Route, Player, Shipment, Unit, MarketOrder,
  GameEvent, getSupplyState, SHIPMENT_SPECS, SU_RECIPE,
  Inventory, Resource, emptyInventory, TIER_LIMITS,
  RECIPES, getFieldResource
} from './types.js';
import { findPath, calculatePathStats } from './pathfinding.js';
import { v4 as uuid } from 'uuid';

export class GameEngine {
  constructor(private db: GameDatabase) {}

  // ============================================================================
  // TICK PROCESSING
  // ============================================================================

  /**
   * Process a single game tick
   * This is the core simulation loop
   */
  processTick(): { tick: number; events: GameEvent[] } {
    const tick = this.db.incrementTick();
    const events: GameEvent[] = [];

    // Record tick event
    events.push(this.recordEvent('tick', null, 'system', { tick }));

    // 1. Process supply burn for all controlled zones
    const burnEvents = this.processSupplyBurn(tick);
    events.push(...burnEvents);

    // 2. Move shipments
    const shipmentEvents = this.processShipments(tick);
    events.push(...shipmentEvents);

    // 3. Process unit maintenance
    const maintenanceEvents = this.processUnitMaintenance(tick);
    events.push(...maintenanceEvents);

    // 4. Expire old contracts
    const contractEvents = this.processContractExpiration(tick);
    events.push(...contractEvents);

    // 5. Regenerate resources in Fields
    this.processFieldRegeneration(tick);

    // 6. Reset daily action counts (every 144 ticks = 24 hours)
    if (tick % 144 === 0) {
      this.resetDailyActions();
    }

    return { tick, events };
  }

  // ============================================================================
  // SUPPLY BURN
  // ============================================================================

  private processSupplyBurn(tick: number): GameEvent[] {
    const events: GameEvent[] = [];
    const zones = this.db.getAllZones();

    for (const zone of zones) {
      if (zone.burnRate === 0 || !zone.ownerId) continue;

      const previousState = getSupplyState(zone.supplyLevel);

      // Calculate SU needed
      const suNeeded = zone.burnRate;

      // Check if we have enough SU
      if (zone.suStockpile >= suNeeded) {
        // Burn the supply
        const newStockpile = zone.suStockpile - suNeeded;
        const newSupplyLevel = Math.min(100, (newStockpile / suNeeded) * 100);
        const newStreak = zone.supplyLevel >= 100 ? zone.complianceStreak + 1 : 0;

        this.db.updateZone(zone.id, {
          suStockpile: newStockpile,
          supplyLevel: newSupplyLevel >= 100 ? 100 : newSupplyLevel,
          complianceStreak: newStreak
        });

        events.push(this.recordEvent('zone_supplied', zone.ownerId, 'faction', {
          zoneId: zone.id,
          zoneName: zone.name,
          suBurned: suNeeded,
          remaining: newStockpile,
          supplyLevel: newSupplyLevel,
          streak: newStreak
        }));
      } else {
        // Not enough supply - zone degrades
        const supplied = zone.suStockpile;
        const deficit = suNeeded - supplied;
        const newSupplyLevel = Math.max(0, zone.supplyLevel - (deficit / suNeeded) * 25);

        this.db.updateZone(zone.id, {
          suStockpile: 0,
          supplyLevel: newSupplyLevel,
          complianceStreak: 0
        });

        const newState = getSupplyState(newSupplyLevel);
        if (newState !== previousState) {
          events.push(this.recordEvent('zone_state_changed', zone.ownerId, 'faction', {
            zoneId: zone.id,
            zoneName: zone.name,
            previousState,
            newState,
            supplyLevel: newSupplyLevel
          }));

          // If collapsed, zone becomes neutral
          if (newState === 'collapsed') {
            this.db.updateZone(zone.id, { ownerId: null });
            events.push(this.recordEvent('zone_captured', null, 'system', {
              zoneId: zone.id,
              zoneName: zone.name,
              previousOwner: zone.ownerId,
              newOwner: null,
              reason: 'supply_collapse'
            }));
          }
        }
      }
    }

    return events;
  }

  // ============================================================================
  // SHIPMENT PROCESSING
  // ============================================================================

  private processShipments(tick: number): GameEvent[] {
    const events: GameEvent[] = [];
    const shipments = this.db.getActiveShipments();

    for (const shipment of shipments) {
      // Decrement ticks to next zone
      const newTicks = shipment.ticksToNextZone - 1;

      if (newTicks <= 0) {
        // Move to next zone
        const newPosition = shipment.currentPosition + 1;

        if (newPosition >= shipment.path.length) {
          // Arrived at destination
          this.completeShipment(shipment, tick, events);
        } else {
          // Check for interception on this leg
          const fromZoneId = shipment.path[shipment.currentPosition];
          const toZoneId = shipment.path[newPosition];
          const intercepted = this.checkInterception(shipment, fromZoneId, toZoneId, tick);

          if (intercepted) {
            this.interceptShipment(shipment, tick, events);
          } else {
            // Continue to next zone
            const route = this.findRoute(fromZoneId, toZoneId);
            const spec = SHIPMENT_SPECS[shipment.type];
            const ticksToNext = route
              ? Math.ceil(route.distance * spec.speedModifier)
              : 1;

            this.db.updateShipment(shipment.id, {
              currentPosition: newPosition,
              ticksToNextZone: ticksToNext
            });

            events.push(this.recordEvent('shipment_moved', shipment.playerId, 'player', {
              shipmentId: shipment.id,
              fromZone: fromZoneId,
              toZone: toZoneId,
              position: newPosition,
              totalLegs: shipment.path.length - 1
            }));
          }
        }
      } else {
        // Still in transit
        this.db.updateShipment(shipment.id, { ticksToNextZone: newTicks });
      }
    }

    return events;
  }

  private completeShipment(shipment: Shipment, tick: number, events: GameEvent[]): void {
    const destinationId = shipment.path[shipment.path.length - 1];
    const player = this.db.getPlayer(shipment.playerId);

    if (player) {
      // Add cargo to player inventory
      const newInventory = { ...player.inventory };
      for (const [resource, amount] of Object.entries(shipment.cargo)) {
        if (amount && resource in newInventory) {
          (newInventory as any)[resource] += amount;
        }
      }
      this.db.updatePlayer(player.id, { inventory: newInventory, locationId: destinationId });
    }

    this.db.updateShipment(shipment.id, { status: 'arrived' });

    events.push(this.recordEvent('shipment_arrived', shipment.playerId, 'player', {
      shipmentId: shipment.id,
      destination: destinationId,
      cargo: shipment.cargo
    }));
  }

  private checkInterception(shipment: Shipment, fromZoneId: string, toZoneId: string, tick: number): boolean {
    const route = this.findRoute(fromZoneId, toZoneId);
    if (!route) return false;

    const spec = SHIPMENT_SPECS[shipment.type];
    let interceptionChance = route.baseRisk * route.chokepointRating * spec.visibilityModifier;

    // Check for raiders deployed on this route
    const raiders = this.getRaidersOnRoute(route.id);
    const totalRaiderStrength = raiders.reduce((sum, r) => sum + r.strength, 0);

    // Raiders significantly increase interception chance
    if (totalRaiderStrength > 0) {
      interceptionChance += totalRaiderStrength * 0.05;  // Each strength point adds 5%
    }

    // Reduce by escort strength
    const totalEscortStrength = shipment.escortIds.reduce((sum, id) => {
      const unit = this.db.getUnit(id);
      return sum + (unit?.strength || 0);
    }, 0);

    // Escorts counter raiders: if escort >= raider strength, major reduction
    if (totalEscortStrength >= totalRaiderStrength) {
      interceptionChance *= Math.max(0.1, 1 - totalEscortStrength * 0.1);
    } else {
      // Raiders have the advantage
      interceptionChance *= Math.max(0.2, 1 - (totalEscortStrength - totalRaiderStrength) * 0.05);
    }

    // Cap at 95% max
    interceptionChance = Math.min(0.95, interceptionChance);

    // Random roll
    return Math.random() < interceptionChance;
  }

  /**
   * Get all raiders deployed on a specific route
   */
  private getRaidersOnRoute(routeId: string): Unit[] {
    // Get all units and filter for raiders assigned to this route
    const allPlayers = this.db.getAllPlayers();
    const raiders: Unit[] = [];

    for (const player of allPlayers) {
      const units = this.db.getPlayerUnits(player.id);
      for (const unit of units) {
        if (unit.type === 'raider' && unit.assignmentId === routeId) {
          raiders.push(unit);
        }
      }
    }

    return raiders;
  }

  private interceptShipment(shipment: Shipment, tick: number, events: GameEvent[]): void {
    const fromZoneId = shipment.path[shipment.currentPosition];
    const toZoneId = shipment.path[shipment.currentPosition + 1];
    const route = this.findRoute(fromZoneId, toZoneId);

    // Get combatants
    const escorts = shipment.escortIds.map(id => this.db.getUnit(id)).filter(u => u) as Unit[];
    const raiders = route ? this.getRaidersOnRoute(route.id) : [];

    const totalEscortStrength = escorts.reduce((sum, u) => sum + u.strength, 0);
    const totalRaiderStrength = raiders.reduce((sum, u) => sum + u.strength, 0);

    // Combat resolution
    let cargoLossPct = 0.5;  // Default 50% loss
    const combatEvents: any[] = [];

    if (totalRaiderStrength > 0 && totalEscortStrength > 0) {
      // Combat between escorts and raiders
      const escortAdvantage = totalEscortStrength - totalRaiderStrength;

      if (escortAdvantage > 10) {
        // Escorts win decisively - minimal cargo loss
        cargoLossPct = 0.1;
        // Destroy some raiders
        for (const raider of raiders.slice(0, Math.floor(raiders.length / 2))) {
          this.db.deleteUnit(raider.id);
          combatEvents.push({ type: 'raider_destroyed', unitId: raider.id });
        }
      } else if (escortAdvantage > 0) {
        // Escorts win narrowly
        cargoLossPct = 0.25;
      } else if (escortAdvantage > -10) {
        // Raiders win narrowly
        cargoLossPct = 0.5;
        // Damage some escorts
        for (const escort of escorts.slice(0, 1)) {
          this.db.deleteUnit(escort.id);
          combatEvents.push({ type: 'escort_destroyed', unitId: escort.id });
        }
      } else {
        // Raiders win decisively
        cargoLossPct = 0.75;
        // Destroy most escorts
        for (const escort of escorts.slice(0, Math.ceil(escorts.length * 0.75))) {
          this.db.deleteUnit(escort.id);
          combatEvents.push({ type: 'escort_destroyed', unitId: escort.id });
        }
      }

      events.push(this.recordEvent('combat_resolved', null, 'system', {
        location: fromZoneId,
        escortStrength: totalEscortStrength,
        raiderStrength: totalRaiderStrength,
        outcome: escortAdvantage > 0 ? 'escort_victory' : 'raider_victory',
        casualties: combatEvents
      }));
    }

    // Calculate cargo loss
    const lostCargo: Partial<Inventory> = {};
    const remainingCargo: Partial<Inventory> = {};
    for (const [resource, amount] of Object.entries(shipment.cargo)) {
      if (amount) {
        const lost = Math.floor(amount * cargoLossPct);
        lostCargo[resource as keyof Inventory] = lost;
        remainingCargo[resource as keyof Inventory] = amount - lost;
      }
    }

    // If any cargo remains and escorts survived, shipment continues (damaged)
    // Otherwise, shipment is fully intercepted
    const survivingEscorts = shipment.escortIds.filter(id => {
      const unit = this.db.getUnit(id);
      return unit !== null;
    });

    if (cargoLossPct < 1 && Object.values(remainingCargo).some(v => v && v > 0)) {
      // Partial interception - cargo reduced but shipment continues
      this.db.updateShipment(shipment.id, {
        escortIds: survivingEscorts
      });
      // Note: We'd need to update cargo too, but current schema doesn't support that easily
      // For now, just record the event

      events.push(this.recordEvent('shipment_intercepted', shipment.playerId, 'player', {
        shipmentId: shipment.id,
        lostCargo,
        remainingCargo,
        location: fromZoneId,
        outcome: 'partial_loss',
        cargoLossPct: Math.round(cargoLossPct * 100)
      }));
    } else {
      // Full interception
      this.db.updateShipment(shipment.id, { status: 'intercepted' });

      events.push(this.recordEvent('shipment_intercepted', shipment.playerId, 'player', {
        shipmentId: shipment.id,
        lostCargo,
        location: fromZoneId,
        outcome: 'total_loss'
      }));
    }
  }

  // ============================================================================
  // UNIT MAINTENANCE
  // ============================================================================

  private processUnitMaintenance(tick: number): GameEvent[] {
    const events: GameEvent[] = [];
    const players = this.db.getAllPlayers();

    for (const player of players) {
      const units = this.db.getPlayerUnits(player.id);
      let totalMaintenance = 0;

      for (const unit of units) {
        totalMaintenance += unit.maintenance;
      }

      if (totalMaintenance > 0 && player.inventory.credits >= totalMaintenance) {
        const newInventory = { ...player.inventory };
        newInventory.credits -= totalMaintenance;
        this.db.updatePlayer(player.id, { inventory: newInventory });
      } else if (totalMaintenance > player.inventory.credits) {
        // Can't afford maintenance - units desert (delete one)
        if (units.length > 0) {
          const unitToDelete = units[0];
          this.db.deleteUnit(unitToDelete.id);
          events.push(this.recordEvent('player_action', player.id, 'player', {
            action: 'unit_deserted',
            unitId: unitToDelete.id,
            reason: 'maintenance_unpaid'
          }));
        }
      }
    }

    return events;
  }

  // ============================================================================
  // CONTRACT EXPIRATION
  // ============================================================================

  private processContractExpiration(tick: number): GameEvent[] {
    const events: GameEvent[] = [];
    const contracts = this.db.getOpenContracts();

    for (const contract of contracts) {
      if (contract.deadline < tick && contract.status === 'open') {
        this.db.updateContract(contract.id, { status: 'expired' });
      } else if (contract.deadline < tick && contract.status === 'active') {
        this.db.updateContract(contract.id, { status: 'failed' });
        events.push(this.recordEvent('contract_failed', contract.acceptedBy, 'player', {
          contractId: contract.id,
          reason: 'deadline_missed'
        }));
      }
    }

    return events;
  }

  // ============================================================================
  // DAILY RESET
  // ============================================================================

  private resetDailyActions(): void {
    const players = this.db.getAllPlayers();
    for (const player of players) {
      this.db.updatePlayer(player.id, { actionsToday: 0 });
    }
  }

  // ============================================================================
  // FIELD REGENERATION
  // ============================================================================

  private processFieldRegeneration(tick: number): void {
    const zones = this.db.getAllZones();

    for (const zone of zones) {
      if (zone.type !== 'field') continue;

      // Determine what resource this field produces
      const resource = getFieldResource(zone.name);
      if (!resource) continue;

      // Regeneration rate: productionCapacity per tick, up to a max stockpile
      const maxStockpile = 1000;  // Max resources a field can hold
      const regenAmount = Math.floor(zone.productionCapacity / 10);  // Regen 10% of capacity per tick
      const currentAmount = (zone.inventory as any)[resource] || 0;

      if (currentAmount < maxStockpile) {
        const newAmount = Math.min(maxStockpile, currentAmount + regenAmount);
        const newInventory = { ...zone.inventory };
        (newInventory as any)[resource] = newAmount;
        this.db.updateZone(zone.id, { inventory: newInventory });
      }
    }
  }

  // ============================================================================
  // PLAYER ACTIONS
  // ============================================================================

  /**
   * Check if player can perform an action (rate limiting)
   */
  canPlayerAct(playerId: string): { allowed: boolean; reason?: string } {
    const player = this.db.getPlayer(playerId);
    if (!player) return { allowed: false, reason: 'Player not found' };

    const tick = this.db.getCurrentTick();
    const limits = TIER_LIMITS[player.tier];

    // Check daily quota
    if (player.actionsToday >= limits.dailyActions) {
      return { allowed: false, reason: `Daily action limit (${limits.dailyActions}) reached` };
    }

    // Check rate limit (1 action per 30 seconds = 0.05 ticks at 10min/tick)
    // For simplicity, allow 1 action per tick
    if (player.lastActionTick >= tick) {
      return { allowed: false, reason: 'Rate limited. Wait for next tick.' };
    }

    return { allowed: true };
  }

  /**
   * Record that player took an action
   */
  recordPlayerAction(playerId: string): void {
    const player = this.db.getPlayer(playerId);
    if (!player) return;

    const tick = this.db.getCurrentTick();
    this.db.updatePlayer(playerId, {
      actionsToday: player.actionsToday + 1,
      lastActionTick: tick
    });
  }

  /**
   * Create a new shipment with an explicit path
   * Players must specify waypoints - no automatic pathfinding
   */
  createShipmentWithPath(
    playerId: string,
    type: 'courier' | 'freight' | 'convoy',
    path: string[],
    cargo: Partial<Inventory>
  ): { success: boolean; shipment?: Shipment; error?: string } {
    const canAct = this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (path.length < 2) {
      return { success: false, error: 'Path must have at least origin and destination' };
    }

    const fromZoneId = path[0];
    const toZoneId = path[path.length - 1];

    // Check license
    if (!player.licenses[type]) {
      return { success: false, error: `No ${type} license` };
    }

    // Check player is at origin
    if (player.locationId !== fromZoneId) {
      return { success: false, error: 'Must be at origin zone' };
    }

    // Check cargo capacity
    const spec = SHIPMENT_SPECS[type];
    const totalCargo = Object.values(cargo).reduce((sum, v) => sum + (v || 0), 0);
    if (totalCargo > spec.capacity) {
      return { success: false, error: `Cargo (${totalCargo}) exceeds ${type} capacity (${spec.capacity})` };
    }

    // Check player has cargo
    for (const [resource, amount] of Object.entries(cargo)) {
      if (amount && (player.inventory as any)[resource] < amount) {
        return { success: false, error: `Insufficient ${resource}` };
      }
    }

    // Validate all path legs have direct routes
    for (let i = 0; i < path.length - 1; i++) {
      const routes = this.db.getRoutesBetween(path[i], path[i + 1]);
      if (routes.length === 0) {
        return { success: false, error: `No direct route for leg ${i + 1}` };
      }
    }

    // Calculate ticks to first waypoint
    const firstRoute = this.db.getRoutesBetween(path[0], path[1])[0];
    const ticksToNext = Math.ceil(firstRoute.distance * spec.speedModifier);

    // Deduct cargo from player
    const newInventory = { ...player.inventory };
    for (const [resource, amount] of Object.entries(cargo)) {
      if (amount) {
        (newInventory as any)[resource] -= amount;
      }
    }
    this.db.updatePlayer(playerId, { inventory: newInventory });

    // Create shipment
    const tick = this.db.getCurrentTick();
    const shipment = this.db.createShipment({
      playerId,
      type,
      path,
      currentPosition: 0,
      ticksToNextZone: ticksToNext,
      cargo,
      escortIds: [],
      createdAt: tick,
      status: 'in_transit'
    });

    this.recordPlayerAction(playerId);

    this.recordEvent('shipment_created', playerId, 'player', {
      shipmentId: shipment.id,
      type,
      path,
      from: fromZoneId,
      to: toZoneId,
      cargo
    });

    return { success: true, shipment };
  }

  /**
   * Create a new shipment (legacy - uses pathfinding internally)
   * @deprecated Use createShipmentWithPath for explicit control
   */
  createShipment(
    playerId: string,
    type: 'courier' | 'freight' | 'convoy',
    fromZoneId: string,
    toZoneId: string,
    cargo: Partial<Inventory>
  ): { success: boolean; shipment?: Shipment; error?: string } {
    // For backwards compatibility, find path automatically
    // But this is deprecated - players should use explicit paths
    const pathResult = findPath(this.db, fromZoneId, toZoneId);
    if (!pathResult) {
      return { success: false, error: 'No route between zones' };
    }
    return this.createShipmentWithPath(playerId, type, pathResult.path, cargo);
  }

  /**
   * Place a market order
   */
  placeOrder(
    playerId: string,
    zoneId: string,
    resource: Resource,
    side: 'buy' | 'sell',
    price: number,
    quantity: number
  ): { success: boolean; order?: MarketOrder; error?: string } {
    const canAct = this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Check player is at zone
    if (player.locationId !== zoneId) {
      return { success: false, error: 'Must be at zone to trade' };
    }

    // Check order limits
    const limits = TIER_LIMITS[player.tier];
    const existingOrders = this.db.getOrdersForZone(zoneId).filter(o => o.playerId === playerId);
    if (existingOrders.length >= limits.marketOrders) {
      return { success: false, error: `Order limit (${limits.marketOrders}) reached` };
    }

    if (side === 'sell') {
      // Check player has the resource
      if ((player.inventory as any)[resource] < quantity) {
        return { success: false, error: `Insufficient ${resource}` };
      }
      // Reserve the resource
      const newInventory = { ...player.inventory };
      (newInventory as any)[resource] -= quantity;
      this.db.updatePlayer(playerId, { inventory: newInventory });
    } else {
      // Check player has credits
      const totalCost = price * quantity;
      if (player.inventory.credits < totalCost) {
        return { success: false, error: 'Insufficient credits' };
      }
      // Reserve credits
      const newInventory = { ...player.inventory };
      newInventory.credits -= totalCost;
      this.db.updatePlayer(playerId, { inventory: newInventory });
    }

    const tick = this.db.getCurrentTick();
    const order = this.db.createOrder({
      playerId,
      zoneId,
      resource,
      side,
      price,
      quantity,
      originalQuantity: quantity,
      createdAt: tick
    });

    this.recordPlayerAction(playerId);

    // Try to match orders
    this.matchOrders(zoneId, resource);

    this.recordEvent('order_placed', playerId, 'player', {
      orderId: order.id,
      resource,
      side,
      price,
      quantity
    });

    return { success: true, order };
  }

  /**
   * Match buy and sell orders
   */
  private matchOrders(zoneId: string, resource: Resource): void {
    const orders = this.db.getOrdersForZone(zoneId, resource);
    const buys = orders.filter(o => o.side === 'buy').sort((a, b) => b.price - a.price);
    const sells = orders.filter(o => o.side === 'sell').sort((a, b) => a.price - b.price);

    for (const buy of buys) {
      for (const sell of sells) {
        if (buy.price >= sell.price && buy.quantity > 0 && sell.quantity > 0) {
          const tradeQty = Math.min(buy.quantity, sell.quantity);
          const tradePrice = sell.price; // Price-time priority: seller's price

          // Execute trade
          this.executeTrade(buy, sell, tradeQty, tradePrice);
        }
      }
    }
  }

  private executeTrade(buyOrder: MarketOrder, sellOrder: MarketOrder, quantity: number, price: number): void {
    const tick = this.db.getCurrentTick();

    // Update order quantities
    this.db.updateOrder(buyOrder.id, buyOrder.quantity - quantity);
    this.db.updateOrder(sellOrder.id, sellOrder.quantity - quantity);

    // Transfer resource to buyer
    const buyer = this.db.getPlayer(buyOrder.playerId);
    if (buyer) {
      const newInventory = { ...buyer.inventory };
      (newInventory as any)[buyOrder.resource] += quantity;
      // Refund excess credits if price was lower than bid
      const refund = (buyOrder.price - price) * quantity;
      newInventory.credits += refund;
      this.db.updatePlayer(buyer.id, { inventory: newInventory });
    }

    // Transfer credits to seller
    const seller = this.db.getPlayer(sellOrder.playerId);
    if (seller) {
      const newInventory = { ...seller.inventory };
      newInventory.credits += price * quantity;
      this.db.updatePlayer(seller.id, { inventory: newInventory });
    }

    this.recordEvent('trade_executed', null, 'system', {
      zoneId: buyOrder.zoneId,
      resource: buyOrder.resource,
      buyerId: buyOrder.playerId,
      sellerId: sellOrder.playerId,
      price,
      quantity
    });
  }

  /**
   * Deposit SU to a zone
   */
  depositSU(playerId: string, zoneId: string, amount: number): { success: boolean; error?: string } {
    const canAct = this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const zone = this.db.getZone(zoneId);
    if (!zone) return { success: false, error: 'Zone not found' };

    if (player.locationId !== zoneId) {
      return { success: false, error: 'Must be at zone' };
    }

    // Check player has SU components
    const needed = {
      rations: SU_RECIPE.rations * amount,
      fuel: SU_RECIPE.fuel * amount,
      parts: SU_RECIPE.parts * amount,
      ammo: SU_RECIPE.ammo * amount
    };

    for (const [resource, qty] of Object.entries(needed)) {
      if ((player.inventory as any)[resource] < qty) {
        return { success: false, error: `Insufficient ${resource} for ${amount} SU` };
      }
    }

    // Deduct from player
    const newInventory = { ...player.inventory };
    newInventory.rations -= needed.rations;
    newInventory.fuel -= needed.fuel;
    newInventory.parts -= needed.parts;
    newInventory.ammo -= needed.ammo;
    this.db.updatePlayer(playerId, { inventory: newInventory });

    // Add to zone
    this.db.updateZone(zoneId, { suStockpile: zone.suStockpile + amount });

    this.recordPlayerAction(playerId);

    this.recordEvent('zone_supplied', playerId, 'player', {
      zoneId,
      amount,
      newStockpile: zone.suStockpile + amount
    });

    return { success: true };
  }

  /**
   * Scan a zone or route for intel
   * If player is in a faction, intel is automatically shared with faction members
   */
  scan(playerId: string, targetType: 'zone' | 'route', targetId: string): { success: boolean; intel?: any; error?: string } {
    const canAct = this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const tick = this.db.getCurrentTick();
    let data: Record<string, unknown> = {};

    if (targetType === 'zone') {
      const zone = this.db.getZone(targetId);
      if (!zone) return { success: false, error: 'Zone not found' };

      // Get owner faction name if owned
      let ownerName = null;
      if (zone.ownerId) {
        const ownerFaction = this.db.getFaction(zone.ownerId);
        ownerName = ownerFaction ? `${ownerFaction.name} [${ownerFaction.tag}]` : zone.ownerId;
      }

      data = {
        name: zone.name,
        type: zone.type,
        owner: zone.ownerId,
        ownerName,
        supplyState: getSupplyState(zone.supplyLevel),
        supplyLevel: zone.supplyLevel,
        suStockpile: zone.suStockpile,
        burnRate: zone.burnRate,
        marketActivity: this.db.getOrdersForZone(targetId).length,
        garrisonLevel: zone.garrisonLevel
      };
    } else {
      const route = this.db.getRoute(targetId);
      if (!route) return { success: false, error: 'Route not found' };

      // Count shipments on this route
      const shipments = this.db.getActiveShipments().filter(s =>
        s.path.includes(route.fromZoneId) && s.path.includes(route.toZoneId)
      );

      // Count raiders on this route
      const raiders = this.getRaidersOnRoute(route.id);

      data = {
        from: route.fromZoneId,
        to: route.toZoneId,
        distance: route.distance,
        baseRisk: route.baseRisk,
        chokepointRating: route.chokepointRating,
        activeShipments: shipments.length,
        raiderPresence: raiders.length > 0,
        raiderStrength: raiders.reduce((sum, r) => sum + r.strength, 0)
      };
    }

    // Share with faction if player is in one
    const intel = this.db.createIntel({
      playerId,
      factionId: player.factionId,  // Auto-share with faction
      targetType,
      targetId,
      gatheredAt: tick,
      data,
      signalQuality: 100 // Fresh intel
    });

    this.recordPlayerAction(playerId);

    this.recordEvent('intel_gathered', playerId, 'player', {
      targetType,
      targetId,
      signalQuality: 100,
      sharedWithFaction: !!player.factionId
    });

    return { success: true, intel: data };
  }


  /**
   * Produce resources or units at a Factory
   */
  produce(
    playerId: string,
    output: string,
    quantity: number
  ): { success: boolean; produced?: number; units?: Unit[]; error?: string } {
    const canAct = this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const zone = this.db.getZone(player.locationId);
    if (!zone) return { success: false, error: 'Zone not found' };

    if (zone.type !== 'factory') {
      return { success: false, error: 'Can only produce at Factories' };
    }

    const recipe = RECIPES[output];
    if (!recipe) {
      return { success: false, error: `Unknown product: ${output}. Valid: metal, chemicals, rations, textiles, ammo, medkits, parts, comms, escort, raider` };
    }

    // Check player has all inputs
    for (const [resource, needed] of Object.entries(recipe.inputs)) {
      const totalNeeded = (needed || 0) * quantity;
      if ((player.inventory as any)[resource] < totalNeeded) {
        return { success: false, error: `Insufficient ${resource}. Need ${totalNeeded}, have ${(player.inventory as any)[resource]}` };
      }
    }

    // Deduct inputs
    const newInventory = { ...player.inventory };
    for (const [resource, needed] of Object.entries(recipe.inputs)) {
      (newInventory as any)[resource] -= (needed || 0) * quantity;
    }

    // Handle unit production differently
    if (recipe.isUnit) {
      this.db.updatePlayer(playerId, { inventory: newInventory });

      const units: Unit[] = [];
      const unitType = output as 'escort' | 'raider';

      for (let i = 0; i < quantity; i++) {
        const unit = this.db.createUnit({
          playerId,
          type: unitType,
          locationId: player.locationId,
          strength: unitType === 'escort' ? 10 : 15,
          speed: unitType === 'escort' ? 1 : 2,
          maintenance: unitType === 'escort' ? 5 : 8,
          assignmentId: null,
          forSalePrice: null
        });
        units.push(unit);
      }

      this.recordPlayerAction(playerId);

      this.recordEvent('player_action', playerId, 'player', {
        action: 'produce_unit',
        unitType,
        quantity,
        zone: zone.name
      });

      return { success: true, produced: quantity, units };
    }

    // Regular resource production
    (newInventory as any)[output] += quantity;
    this.db.updatePlayer(playerId, { inventory: newInventory });

    this.recordPlayerAction(playerId);

    this.recordEvent('player_action', playerId, 'player', {
      action: 'produce',
      output,
      quantity,
      zone: zone.name
    });

    return { success: true, produced: quantity };
  }

  /**
   * Extract raw resources from a Field
   */
  extract(
    playerId: string,
    quantity: number
  ): { success: boolean; extracted?: { resource: string; amount: number }; error?: string } {
    const canAct = this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const zone = this.db.getZone(player.locationId);
    if (!zone) return { success: false, error: 'Zone not found' };

    if (zone.type !== 'field') {
      return { success: false, error: 'Can only extract at Fields' };
    }

    // Determine what resource this field produces
    const resource = getFieldResource(zone.name);
    if (!resource) {
      return { success: false, error: 'This field has no extractable resources' };
    }

    // Check zone has the resource
    if ((zone.inventory as any)[resource] < quantity) {
      return { success: false, error: `Insufficient ${resource} in field. Available: ${(zone.inventory as any)[resource]}` };
    }

    // Extraction cost (credits per unit)
    const extractionCost = 5 * quantity;
    if (player.inventory.credits < extractionCost) {
      return { success: false, error: `Insufficient credits. Extraction costs ${extractionCost} cr` };
    }

    // Deduct from zone, add to player
    const newZoneInventory = { ...zone.inventory };
    (newZoneInventory as any)[resource] -= quantity;
    this.db.updateZone(zone.id, { inventory: newZoneInventory });

    const newPlayerInventory = { ...player.inventory };
    (newPlayerInventory as any)[resource] += quantity;
    newPlayerInventory.credits -= extractionCost;
    this.db.updatePlayer(playerId, { inventory: newPlayerInventory });

    this.recordPlayerAction(playerId);

    this.recordEvent('player_action', playerId, 'player', {
      action: 'extract',
      resource,
      quantity,
      zone: zone.name
    });

    return { success: true, extracted: { resource, amount: quantity } };
  }

  /**
   * Capture a neutral zone for a faction
   */
  captureZone(
    playerId: string,
    zoneId: string
  ): { success: boolean; error?: string } {
    const canAct = this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Must be in a faction to capture zones' };
    }

    const zone = this.db.getZone(zoneId);
    if (!zone) return { success: false, error: 'Zone not found' };

    if (player.locationId !== zoneId) {
      return { success: false, error: 'Must be at the zone to capture it' };
    }

    if (zone.ownerId) {
      if (zone.ownerId === player.factionId) {
        return { success: false, error: 'Zone already controlled by your faction' };
      }
      // Can only capture if zone is collapsed
      if (zone.supplyLevel > 0) {
        return { success: false, error: 'Zone is defended. Supply must collapse before capture.' };
      }
    }

    // Capture the zone
    this.db.updateZone(zoneId, {
      ownerId: player.factionId,
      supplyLevel: 0,
      complianceStreak: 0
    });

    this.recordPlayerAction(playerId);

    this.recordEvent('zone_captured', player.factionId, 'faction', {
      zoneId,
      zoneName: zone.name,
      previousOwner: zone.ownerId,
      newOwner: player.factionId,
      capturedBy: playerId
    });

    return { success: true };
  }

  /**
   * Assign an escort unit to a shipment
   */
  assignEscort(
    playerId: string,
    unitId: string,
    shipmentId: string
  ): { success: boolean; error?: string } {
    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const unit = this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.playerId !== playerId) {
      return { success: false, error: 'Not your unit' };
    }

    if (unit.type !== 'escort') {
      return { success: false, error: 'Only escort units can be assigned to shipments' };
    }

    const shipment = this.db.getShipment(shipmentId);
    if (!shipment) return { success: false, error: 'Shipment not found' };

    if (shipment.playerId !== playerId) {
      return { success: false, error: 'Not your shipment' };
    }

    if (shipment.status !== 'in_transit') {
      return { success: false, error: 'Shipment not in transit' };
    }

    // Assign escort
    const newEscorts = [...shipment.escortIds, unitId];
    this.db.updateShipment(shipmentId, { escortIds: newEscorts });
    this.db.updateUnit(unitId, { assignmentId: shipmentId });

    return { success: true };
  }

  /**
   * List a unit for sale at current location (must be at Hub)
   */
  listUnitForSale(
    playerId: string,
    unitId: string,
    price: number
  ): { success: boolean; error?: string } {
    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const unit = this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.playerId !== playerId) {
      return { success: false, error: 'Not your unit' };
    }

    if (unit.assignmentId) {
      return { success: false, error: 'Unit is currently assigned. Unassign first.' };
    }

    const zone = this.db.getZone(unit.locationId);
    if (!zone || zone.type !== 'hub') {
      return { success: false, error: 'Units can only be sold at Hubs' };
    }

    if (price < 1) {
      return { success: false, error: 'Price must be at least 1 credit' };
    }

    this.db.updateUnit(unitId, { forSalePrice: price });

    return { success: true };
  }

  /**
   * Remove a unit from sale
   */
  unlistUnit(
    playerId: string,
    unitId: string
  ): { success: boolean; error?: string } {
    const unit = this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.playerId !== playerId) {
      return { success: false, error: 'Not your unit' };
    }

    this.db.updateUnit(unitId, { forSalePrice: null });

    return { success: true };
  }

  /**
   * Hire (buy) a unit that's listed for sale
   */
  hireUnit(
    playerId: string,
    unitId: string
  ): { success: boolean; unit?: Unit; error?: string } {
    const canAct = this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const unit = this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.forSalePrice === null) {
      return { success: false, error: 'Unit is not for sale' };
    }

    if (unit.playerId === playerId) {
      return { success: false, error: 'Cannot buy your own unit' };
    }

    // Buyer must be at the same location
    if (player.locationId !== unit.locationId) {
      return { success: false, error: 'Must be at the same Hub as the unit' };
    }

    const price = unit.forSalePrice;

    if (player.inventory.credits < price) {
      return { success: false, error: `Insufficient credits. Need ${price}` };
    }

    // Transfer credits
    const seller = this.db.getPlayer(unit.playerId);
    if (seller) {
      const sellerInventory = { ...seller.inventory };
      sellerInventory.credits += price;
      this.db.updatePlayer(seller.id, { inventory: sellerInventory });
    }

    const buyerInventory = { ...player.inventory };
    buyerInventory.credits -= price;
    this.db.updatePlayer(playerId, { inventory: buyerInventory });

    // Transfer unit ownership
    this.db.updateUnit(unitId, {
      playerId,
      forSalePrice: null
    });

    this.recordPlayerAction(playerId);

    this.recordEvent('player_action', playerId, 'player', {
      action: 'hire_unit',
      unitId,
      unitType: unit.type,
      price,
      sellerId: unit.playerId
    });

    // Get updated unit
    const updatedUnit = this.db.getUnit(unitId);
    return { success: true, unit: updatedUnit || undefined };
  }

  /**
   * Deploy a raider unit to interdict a route
   */
  deployRaider(
    playerId: string,
    unitId: string,
    routeId: string
  ): { success: boolean; error?: string } {
    const player = this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const unit = this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.playerId !== playerId) {
      return { success: false, error: 'Not your unit' };
    }

    if (unit.type !== 'raider') {
      return { success: false, error: 'Only raider units can interdict routes' };
    }

    const route = this.db.getRoute(routeId);
    if (!route) return { success: false, error: 'Route not found' };

    // Deploy raider
    this.db.updateUnit(unitId, { assignmentId: routeId });

    this.recordEvent('player_action', playerId, 'player', {
      action: 'deploy_raider',
      unitId,
      routeId
    });

    return { success: true };
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  private findRoute(fromZoneId: string, toZoneId: string): Route | null {
    const routes = this.db.getRoutesBetween(fromZoneId, toZoneId);
    return routes.length > 0 ? routes[0] : null;
  }

  private recordEvent(
    type: GameEvent['type'],
    actorId: string | null,
    actorType: 'player' | 'faction' | 'system',
    data: Record<string, unknown>
  ): GameEvent {
    const tick = this.db.getCurrentTick();
    return this.db.recordEvent({
      type,
      tick,
      timestamp: new Date(),
      actorId,
      actorType,
      data
    });
  }
}
