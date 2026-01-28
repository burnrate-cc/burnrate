/**
 * BURNRATE Async Game Engine
 * Multiplayer-ready engine using TursoDatabase
 */

import { TursoDatabase } from '../db/turso-database.js';
import {
  Zone, Route, Player, Shipment, Unit, MarketOrder, Contract,
  GameEvent, getSupplyState, getZoneEfficiency, SHIPMENT_SPECS, SU_RECIPE,
  Inventory, Resource, emptyInventory, TIER_LIMITS,
  RECIPES, getFieldResource, IntelReportWithFreshness, ContractType,
  FactionRank, FACTION_PERMISSIONS, Faction, ShipmentType, LICENSE_REQUIREMENTS,
  REPUTATION_REWARDS, getReputationTitle, SEASON_CONFIG, SeasonScore,
  TUTORIAL_CONTRACTS
} from './types.js';

export class AsyncGameEngine {
  constructor(private db: TursoDatabase) {}

  // ============================================================================
  // TICK PROCESSING
  // ============================================================================

  async processTick(): Promise<{ tick: number; events: GameEvent[] }> {
    const tick = await this.db.incrementTick();
    const events: GameEvent[] = [];

    events.push(await this.recordEvent('tick', null, 'system', { tick }));

    const burnEvents = await this.processSupplyBurn(tick);
    events.push(...burnEvents);

    const shipmentEvents = await this.processShipments(tick);
    events.push(...shipmentEvents);

    const maintenanceEvents = await this.processUnitMaintenance(tick);
    events.push(...maintenanceEvents);

    const contractEvents = await this.processContractExpiration(tick);
    events.push(...contractEvents);

    await this.processFieldRegeneration(tick);

    // Stockpile decay: medkits decay every 10 ticks, comms every 20 ticks
    if (tick % 10 === 0) {
      await this.processStockpileDecay(tick);
    }

    if (tick % 144 === 0) {
      await this.resetDailyActions();
    }

    // Process advanced market orders
    const advancedOrderEvents = await this.processAdvancedOrders(tick);
    events.push(...advancedOrderEvents);

    // Clean up expired intel every 50 ticks to keep database size manageable
    if (tick % 50 === 0) {
      await this.db.cleanupExpiredIntel(200);
    }

    // Update zone scores weekly
    if (tick % SEASON_CONFIG.ticksPerWeek === 0) {
      const season = await this.db.getSeasonInfo();
      await this.db.updateSeasonZoneScores(season.seasonNumber);

      // Advance week
      if (season.seasonWeek < SEASON_CONFIG.weeksPerSeason) {
        await this.db.advanceWeek();
      } else {
        // End of season - archive scores and reset the world
        const newSeasonNumber = season.seasonNumber + 1;
        await this.db.seasonReset(newSeasonNumber);
        events.push(await this.recordEvent('tick', null, 'system', {
          type: 'season_end',
          endedSeason: season.seasonNumber,
          newSeason: newSeasonNumber
        }));
      }
    }

    return { tick, events };
  }

  // ============================================================================
  // SUPPLY BURN
  // ============================================================================

  private async processSupplyBurn(tick: number): Promise<GameEvent[]> {
    const events: GameEvent[] = [];
    const zones = await this.db.getAllZones();

    for (const zone of zones) {
      if (zone.burnRate === 0 || !zone.ownerId) continue;

      const previousState = getSupplyState(zone.supplyLevel);
      const suNeeded = zone.burnRate;

      if (zone.suStockpile >= suNeeded) {
        const newStockpile = zone.suStockpile - suNeeded;
        const newSupplyLevel = Math.min(100, (newStockpile / suNeeded) * 100);
        const newStreak = zone.supplyLevel >= 100 ? zone.complianceStreak + 1 : 0;

        await this.db.updateZone(zone.id, {
          suStockpile: newStockpile,
          supplyLevel: newSupplyLevel >= 100 ? 100 : newSupplyLevel,
          complianceStreak: newStreak
        });

        events.push(await this.recordEvent('zone_supplied', zone.ownerId, 'faction', {
          zoneId: zone.id,
          zoneName: zone.name,
          suBurned: suNeeded,
          remaining: newStockpile,
          supplyLevel: newSupplyLevel,
          streak: newStreak
        }));
      } else {
        const supplied = zone.suStockpile;
        const deficit = suNeeded - supplied;
        const newSupplyLevel = Math.max(0, zone.supplyLevel - (deficit / suNeeded) * 25);

        await this.db.updateZone(zone.id, {
          suStockpile: 0,
          supplyLevel: newSupplyLevel,
          complianceStreak: 0
        });

        const newState = getSupplyState(newSupplyLevel);
        if (newState !== previousState) {
          events.push(await this.recordEvent('zone_state_changed', zone.ownerId, 'faction', {
            zoneId: zone.id,
            zoneName: zone.name,
            previousState,
            newState,
            supplyLevel: newSupplyLevel
          }));

          if (newState === 'collapsed') {
            await this.db.updateZone(zone.id, { ownerId: null });
            events.push(await this.recordEvent('zone_captured', null, 'system', {
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

  private async processShipments(tick: number): Promise<GameEvent[]> {
    const events: GameEvent[] = [];
    const shipments = await this.db.getActiveShipments();

    for (const shipment of shipments) {
      const newTicks = shipment.ticksToNextZone - 1;

      if (newTicks <= 0) {
        const newPosition = shipment.currentPosition + 1;

        if (newPosition >= shipment.path.length) {
          await this.completeShipment(shipment, tick, events);
        } else {
          const fromZoneId = shipment.path[shipment.currentPosition];
          const toZoneId = shipment.path[newPosition];
          const intercepted = await this.checkInterception(shipment, fromZoneId, toZoneId, tick);

          if (intercepted) {
            await this.interceptShipment(shipment, tick, events);
          } else {
            const route = await this.findRoute(fromZoneId, toZoneId);
            const spec = SHIPMENT_SPECS[shipment.type];
            const ticksToNext = route
              ? Math.ceil(route.distance * spec.speedModifier)
              : 1;

            await this.db.updateShipment(shipment.id, {
              currentPosition: newPosition,
              ticksToNextZone: ticksToNext
            });

            events.push(await this.recordEvent('shipment_moved', shipment.playerId, 'player', {
              shipmentId: shipment.id,
              fromZone: fromZoneId,
              toZone: toZoneId,
              position: newPosition,
              totalLegs: shipment.path.length - 1
            }));
          }
        }
      } else {
        await this.db.updateShipment(shipment.id, { ticksToNextZone: newTicks });
      }
    }

    return events;
  }

  private async completeShipment(shipment: Shipment, tick: number, events: GameEvent[]): Promise<void> {
    const destinationId = shipment.path[shipment.path.length - 1];
    const player = await this.db.getPlayer(shipment.playerId);

    if (player) {
      const newInventory = { ...player.inventory };
      for (const [resource, amount] of Object.entries(shipment.cargo)) {
        if (amount && resource in newInventory) {
          (newInventory as any)[resource] += amount;
        }
      }
      await this.db.updatePlayer(player.id, { inventory: newInventory, locationId: destinationId });

      // Award reputation for successful delivery
      await this.awardReputation(player.id, REPUTATION_REWARDS.shipmentDelivered, 'shipment_delivered');

      // Track season score
      const season = await this.db.getSeasonInfo();
      await this.db.incrementSeasonScore(
        season.seasonNumber,
        player.id,
        'player',
        player.name,
        'shipmentsCompleted',
        1
      );
    }

    await this.db.updateShipment(shipment.id, { status: 'arrived' });

    events.push(await this.recordEvent('shipment_arrived', shipment.playerId, 'player', {
      shipmentId: shipment.id,
      destination: destinationId,
      cargo: shipment.cargo
    }));
  }

  private async checkInterception(shipment: Shipment, fromZoneId: string, toZoneId: string, tick: number): Promise<boolean> {
    const route = await this.findRoute(fromZoneId, toZoneId);
    if (!route) return false;

    const spec = SHIPMENT_SPECS[shipment.type];
    let interceptionChance = route.baseRisk * route.chokepointRating * spec.visibilityModifier;

    const raiders = await this.getRaidersOnRoute(route.id);
    const totalRaiderStrength = raiders.reduce((sum, r) => sum + r.strength, 0);

    if (totalRaiderStrength > 0) {
      interceptionChance += totalRaiderStrength * 0.05;
    }

    let totalEscortStrength = 0;
    for (const id of shipment.escortIds) {
      const unit = await this.db.getUnit(id);
      totalEscortStrength += unit?.strength || 0;
    }

    if (totalEscortStrength >= totalRaiderStrength) {
      interceptionChance *= Math.max(0.1, 1 - totalEscortStrength * 0.1);
    } else {
      interceptionChance *= Math.max(0.2, 1 - (totalEscortStrength - totalRaiderStrength) * 0.05);
    }

    // Front efficiency: destination zone's raid resistance reduces interception
    const destZone = await this.db.getZone(toZoneId);
    if (destZone && destZone.ownerId) {
      const efficiency = getZoneEfficiency(
        destZone.supplyLevel, destZone.complianceStreak,
        destZone.medkitStockpile, destZone.commsStockpile
      );
      // raidResistance > 1.0 reduces chance, < 1.0 increases it
      interceptionChance /= Math.max(0.1, efficiency.raidResistance);
    }

    interceptionChance = Math.min(0.95, interceptionChance);

    return Math.random() < interceptionChance;
  }

  private async getRaidersOnRoute(routeId: string): Promise<Unit[]> {
    const allPlayers = await this.db.getAllPlayers();
    const raiders: Unit[] = [];

    for (const player of allPlayers) {
      const units = await this.db.getPlayerUnits(player.id);
      for (const unit of units) {
        if (unit.type === 'raider' && unit.assignmentId === routeId) {
          raiders.push(unit);
        }
      }
    }

    return raiders;
  }

  private async interceptShipment(shipment: Shipment, tick: number, events: GameEvent[]): Promise<void> {
    const fromZoneId = shipment.path[shipment.currentPosition];
    const toZoneId = shipment.path[shipment.currentPosition + 1];
    const route = await this.findRoute(fromZoneId, toZoneId);

    const escorts: Unit[] = [];
    for (const id of shipment.escortIds) {
      const unit = await this.db.getUnit(id);
      if (unit) escorts.push(unit);
    }

    const raiders = route ? await this.getRaidersOnRoute(route.id) : [];

    const totalEscortStrength = escorts.reduce((sum, u) => sum + u.strength, 0);
    const totalRaiderStrength = raiders.reduce((sum, u) => sum + u.strength, 0);

    // Medkit bonus: zone's medkit stockpile reduces effective raider strength
    const destZone = await this.db.getZone(toZoneId);
    let medkitBonus = 0;
    if (destZone) {
      const efficiency = getZoneEfficiency(
        destZone.supplyLevel, destZone.complianceStreak,
        destZone.medkitStockpile, destZone.commsStockpile
      );
      medkitBonus = efficiency.medkitBonus;
    }

    // Effective escort strength boosted by medkit bonus (up to +50%)
    const effectiveEscortStrength = totalEscortStrength * (1 + medkitBonus);

    let cargoLossPct = 0.5;
    const combatEvents: any[] = [];

    if (totalRaiderStrength > 0 && effectiveEscortStrength > 0) {
      const escortAdvantage = effectiveEscortStrength - totalRaiderStrength;

      if (escortAdvantage > 10) {
        cargoLossPct = 0.1;
        for (const raider of raiders.slice(0, Math.floor(raiders.length / 2))) {
          await this.db.deleteUnit(raider.id);
          combatEvents.push({ type: 'raider_destroyed', unitId: raider.id });
        }
      } else if (escortAdvantage > 0) {
        cargoLossPct = 0.25;
      } else if (escortAdvantage > -10) {
        cargoLossPct = 0.5;
        for (const escort of escorts.slice(0, 1)) {
          await this.db.deleteUnit(escort.id);
          combatEvents.push({ type: 'escort_destroyed', unitId: escort.id });
        }
      } else {
        cargoLossPct = 0.75;
        for (const escort of escorts.slice(0, Math.ceil(escorts.length * 0.75))) {
          await this.db.deleteUnit(escort.id);
          combatEvents.push({ type: 'escort_destroyed', unitId: escort.id });
        }
      }

      events.push(await this.recordEvent('combat_resolved', null, 'system', {
        location: fromZoneId,
        escortStrength: totalEscortStrength,
        raiderStrength: totalRaiderStrength,
        outcome: escortAdvantage > 0 ? 'escort_victory' : 'raider_victory',
        casualties: combatEvents
      }));
    }

    const lostCargo: Partial<Inventory> = {};
    const remainingCargo: Partial<Inventory> = {};
    for (const [resource, amount] of Object.entries(shipment.cargo)) {
      if (amount) {
        const lost = Math.floor(amount * cargoLossPct);
        lostCargo[resource as keyof Inventory] = lost;
        remainingCargo[resource as keyof Inventory] = amount - lost;
      }
    }

    const survivingEscorts: string[] = [];
    for (const id of shipment.escortIds) {
      const unit = await this.db.getUnit(id);
      if (unit) survivingEscorts.push(id);
    }

    if (cargoLossPct < 1 && Object.values(remainingCargo).some(v => v && v > 0)) {
      await this.db.updateShipment(shipment.id, { escortIds: survivingEscorts });

      // Partial loss - smaller reputation penalty
      await this.awardReputation(shipment.playerId, Math.floor(REPUTATION_REWARDS.shipmentIntercepted / 2), 'shipment_partial_loss');

      events.push(await this.recordEvent('shipment_intercepted', shipment.playerId, 'player', {
        shipmentId: shipment.id,
        lostCargo,
        remainingCargo,
        location: fromZoneId,
        outcome: 'partial_loss',
        cargoLossPct: Math.round(cargoLossPct * 100)
      }));
    } else {
      await this.db.updateShipment(shipment.id, { status: 'intercepted' });

      // Total loss - full reputation penalty
      await this.awardReputation(shipment.playerId, REPUTATION_REWARDS.shipmentIntercepted, 'shipment_total_loss');

      events.push(await this.recordEvent('shipment_intercepted', shipment.playerId, 'player', {
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

  private async processUnitMaintenance(tick: number): Promise<GameEvent[]> {
    const events: GameEvent[] = [];
    const players = await this.db.getAllPlayers();

    for (const player of players) {
      const units = await this.db.getPlayerUnits(player.id);
      let totalMaintenance = 0;

      for (const unit of units) {
        totalMaintenance += unit.maintenance;
      }

      if (totalMaintenance > 0 && player.inventory.credits >= totalMaintenance) {
        const newInventory = { ...player.inventory };
        newInventory.credits -= totalMaintenance;
        await this.db.updatePlayer(player.id, { inventory: newInventory });
      } else if (totalMaintenance > player.inventory.credits) {
        if (units.length > 0) {
          const unitToDelete = units[0];
          await this.db.deleteUnit(unitToDelete.id);
          events.push(await this.recordEvent('player_action', player.id, 'player', {
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

  private async processContractExpiration(tick: number): Promise<GameEvent[]> {
    const events: GameEvent[] = [];
    const contracts = await this.db.getOpenContracts();

    for (const contract of contracts) {
      if (contract.deadline < tick && contract.status === 'open') {
        await this.db.updateContract(contract.id, { status: 'expired' });
      } else if (contract.deadline < tick && contract.status === 'active') {
        await this.db.updateContract(contract.id, { status: 'failed' });
        events.push(await this.recordEvent('contract_failed', contract.acceptedBy, 'player', {
          contractId: contract.id,
          reason: 'deadline_missed'
        }));
      }
    }

    return events;
  }

  // ============================================================================
  // DAILY RESET & FIELD REGENERATION
  // ============================================================================

  private async resetDailyActions(): Promise<void> {
    const players = await this.db.getAllPlayers();
    for (const player of players) {
      await this.db.updatePlayer(player.id, { actionsToday: 0 });
    }
  }

  private async processFieldRegeneration(tick: number): Promise<void> {
    const zones = await this.db.getAllZones();

    for (const zone of zones) {
      if (zone.type !== 'field') continue;

      const resource = getFieldResource(zone.name);
      if (!resource) continue;

      const maxStockpile = 1000;
      const regenAmount = Math.floor(zone.productionCapacity / 10);
      const currentAmount = (zone.inventory as any)[resource] || 0;

      if (currentAmount < maxStockpile) {
        const newAmount = Math.min(maxStockpile, currentAmount + regenAmount);
        const newInventory = { ...zone.inventory };
        (newInventory as any)[resource] = newAmount;
        await this.db.updateZone(zone.id, { inventory: newInventory });
      }
    }
  }

  private async processStockpileDecay(tick: number): Promise<void> {
    const zones = await this.db.getAllZones();

    for (const zone of zones) {
      const updates: Partial<Zone> = {};

      // Medkits decay 1 per 10 ticks
      if (zone.medkitStockpile > 0) {
        updates.medkitStockpile = Math.max(0, zone.medkitStockpile - 1);
      }

      // Comms decay 1 per 20 ticks (called every 10, so decay every other call)
      if (zone.commsStockpile > 0 && tick % 20 === 0) {
        updates.commsStockpile = Math.max(0, zone.commsStockpile - 1);
      }

      if (Object.keys(updates).length > 0) {
        await this.db.updateZone(zone.id, updates);
      }
    }
  }

  // ============================================================================
  // PLAYER ACTIONS
  // ============================================================================

  async canPlayerAct(playerId: string): Promise<{ allowed: boolean; reason?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { allowed: false, reason: 'Player not found' };

    const tick = await this.db.getCurrentTick();
    const limits = TIER_LIMITS[player.tier];

    if (player.actionsToday >= limits.dailyActions) {
      return { allowed: false, reason: `Daily action limit (${limits.dailyActions}) reached` };
    }

    if (player.lastActionTick >= tick) {
      return { allowed: false, reason: 'Rate limited. Wait for next tick.' };
    }

    return { allowed: true };
  }

  async recordPlayerAction(playerId: string): Promise<void> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return;

    const tick = await this.db.getCurrentTick();
    await this.db.updatePlayer(playerId, {
      actionsToday: player.actionsToday + 1,
      lastActionTick: tick
    });
  }

  async createShipmentWithPath(
    playerId: string,
    type: 'courier' | 'freight' | 'convoy',
    path: string[],
    cargo: Partial<Inventory>
  ): Promise<{ success: boolean; shipment?: Shipment; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (path.length < 2) {
      return { success: false, error: 'Path must have at least origin and destination' };
    }

    const fromZoneId = path[0];
    const toZoneId = path[path.length - 1];

    if (!player.licenses[type]) {
      return { success: false, error: `No ${type} license` };
    }

    if (player.locationId !== fromZoneId) {
      return { success: false, error: 'Must be at origin zone' };
    }

    const spec = SHIPMENT_SPECS[type];
    const totalCargo = Object.values(cargo).reduce((sum, v) => sum + (v || 0), 0);
    if (totalCargo > spec.capacity) {
      return { success: false, error: `Cargo (${totalCargo}) exceeds ${type} capacity (${spec.capacity})` };
    }

    for (const [resource, amount] of Object.entries(cargo)) {
      if (amount && (player.inventory as any)[resource] < amount) {
        return { success: false, error: `Insufficient ${resource}` };
      }
    }

    for (let i = 0; i < path.length - 1; i++) {
      const routes = await this.db.getRoutesBetween(path[i], path[i + 1]);
      if (routes.length === 0) {
        return { success: false, error: `No direct route for leg ${i + 1}` };
      }
    }

    const firstRoutes = await this.db.getRoutesBetween(path[0], path[1]);
    const firstRoute = firstRoutes[0];
    const ticksToNext = Math.ceil(firstRoute.distance * spec.speedModifier);

    const newInventory = { ...player.inventory };
    for (const [resource, amount] of Object.entries(cargo)) {
      if (amount) {
        (newInventory as any)[resource] -= amount;
      }
    }
    await this.db.updatePlayer(playerId, { inventory: newInventory });

    const tick = await this.db.getCurrentTick();
    const shipment = await this.db.createShipment({
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

    await this.recordPlayerAction(playerId);

    await this.recordEvent('shipment_created', playerId, 'player', {
      shipmentId: shipment.id,
      type,
      path,
      from: fromZoneId,
      to: toZoneId,
      cargo
    });

    return { success: true, shipment };
  }

  async placeOrder(
    playerId: string,
    zoneId: string,
    resource: Resource,
    side: 'buy' | 'sell',
    price: number,
    quantity: number
  ): Promise<{ success: boolean; order?: MarketOrder; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (player.locationId !== zoneId) {
      return { success: false, error: 'Must be at zone to trade' };
    }

    const limits = TIER_LIMITS[player.tier];
    const allOrders = await this.db.getOrdersForZone(zoneId);
    const existingOrders = allOrders.filter(o => o.playerId === playerId);
    if (existingOrders.length >= limits.marketOrders) {
      return { success: false, error: `Order limit (${limits.marketOrders}) reached` };
    }

    if (side === 'sell') {
      if ((player.inventory as any)[resource] < quantity) {
        return { success: false, error: `Insufficient ${resource}` };
      }
      const newInventory = { ...player.inventory };
      (newInventory as any)[resource] -= quantity;
      await this.db.updatePlayer(playerId, { inventory: newInventory });
    } else {
      const totalCost = price * quantity;
      if (player.inventory.credits < totalCost) {
        return { success: false, error: 'Insufficient credits' };
      }
      const newInventory = { ...player.inventory };
      newInventory.credits -= totalCost;
      await this.db.updatePlayer(playerId, { inventory: newInventory });
    }

    const tick = await this.db.getCurrentTick();
    const order = await this.db.createOrder({
      playerId,
      zoneId,
      resource,
      side,
      price,
      quantity,
      originalQuantity: quantity,
      createdAt: tick
    });

    await this.recordPlayerAction(playerId);
    await this.matchOrders(zoneId, resource);

    await this.recordEvent('order_placed', playerId, 'player', {
      orderId: order.id,
      resource,
      side,
      price,
      quantity
    });

    return { success: true, order };
  }

  private async matchOrders(zoneId: string, resource: Resource): Promise<void> {
    const orders = await this.db.getOrdersForZone(zoneId, resource);
    const buys = orders.filter(o => o.side === 'buy').sort((a, b) => b.price - a.price);
    const sells = orders.filter(o => o.side === 'sell').sort((a, b) => a.price - b.price);

    for (const buy of buys) {
      for (const sell of sells) {
        if (buy.price >= sell.price && buy.quantity > 0 && sell.quantity > 0) {
          const tradeQty = Math.min(buy.quantity, sell.quantity);
          const tradePrice = sell.price;
          await this.executeTrade(buy, sell, tradeQty, tradePrice);
        }
      }
    }
  }

  private async executeTrade(buyOrder: MarketOrder, sellOrder: MarketOrder, quantity: number, price: number): Promise<void> {
    await this.db.updateOrder(buyOrder.id, buyOrder.quantity - quantity);
    await this.db.updateOrder(sellOrder.id, sellOrder.quantity - quantity);

    const buyer = await this.db.getPlayer(buyOrder.playerId);
    if (buyer) {
      const newInventory = { ...buyer.inventory };
      (newInventory as any)[buyOrder.resource] += quantity;
      const refund = (buyOrder.price - price) * quantity;
      newInventory.credits += refund;
      await this.db.updatePlayer(buyer.id, { inventory: newInventory });
    }

    const seller = await this.db.getPlayer(sellOrder.playerId);
    if (seller) {
      const newInventory = { ...seller.inventory };
      newInventory.credits += price * quantity;
      await this.db.updatePlayer(seller.id, { inventory: newInventory });
    }

    await this.recordEvent('trade_executed', null, 'system', {
      zoneId: buyOrder.zoneId,
      resource: buyOrder.resource,
      buyerId: buyOrder.playerId,
      sellerId: sellOrder.playerId,
      price,
      quantity
    });
  }

  async depositSU(playerId: string, zoneId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const zone = await this.db.getZone(zoneId);
    if (!zone) return { success: false, error: 'Zone not found' };

    if (player.locationId !== zoneId) {
      return { success: false, error: 'Must be at zone' };
    }

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

    const newInventory = { ...player.inventory };
    newInventory.rations -= needed.rations;
    newInventory.fuel -= needed.fuel;
    newInventory.parts -= needed.parts;
    newInventory.ammo -= needed.ammo;
    await this.db.updatePlayer(playerId, { inventory: newInventory });

    await this.db.updateZone(zoneId, { suStockpile: zone.suStockpile + amount });

    await this.recordPlayerAction(playerId);

    await this.recordEvent('zone_supplied', playerId, 'player', {
      zoneId,
      amount,
      newStockpile: zone.suStockpile + amount
    });

    return { success: true };
  }

  async depositStockpile(
    playerId: string,
    zoneId: string,
    resource: 'medkits' | 'comms',
    amount: number
  ): Promise<{ success: boolean; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const zone = await this.db.getZone(zoneId);
    if (!zone) return { success: false, error: 'Zone not found' };

    if (player.locationId !== zoneId) {
      return { success: false, error: 'Must be at zone' };
    }

    if (!zone.ownerId) {
      return { success: false, error: 'Zone must be controlled by a faction' };
    }

    if ((player.inventory as any)[resource] < amount) {
      return { success: false, error: `Insufficient ${resource}. Have ${(player.inventory as any)[resource]}, need ${amount}` };
    }

    const newInventory = { ...player.inventory };
    (newInventory as any)[resource] -= amount;
    await this.db.updatePlayer(playerId, { inventory: newInventory });

    const fieldName = resource === 'medkits' ? 'medkitStockpile' : 'commsStockpile';
    const currentStockpile = resource === 'medkits' ? zone.medkitStockpile : zone.commsStockpile;
    await this.db.updateZone(zoneId, { [fieldName]: currentStockpile + amount });

    await this.recordPlayerAction(playerId);

    await this.recordEvent('stockpile_deposited', playerId, 'player', {
      zoneId,
      zoneName: zone.name,
      resource,
      amount,
      newStockpile: currentStockpile + amount
    });

    return { success: true };
  }

  async getZoneEfficiency(zoneId: string): Promise<{
    success: boolean;
    efficiency?: ReturnType<typeof getZoneEfficiency>;
    error?: string;
  }> {
    const zone = await this.db.getZone(zoneId);
    if (!zone) return { success: false, error: 'Zone not found' };

    const efficiency = getZoneEfficiency(
      zone.supplyLevel, zone.complianceStreak,
      zone.medkitStockpile, zone.commsStockpile
    );

    return { success: true, efficiency };
  }

  async scan(playerId: string, targetType: 'zone' | 'route', targetId: string): Promise<{ success: boolean; intel?: any; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const tick = await this.db.getCurrentTick();
    let data: Record<string, unknown> = {};

    if (targetType === 'zone') {
      const zone = await this.db.getZone(targetId);
      if (!zone) return { success: false, error: 'Zone not found' };

      let ownerName = null;
      if (zone.ownerId) {
        const ownerFaction = await this.db.getFaction(zone.ownerId);
        ownerName = ownerFaction ? `${ownerFaction.name} [${ownerFaction.tag}]` : zone.ownerId;
      }

      const orders = await this.db.getOrdersForZone(targetId);

      data = {
        name: zone.name,
        type: zone.type,
        owner: zone.ownerId,
        ownerName,
        supplyState: getSupplyState(zone.supplyLevel, zone.complianceStreak),
        supplyLevel: zone.supplyLevel,
        suStockpile: zone.suStockpile,
        burnRate: zone.burnRate,
        marketActivity: orders.length,
        garrisonLevel: zone.garrisonLevel,
        medkitStockpile: zone.medkitStockpile,
        commsStockpile: zone.commsStockpile,
        complianceStreak: zone.complianceStreak
      };
    } else {
      const route = await this.db.getRoute(targetId);
      if (!route) return { success: false, error: 'Route not found' };

      const shipments = await this.db.getActiveShipments();
      const routeShipments = shipments.filter(s =>
        s.path.includes(route.fromZoneId) && s.path.includes(route.toZoneId)
      );

      const raiders = await this.getRaidersOnRoute(route.id);

      data = {
        from: route.fromZoneId,
        to: route.toZoneId,
        distance: route.distance,
        baseRisk: route.baseRisk,
        chokepointRating: route.chokepointRating,
        activeShipments: routeShipments.length,
        raiderPresence: raiders.length > 0,
        raiderStrength: raiders.reduce((sum, r) => sum + r.strength, 0)
      };
    }

    // Comms defense: target zone's comms stockpile degrades scan quality
    let signalQuality = 100;
    if (targetType === 'zone') {
      const targetZone = await this.db.getZone(targetId);
      if (targetZone && targetZone.ownerId && targetZone.ownerId !== player.factionId) {
        const efficiency = getZoneEfficiency(
          targetZone.supplyLevel, targetZone.complianceStreak,
          targetZone.medkitStockpile, targetZone.commsStockpile
        );
        // commsDefense 0-0.5 reduces signal quality proportionally
        signalQuality = Math.round(100 * (1 - efficiency.commsDefense));
      }
    }

    await this.db.createIntel({
      playerId,
      factionId: player.factionId,
      targetType,
      targetId,
      gatheredAt: tick,
      data,
      signalQuality
    });

    await this.recordPlayerAction(playerId);

    await this.recordEvent('intel_gathered', playerId, 'player', {
      targetType,
      targetId,
      signalQuality,
      sharedWithFaction: !!player.factionId
    });

    return { success: true, intel: data };
  }

  async produce(
    playerId: string,
    output: string,
    quantity: number
  ): Promise<{ success: boolean; produced?: number; units?: Unit[]; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const zone = await this.db.getZone(player.locationId);
    if (!zone) return { success: false, error: 'Zone not found' };

    if (zone.type !== 'factory') {
      return { success: false, error: 'Can only produce at Factories' };
    }

    const recipe = RECIPES[output];
    if (!recipe) {
      return { success: false, error: `Unknown product: ${output}` };
    }

    for (const [resource, needed] of Object.entries(recipe.inputs)) {
      const totalNeeded = (needed || 0) * quantity;
      if ((player.inventory as any)[resource] < totalNeeded) {
        return { success: false, error: `Insufficient ${resource}. Need ${totalNeeded}, have ${(player.inventory as any)[resource]}` };
      }
    }

    const newInventory = { ...player.inventory };
    for (const [resource, needed] of Object.entries(recipe.inputs)) {
      (newInventory as any)[resource] -= (needed || 0) * quantity;
    }

    // Production bonus from zone efficiency (fortified/high-streak zones produce more)
    const efficiency = getZoneEfficiency(
      zone.supplyLevel, zone.complianceStreak,
      zone.medkitStockpile, zone.commsStockpile
    );
    const bonusQuantity = Math.floor(quantity * efficiency.productionBonus);
    const totalOutput = quantity + bonusQuantity;

    if (recipe.isUnit) {
      await this.db.updatePlayer(playerId, { inventory: newInventory });

      const units: Unit[] = [];
      const unitType = output as 'escort' | 'raider';

      for (let i = 0; i < totalOutput; i++) {
        const unit = await this.db.createUnit({
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

      await this.recordPlayerAction(playerId);

      await this.recordEvent('player_action', playerId, 'player', {
        action: 'produce_unit',
        unitType,
        quantity: totalOutput,
        bonusFromEfficiency: bonusQuantity,
        zone: zone.name
      });

      return { success: true, produced: totalOutput, units };
    }

    (newInventory as any)[output] += totalOutput;
    await this.db.updatePlayer(playerId, { inventory: newInventory });

    await this.recordPlayerAction(playerId);

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'produce',
      output,
      quantity: totalOutput,
      bonusFromEfficiency: bonusQuantity,
      zone: zone.name
    });

    return { success: true, produced: totalOutput };
  }

  async extract(
    playerId: string,
    quantity: number
  ): Promise<{ success: boolean; extracted?: { resource: string; amount: number }; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const zone = await this.db.getZone(player.locationId);
    if (!zone) return { success: false, error: 'Zone not found' };

    if (zone.type !== 'field') {
      return { success: false, error: 'Can only extract at Fields' };
    }

    const resource = getFieldResource(zone.name);
    if (!resource) {
      return { success: false, error: 'This field has no extractable resources' };
    }

    if ((zone.inventory as any)[resource] < quantity) {
      return { success: false, error: `Insufficient ${resource} in field. Available: ${(zone.inventory as any)[resource]}` };
    }

    const extractionCost = 5 * quantity;
    if (player.inventory.credits < extractionCost) {
      return { success: false, error: `Insufficient credits. Extraction costs ${extractionCost} cr` };
    }

    const newZoneInventory = { ...zone.inventory };
    (newZoneInventory as any)[resource] -= quantity;
    await this.db.updateZone(zone.id, { inventory: newZoneInventory });

    const newPlayerInventory = { ...player.inventory };
    (newPlayerInventory as any)[resource] += quantity;
    newPlayerInventory.credits -= extractionCost;
    await this.db.updatePlayer(playerId, { inventory: newPlayerInventory });

    await this.recordPlayerAction(playerId);

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'extract',
      resource,
      quantity,
      zone: zone.name
    });

    return { success: true, extracted: { resource, amount: quantity } };
  }

  async captureZone(playerId: string, zoneId: string): Promise<{ success: boolean; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Must be in a faction to capture zones' };
    }

    const zone = await this.db.getZone(zoneId);
    if (!zone) return { success: false, error: 'Zone not found' };

    if (player.locationId !== zoneId) {
      return { success: false, error: 'Must be at the zone to capture it' };
    }

    if (zone.ownerId) {
      if (zone.ownerId === player.factionId) {
        return { success: false, error: 'Zone already controlled by your faction' };
      }

      // Front efficiency: capture defense check
      const efficiency = getZoneEfficiency(
        zone.supplyLevel, zone.complianceStreak,
        zone.medkitStockpile, zone.commsStockpile
      );

      // Fortified/supplied zones require supply collapse
      if (efficiency.captureDefense > 0 && zone.supplyLevel > 0) {
        return { success: false, error: 'Zone is defended. Supply must collapse before capture.' };
      }
    }

    await this.db.updateZone(zoneId, {
      ownerId: player.factionId,
      supplyLevel: 0,
      complianceStreak: 0,
      medkitStockpile: 0,
      commsStockpile: 0
    });

    await this.recordPlayerAction(playerId);

    await this.recordEvent('zone_captured', player.factionId, 'faction', {
      zoneId,
      zoneName: zone.name,
      previousOwner: zone.ownerId,
      newOwner: player.factionId,
      capturedBy: playerId
    });

    return { success: true };
  }

  async assignEscort(playerId: string, unitId: string, shipmentId: string): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const unit = await this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.playerId !== playerId) {
      return { success: false, error: 'Not your unit' };
    }

    if (unit.type !== 'escort') {
      return { success: false, error: 'Only escort units can be assigned to shipments' };
    }

    const shipment = await this.db.getShipment(shipmentId);
    if (!shipment) return { success: false, error: 'Shipment not found' };

    if (shipment.playerId !== playerId) {
      return { success: false, error: 'Not your shipment' };
    }

    if (shipment.status !== 'in_transit') {
      return { success: false, error: 'Shipment not in transit' };
    }

    const newEscorts = [...shipment.escortIds, unitId];
    await this.db.updateShipment(shipmentId, { escortIds: newEscorts });
    await this.db.updateUnit(unitId, { assignmentId: shipmentId });

    return { success: true };
  }

  async listUnitForSale(playerId: string, unitId: string, price: number): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const unit = await this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.playerId !== playerId) {
      return { success: false, error: 'Not your unit' };
    }

    if (unit.assignmentId) {
      return { success: false, error: 'Unit is currently assigned. Unassign first.' };
    }

    const zone = await this.db.getZone(unit.locationId);
    if (!zone || zone.type !== 'hub') {
      return { success: false, error: 'Units can only be sold at Hubs' };
    }

    if (price < 1) {
      return { success: false, error: 'Price must be at least 1 credit' };
    }

    await this.db.updateUnit(unitId, { forSalePrice: price });

    return { success: true };
  }

  async unlistUnit(playerId: string, unitId: string): Promise<{ success: boolean; error?: string }> {
    const unit = await this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.playerId !== playerId) {
      return { success: false, error: 'Not your unit' };
    }

    await this.db.updateUnit(unitId, { forSalePrice: null });

    return { success: true };
  }

  async hireUnit(playerId: string, unitId: string): Promise<{ success: boolean; unit?: Unit; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const unit = await this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.forSalePrice === null) {
      return { success: false, error: 'Unit is not for sale' };
    }

    if (unit.playerId === playerId) {
      return { success: false, error: 'Cannot buy your own unit' };
    }

    if (player.locationId !== unit.locationId) {
      return { success: false, error: 'Must be at the same Hub as the unit' };
    }

    const price = unit.forSalePrice;

    if (player.inventory.credits < price) {
      return { success: false, error: `Insufficient credits. Need ${price}` };
    }

    const seller = await this.db.getPlayer(unit.playerId);
    if (seller) {
      const sellerInventory = { ...seller.inventory };
      sellerInventory.credits += price;
      await this.db.updatePlayer(seller.id, { inventory: sellerInventory });
    }

    const buyerInventory = { ...player.inventory };
    buyerInventory.credits -= price;
    await this.db.updatePlayer(playerId, { inventory: buyerInventory });

    await this.db.updateUnit(unitId, {
      playerId,
      forSalePrice: null
    });

    await this.recordPlayerAction(playerId);

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'hire_unit',
      unitId,
      unitType: unit.type,
      price,
      sellerId: unit.playerId
    });

    const updatedUnit = await this.db.getUnit(unitId);
    return { success: true, unit: updatedUnit || undefined };
  }

  async deployRaider(playerId: string, unitId: string, routeId: string): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const unit = await this.db.getUnit(unitId);
    if (!unit) return { success: false, error: 'Unit not found' };

    if (unit.playerId !== playerId) {
      return { success: false, error: 'Not your unit' };
    }

    if (unit.type !== 'raider') {
      return { success: false, error: 'Only raider units can interdict routes' };
    }

    const route = await this.db.getRoute(routeId);
    if (!route) return { success: false, error: 'Route not found' };

    await this.db.updateUnit(unitId, { assignmentId: routeId });

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'deploy_raider',
      unitId,
      routeId
    });

    return { success: true };
  }

  // ============================================================================
  // FACTION ACTIONS
  // ============================================================================

  async createFaction(playerId: string, name: string, tag: string): Promise<{ success: boolean; faction?: any; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (player.factionId) {
      return { success: false, error: 'Already in a faction' };
    }

    if (tag.length < 2 || tag.length > 5) {
      return { success: false, error: 'Tag must be 2-5 characters' };
    }

    const faction = await this.db.createFaction(name, tag.toUpperCase(), playerId);

    return { success: true, faction };
  }

  async joinFaction(playerId: string, factionId: string): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (player.factionId) {
      return { success: false, error: 'Already in a faction' };
    }

    const faction = await this.db.getFaction(factionId);
    if (!faction) return { success: false, error: 'Faction not found' };

    await this.db.addFactionMember(factionId, playerId);

    return { success: true };
  }

  async leaveFaction(playerId: string): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const faction = await this.db.getFaction(player.factionId);
    if (faction && faction.founderId === playerId) {
      return { success: false, error: 'Founder cannot leave. Transfer leadership first.' };
    }

    await this.db.removeFactionMember(player.factionId, playerId);

    return { success: true };
  }

  async getFactionIntel(playerId: string): Promise<{ success: boolean; intel?: IntelReportWithFreshness[]; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const intel = await this.db.getFactionIntelWithFreshness(player.factionId);

    return { success: true, intel };
  }

  // ============================================================================
  // FACTION MANAGEMENT
  // ============================================================================

  /**
   * Promote a faction member to a higher rank
   */
  async promoteFactionMember(
    playerId: string,
    targetPlayerId: string,
    newRank: FactionRank
  ): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const myRank = await this.db.getFactionMemberRank(player.factionId, playerId);
    if (!myRank) return { success: false, error: 'Could not determine your rank' };

    const permissions = FACTION_PERMISSIONS[myRank];
    if (!permissions.canPromote) {
      return { success: false, error: 'Insufficient permissions to promote members' };
    }

    const targetRank = await this.db.getFactionMemberRank(player.factionId, targetPlayerId);
    if (!targetRank) return { success: false, error: 'Target player not in your faction' };

    // Can only promote to officer (not founder)
    if (newRank === 'founder') {
      return { success: false, error: 'Cannot promote to founder. Transfer leadership instead.' };
    }

    // Can only promote from lower rank
    const rankOrder = { member: 0, officer: 1, founder: 2 };
    if (rankOrder[newRank] <= rankOrder[targetRank]) {
      return { success: false, error: 'Can only promote to a higher rank' };
    }

    await this.db.updateFactionMemberRank(player.factionId, targetPlayerId, newRank);

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'promote_member',
      targetPlayerId,
      newRank
    });

    return { success: true };
  }

  /**
   * Demote a faction member to a lower rank
   */
  async demoteFactionMember(
    playerId: string,
    targetPlayerId: string,
    newRank: FactionRank
  ): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const myRank = await this.db.getFactionMemberRank(player.factionId, playerId);
    if (!myRank) return { success: false, error: 'Could not determine your rank' };

    const permissions = FACTION_PERMISSIONS[myRank];
    if (!permissions.canDemote) {
      return { success: false, error: 'Insufficient permissions to demote members' };
    }

    const targetRank = await this.db.getFactionMemberRank(player.factionId, targetPlayerId);
    if (!targetRank) return { success: false, error: 'Target player not in your faction' };

    if (targetRank === 'founder') {
      return { success: false, error: 'Cannot demote the founder' };
    }

    // Can only demote to a lower rank
    const rankOrder = { member: 0, officer: 1, founder: 2 };
    if (rankOrder[newRank] >= rankOrder[targetRank]) {
      return { success: false, error: 'Can only demote to a lower rank' };
    }

    await this.db.updateFactionMemberRank(player.factionId, targetPlayerId, newRank);

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'demote_member',
      targetPlayerId,
      newRank
    });

    return { success: true };
  }

  /**
   * Kick a member from the faction
   */
  async kickFactionMember(playerId: string, targetPlayerId: string): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    if (playerId === targetPlayerId) {
      return { success: false, error: 'Cannot kick yourself. Use leave instead.' };
    }

    const myRank = await this.db.getFactionMemberRank(player.factionId, playerId);
    if (!myRank) return { success: false, error: 'Could not determine your rank' };

    const permissions = FACTION_PERMISSIONS[myRank];
    if (!permissions.canKick) {
      return { success: false, error: 'Insufficient permissions to kick members' };
    }

    const targetRank = await this.db.getFactionMemberRank(player.factionId, targetPlayerId);
    if (!targetRank) return { success: false, error: 'Target player not in your faction' };

    // Officers can only kick members, not other officers or founder
    if (myRank === 'officer' && targetRank !== 'member') {
      return { success: false, error: 'Officers can only kick members' };
    }

    if (targetRank === 'founder') {
      return { success: false, error: 'Cannot kick the founder' };
    }

    await this.db.removeFactionMember(player.factionId, targetPlayerId);

    await this.recordEvent('faction_left', targetPlayerId, 'player', {
      factionId: player.factionId,
      reason: 'kicked',
      kickedBy: playerId
    });

    return { success: true };
  }

  /**
   * Transfer faction leadership to another member
   */
  async transferFactionLeadership(playerId: string, targetPlayerId: string): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const faction = await this.db.getFaction(player.factionId);
    if (!faction) return { success: false, error: 'Faction not found' };

    if (faction.founderId !== playerId) {
      return { success: false, error: 'Only the founder can transfer leadership' };
    }

    const targetRank = await this.db.getFactionMemberRank(player.factionId, targetPlayerId);
    if (!targetRank) return { success: false, error: 'Target player not in your faction' };

    // Update ranks: new leader becomes founder, old leader becomes officer
    await this.db.updateFactionMemberRank(player.factionId, targetPlayerId, 'founder');
    await this.db.updateFactionMemberRank(player.factionId, playerId, 'officer');

    // Update faction founder
    await this.db.updateFaction(player.factionId, { founderId: targetPlayerId });

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'transfer_leadership',
      targetPlayerId,
      factionId: player.factionId
    });

    return { success: true };
  }

  /**
   * Deposit resources to faction treasury
   */
  async depositToTreasury(
    playerId: string,
    resources: Partial<Record<keyof Inventory, number>>
  ): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const faction = await this.db.getFaction(player.factionId);
    if (!faction) return { success: false, error: 'Faction not found' };

    // Verify player has enough resources
    for (const [resource, amount] of Object.entries(resources)) {
      if (amount && amount > 0) {
        if ((player.inventory as any)[resource] < amount) {
          return { success: false, error: `Insufficient ${resource}` };
        }
      }
    }

    // Transfer resources
    const newPlayerInventory = { ...player.inventory };
    const newTreasury = { ...faction.treasury };

    for (const [resource, amount] of Object.entries(resources)) {
      if (amount && amount > 0) {
        (newPlayerInventory as any)[resource] -= amount;
        (newTreasury as any)[resource] = ((newTreasury as any)[resource] || 0) + amount;
      }
    }

    await this.db.updatePlayer(playerId, { inventory: newPlayerInventory });
    await this.db.updateFaction(player.factionId, { treasury: newTreasury });

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'deposit_treasury',
      factionId: player.factionId,
      resources
    });

    return { success: true };
  }

  /**
   * Withdraw resources from faction treasury
   */
  async withdrawFromTreasury(
    playerId: string,
    resources: Partial<Record<keyof Inventory, number>>
  ): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const myRank = await this.db.getFactionMemberRank(player.factionId, playerId);
    if (!myRank) return { success: false, error: 'Could not determine your rank' };

    const permissions = FACTION_PERMISSIONS[myRank];
    if (!permissions.canWithdraw) {
      return { success: false, error: 'Insufficient permissions to withdraw from treasury' };
    }

    const faction = await this.db.getFaction(player.factionId);
    if (!faction) return { success: false, error: 'Faction not found' };

    // Calculate total credits being withdrawn
    const totalCredits = resources.credits || 0;

    // Officers have a withdrawal limit
    if (myRank === 'officer' && totalCredits > faction.officerWithdrawLimit) {
      return { success: false, error: `Officers can only withdraw ${faction.officerWithdrawLimit} credits at a time` };
    }

    // Verify treasury has enough resources
    for (const [resource, amount] of Object.entries(resources)) {
      if (amount && amount > 0) {
        if ((faction.treasury as any)[resource] < amount) {
          return { success: false, error: `Insufficient ${resource} in treasury` };
        }
      }
    }

    // Transfer resources
    const newPlayerInventory = { ...player.inventory };
    const newTreasury = { ...faction.treasury };

    for (const [resource, amount] of Object.entries(resources)) {
      if (amount && amount > 0) {
        (newPlayerInventory as any)[resource] = ((newPlayerInventory as any)[resource] || 0) + amount;
        (newTreasury as any)[resource] -= amount;
      }
    }

    await this.db.updatePlayer(playerId, { inventory: newPlayerInventory });
    await this.db.updateFaction(player.factionId, { treasury: newTreasury });

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'withdraw_treasury',
      factionId: player.factionId,
      resources
    });

    return { success: true };
  }

  /**
   * Get faction details (for members)
   */
  async getFactionDetails(playerId: string): Promise<{ success: boolean; faction?: Faction; myRank?: FactionRank; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const faction = await this.db.getFaction(player.factionId);
    if (!faction) return { success: false, error: 'Faction not found' };

    const myRank = await this.db.getFactionMemberRank(player.factionId, playerId);

    return { success: true, faction, myRank: myRank || 'member' };
  }

  // ============================================================================
  // LICENSE PROGRESSION
  // ============================================================================

  /**
   * Get available licenses and their requirements
   */
  async getLicenseStatus(playerId: string): Promise<{
    success: boolean;
    licenses?: {
      type: ShipmentType;
      unlocked: boolean;
      requirements: typeof LICENSE_REQUIREMENTS[ShipmentType];
      canUnlock: boolean;
    }[];
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const licenses = (['courier', 'freight', 'convoy'] as ShipmentType[]).map(type => {
      const requirements = LICENSE_REQUIREMENTS[type];
      const unlocked = player.licenses[type];
      const canUnlock = !unlocked &&
        player.reputation >= requirements.reputationRequired &&
        player.inventory.credits >= requirements.creditsCost;

      return {
        type,
        unlocked,
        requirements,
        canUnlock
      };
    });

    return { success: true, licenses };
  }

  // ============================================================================
  // REPUTATION MANAGEMENT
  // ============================================================================

  /**
   * Award reputation to a player (can be positive or negative)
   */
  private async awardReputation(playerId: string, amount: number, reason: string): Promise<void> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return;

    const newReputation = Math.max(0, Math.min(
      REPUTATION_REWARDS.maxReputation,
      player.reputation + amount
    ));

    await this.db.updatePlayer(playerId, { reputation: newReputation });

    if (amount !== 0) {
      await this.recordEvent('player_action', playerId, 'player', {
        action: 'reputation_change',
        change: amount,
        reason,
        newTotal: newReputation
      });
    }
  }

  /**
   * Get player reputation details
   */
  // ============================================================================
  // SEASONS & LEADERBOARDS
  // ============================================================================

  /**
   * Get current season information
   */
  async getSeasonStatus(): Promise<{
    seasonNumber: number;
    week: number;
    ticksUntilWeekEnd: number;
    ticksUntilSeasonEnd: number;
  }> {
    const tick = await this.db.getCurrentTick();
    const season = await this.db.getSeasonInfo();

    const ticksIntoSeason = tick % SEASON_CONFIG.ticksPerSeason;
    const ticksIntoWeek = tick % SEASON_CONFIG.ticksPerWeek;

    return {
      seasonNumber: season.seasonNumber,
      week: season.seasonWeek,
      ticksUntilWeekEnd: SEASON_CONFIG.ticksPerWeek - ticksIntoWeek,
      ticksUntilSeasonEnd: SEASON_CONFIG.ticksPerSeason - ticksIntoSeason
    };
  }

  /**
   * Get season leaderboard
   */
  async getLeaderboard(
    seasonNumber?: number,
    entityType?: 'player' | 'faction',
    limit: number = 50
  ): Promise<{ success: boolean; leaderboard?: SeasonScore[]; season?: number; error?: string }> {
    const season = seasonNumber || (await this.db.getSeasonInfo()).seasonNumber;
    const leaderboard = await this.db.getSeasonLeaderboard(season, entityType, limit);

    return { success: true, leaderboard, season };
  }

  /**
   * Get a player's season score
   */
  async getPlayerSeasonScore(playerId: string, seasonNumber?: number): Promise<{
    success: boolean;
    score?: SeasonScore | null;
    rank?: number;
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const season = seasonNumber || (await this.db.getSeasonInfo()).seasonNumber;
    const score = await this.db.getEntitySeasonScore(season, playerId);

    // Get rank
    let rank: number | undefined;
    if (score) {
      const leaderboard = await this.db.getSeasonLeaderboard(season, 'player', 1000);
      const entry = leaderboard.find(e => e.entityId === playerId);
      rank = entry?.rank;
    }

    return { success: true, score, rank };
  }

  async getReputationDetails(playerId: string): Promise<{
    success: boolean;
    reputation?: number;
    title?: string;
    nextTitle?: { title: string; threshold: number; remaining: number } | null;
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const title = getReputationTitle(player.reputation);

    // Find next title
    let nextTitle = null;
    for (const t of [
      { threshold: 25, title: 'Runner' },
      { threshold: 50, title: 'Trader' },
      { threshold: 100, title: 'Hauler' },
      { threshold: 200, title: 'Merchant' },
      { threshold: 350, title: 'Supplier' },
      { threshold: 500, title: 'Quartermaster' },
      { threshold: 700, title: 'Logistics Chief' },
      { threshold: 900, title: 'Supply Marshal' },
      { threshold: 1000, title: 'Legend' }
    ]) {
      if (player.reputation < t.threshold) {
        nextTitle = {
          title: t.title,
          threshold: t.threshold,
          remaining: t.threshold - player.reputation
        };
        break;
      }
    }

    return { success: true, reputation: player.reputation, title, nextTitle };
  }

  /**
   * Unlock a license for a player
   */
  async unlockLicense(playerId: string, licenseType: ShipmentType): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (player.licenses[licenseType]) {
      return { success: false, error: `${licenseType} license already unlocked` };
    }

    const requirements = LICENSE_REQUIREMENTS[licenseType];

    if (player.reputation < requirements.reputationRequired) {
      return { success: false, error: `Need ${requirements.reputationRequired} reputation (you have ${player.reputation})` };
    }

    if (player.inventory.credits < requirements.creditsCost) {
      return { success: false, error: `Need ${requirements.creditsCost} credits (you have ${player.inventory.credits})` };
    }

    // Deduct cost and unlock license
    const newInventory = { ...player.inventory };
    newInventory.credits -= requirements.creditsCost;

    const newLicenses = { ...player.licenses };
    newLicenses[licenseType] = true;

    await this.db.updatePlayer(playerId, {
      inventory: newInventory,
      licenses: newLicenses
    });

    await this.recordEvent('player_action', playerId, 'player', {
      action: 'unlock_license',
      licenseType,
      cost: requirements.creditsCost
    });

    return { success: true };
  }

  /**
   * Get a player's personal intel with freshness decay applied
   */
  async getPlayerIntel(playerId: string, limit: number = 100): Promise<{ success: boolean; intel?: IntelReportWithFreshness[]; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const intel = await this.db.getPlayerIntelWithFreshness(playerId, limit);

    return { success: true, intel };
  }

  /**
   * Get the most recent intel on a specific target
   */
  async getTargetIntel(playerId: string, targetType: 'zone' | 'route', targetId: string): Promise<{ success: boolean; intel?: IntelReportWithFreshness | null; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const intel = await this.db.getTargetIntel(playerId, player.factionId, targetType, targetId);

    return { success: true, intel };
  }

  // ============================================================================
  // CONTRACTS
  // ============================================================================

  /**
   * Create a new contract
   */
  async createContract(
    playerId: string,
    type: ContractType,
    details: {
      fromZoneId?: string;
      toZoneId?: string;
      resource?: Resource;
      quantity?: number;
      targetType?: 'zone' | 'route';
      targetId?: string;
    },
    reward: number,
    deadline: number,
    bonus?: { deadline: number; credits: number }
  ): Promise<{ success: boolean; contract?: Contract; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Check player has enough credits for reward escrow
    const totalReward = reward + (bonus?.credits || 0);
    if (player.inventory.credits < totalReward) {
      return { success: false, error: `Insufficient credits to escrow reward. Need ${totalReward}` };
    }

    // Validate contract details based on type
    if (type === 'haul') {
      if (!details.fromZoneId || !details.toZoneId || !details.resource || !details.quantity) {
        return { success: false, error: 'Haul contract requires fromZoneId, toZoneId, resource, and quantity' };
      }
      const fromZone = await this.db.getZone(details.fromZoneId);
      const toZone = await this.db.getZone(details.toZoneId);
      if (!fromZone) return { success: false, error: 'From zone not found' };
      if (!toZone) return { success: false, error: 'To zone not found' };
    }

    if (type === 'supply') {
      if (!details.toZoneId || !details.quantity) {
        return { success: false, error: 'Supply contract requires toZoneId and quantity' };
      }
      const zone = await this.db.getZone(details.toZoneId);
      if (!zone) return { success: false, error: 'Zone not found' };
    }

    if (type === 'scout') {
      if (!details.targetType || !details.targetId) {
        return { success: false, error: 'Scout contract requires targetType and targetId' };
      }
      if (details.targetType === 'zone') {
        const zone = await this.db.getZone(details.targetId);
        if (!zone) return { success: false, error: 'Target zone not found' };
      } else {
        const route = await this.db.getRoute(details.targetId);
        if (!route) return { success: false, error: 'Target route not found' };
      }
    }

    // Escrow the reward from player
    const newInventory = { ...player.inventory };
    newInventory.credits -= totalReward;
    await this.db.updatePlayer(playerId, { inventory: newInventory });

    const tick = await this.db.getCurrentTick();

    const contract = await this.db.createContract({
      type,
      posterId: playerId,
      posterType: 'player',
      acceptedBy: null,
      details,
      deadline: tick + deadline,
      reward: { credits: reward, reputation: Math.floor(reward / 10) },
      bonus: bonus ? { deadline: tick + bonus.deadline, credits: bonus.credits } : undefined,
      status: 'open',
      createdAt: tick
    });

    await this.recordEvent('contract_posted', playerId, 'player', {
      contractId: contract.id,
      type,
      reward,
      deadline
    });

    return { success: true, contract };
  }

  /**
   * Accept a contract
   */
  async acceptContract(playerId: string, contractId: string): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const contract = await this.db.getContract(contractId);
    if (!contract) return { success: false, error: 'Contract not found' };

    if (contract.status !== 'open') {
      return { success: false, error: `Contract is ${contract.status}, not open` };
    }

    if (contract.posterId === playerId) {
      return { success: false, error: 'Cannot accept your own contract' };
    }

    // Check concurrent contract limit
    const playerContracts = await this.db.getPlayerContracts(playerId);
    const activeContracts = playerContracts.filter(c => c.acceptedBy === playerId && c.status === 'active');
    const limit = TIER_LIMITS[player.tier].concurrentContracts;

    if (activeContracts.length >= limit) {
      return { success: false, error: `Contract limit (${limit}) reached` };
    }

    await this.db.updateContract(contractId, { status: 'active', acceptedBy: playerId });

    await this.recordEvent('contract_accepted', playerId, 'player', {
      contractId,
      type: contract.type
    });

    return { success: true };
  }

  /**
   * Complete a contract (called when conditions are met)
   */
  async completeContract(
    playerId: string,
    contractId: string
  ): Promise<{ success: boolean; reward?: { credits: number; reputation: number }; bonus?: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const contract = await this.db.getContract(contractId);
    if (!contract) return { success: false, error: 'Contract not found' };

    if (contract.status !== 'active') {
      return { success: false, error: `Contract is ${contract.status}, not active` };
    }

    if (contract.acceptedBy !== playerId) {
      return { success: false, error: 'You have not accepted this contract' };
    }

    const tick = await this.db.getCurrentTick();

    // Verify contract completion based on type
    const verifyResult = await this.verifyContractCompletion(player, contract);
    if (!verifyResult.completed) {
      return { success: false, error: verifyResult.reason || 'Contract requirements not met' };
    }

    // Calculate reward
    let totalCredits = contract.reward.credits;
    let totalReputation = contract.reward.reputation;
    let bonusAwarded = false;

    if (contract.bonus && tick <= contract.bonus.deadline) {
      totalCredits += contract.bonus.credits;
      bonusAwarded = true;
    }

    // Pay the player
    const newInventory = { ...player.inventory };
    newInventory.credits += totalCredits;
    await this.db.updatePlayer(playerId, {
      inventory: newInventory,
      reputation: player.reputation + totalReputation
    });

    await this.db.updateContract(contractId, { status: 'completed' });

    await this.recordEvent('contract_completed', playerId, 'player', {
      contractId,
      type: contract.type,
      reward: totalCredits,
      reputation: totalReputation,
      bonus: bonusAwarded
    });

    return {
      success: true,
      reward: { credits: totalCredits, reputation: totalReputation },
      bonus: bonusAwarded
    };
  }

  /**
   * Cancel a contract (poster only, before acceptance)
   */
  async cancelContract(playerId: string, contractId: string): Promise<{ success: boolean; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const contract = await this.db.getContract(contractId);
    if (!contract) return { success: false, error: 'Contract not found' };

    if (contract.posterId !== playerId) {
      return { success: false, error: 'Only the poster can cancel' };
    }

    if (contract.status !== 'open') {
      return { success: false, error: 'Can only cancel open contracts' };
    }

    // Refund escrowed credits
    const refund = contract.reward.credits + (contract.bonus?.credits || 0);
    const newInventory = { ...player.inventory };
    newInventory.credits += refund;
    await this.db.updatePlayer(playerId, { inventory: newInventory });

    await this.db.updateContract(contractId, { status: 'expired' });

    return { success: true };
  }

  /**
   * Get contracts related to a player
   */
  async getMyContracts(playerId: string): Promise<{ success: boolean; contracts?: Contract[]; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const contracts = await this.db.getPlayerContracts(playerId);

    return { success: true, contracts };
  }

  /**
   * Verify if a contract's conditions have been met
   */
  private async verifyContractCompletion(
    player: Player,
    contract: Contract
  ): Promise<{ completed: boolean; reason?: string }> {
    const tick = await this.db.getCurrentTick();

    // Check deadline
    if (tick > contract.deadline) {
      return { completed: false, reason: 'Contract deadline has passed' };
    }

    switch (contract.type) {
      case 'haul': {
        // Player must be at destination with the required cargo
        if (player.locationId !== contract.details.toZoneId) {
          return { completed: false, reason: `Must be at destination zone` };
        }
        const resource = contract.details.resource;
        const quantity = contract.details.quantity || 0;
        if (resource && (player.inventory as any)[resource] < quantity) {
          return { completed: false, reason: `Need ${quantity} ${resource} in inventory` };
        }
        // Consume the cargo
        if (resource) {
          const newInventory = { ...player.inventory };
          (newInventory as any)[resource] -= quantity;
          await this.db.updatePlayer(player.id, { inventory: newInventory });
        }
        return { completed: true };
      }

      case 'supply': {
        // Check if zone has received the required SU since contract acceptance
        // For simplicity, we check if player is at zone with SU components
        if (player.locationId !== contract.details.toZoneId) {
          return { completed: false, reason: `Must be at destination zone` };
        }
        // Require player to deposit SU - this is handled by the depositSU action
        // For now, just verify they're at the zone
        return { completed: true };
      }

      case 'scout': {
        // Check if fresh intel exists for the target
        const targetIntel = await this.db.getTargetIntel(
          player.id,
          player.factionId,
          contract.details.targetType as 'zone' | 'route',
          contract.details.targetId as string
        );

        if (!targetIntel) {
          return { completed: false, reason: 'No intel gathered on target' };
        }

        // Intel must have been gathered after contract was accepted
        if (targetIntel.gatheredAt < contract.createdAt) {
          return { completed: false, reason: 'Intel was gathered before contract was accepted. Scan again.' };
        }

        // Intel must be fresh (not stale or expired)
        if (targetIntel.freshness !== 'fresh') {
          return { completed: false, reason: 'Intel is stale. Scan again for fresh intel.' };
        }

        return { completed: true };
      }

      default:
        return { completed: false, reason: 'Unknown contract type' };
    }
  }

  // ============================================================================
  // TRAVEL
  // ============================================================================

  async travel(playerId: string, toZoneId: string): Promise<{ success: boolean; error?: string }> {
    const canAct = await this.canPlayerAct(playerId);
    if (!canAct.allowed) return { success: false, error: canAct.reason };

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const toZone = await this.db.getZone(toZoneId);
    if (!toZone) return { success: false, error: 'Destination zone not found' };

    // Check direct route exists
    const routes = await this.db.getRoutesBetween(player.locationId, toZoneId);
    if (routes.length === 0) {
      return { success: false, error: 'No direct route to destination' };
    }

    await this.db.updatePlayer(playerId, { locationId: toZoneId });
    await this.recordPlayerAction(playerId);

    return { success: true };
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  private async findRoute(fromZoneId: string, toZoneId: string): Promise<Route | null> {
    const routes = await this.db.getRoutesBetween(fromZoneId, toZoneId);
    return routes.length > 0 ? routes[0] : null;
  }

  private async recordEvent(
    type: GameEvent['type'],
    actorId: string | null,
    actorType: 'player' | 'faction' | 'system',
    data: Record<string, unknown>
  ): Promise<GameEvent> {
    const tick = await this.db.getCurrentTick();
    return this.db.recordEvent({
      type,
      tick,
      timestamp: new Date(),
      actorId,
      actorType,
      data
    });
  }

  // ============================================================================
  // PHASE 2: ONBOARDING
  // ============================================================================

  async getTutorialStatus(playerId: string): Promise<{
    success: boolean;
    step?: number;
    total?: number;
    currentContract?: typeof TUTORIAL_CONTRACTS[number] | null;
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    return {
      success: true,
      step: player.tutorialStep,
      total: 5,
      currentContract: player.tutorialStep < 5 ? TUTORIAL_CONTRACTS[player.tutorialStep] : null
    };
  }

  async completeTutorialStep(playerId: string, step: number): Promise<{
    success: boolean;
    step?: number;
    reward?: { credits: number; reputation: number };
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (step !== player.tutorialStep + 1) {
      return { success: false, error: `Must complete step ${player.tutorialStep + 1} next` };
    }

    if (step < 1 || step > 5) {
      return { success: false, error: 'Invalid tutorial step' };
    }

    const contract = TUTORIAL_CONTRACTS[step - 1];
    const reward = contract.reward;

    // Award credits and reputation
    const newInventory = { ...player.inventory };
    newInventory.credits += reward.credits;
    await this.db.updatePlayer(playerId, {
      inventory: newInventory,
      tutorialStep: step,
      reputation: player.reputation + reward.reputation
    });

    await this.recordEvent('tutorial_completed', playerId, 'player', {
      step,
      reward
    });

    return { success: true, step, reward };
  }

  async ensureStarterFaction(): Promise<void> {
    const factions = await this.db.getAllFactions();
    const exists = factions.some(f => f.tag === 'FREE');
    if (!exists) {
      await this.db.createFaction('Freelancers', 'FREE', 'system');
    }
  }

  // ============================================================================
  // PHASE 5: DOCTRINES
  // ============================================================================

  async createDoctrine(playerId: string, title: string, content: string): Promise<{
    success: boolean;
    doctrine?: any;
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const rank = await this.db.getFactionMemberRank(player.factionId, playerId);
    if (!rank || (rank !== 'officer' && rank !== 'founder')) {
      return { success: false, error: 'Must be officer or founder to create doctrines' };
    }

    const doctrine = await this.db.createDoctrine(player.factionId, title, content, playerId);

    await this.db.createAuditLog(player.factionId, playerId, 'create_doctrine', {
      doctrineId: doctrine.id,
      title
    });

    return { success: true, doctrine };
  }

  async getFactionDoctrines(playerId: string): Promise<{
    success: boolean;
    doctrines?: any[];
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const doctrines = await this.db.getFactionDoctrines(player.factionId);
    return { success: true, doctrines };
  }

  async updateDoctrine(playerId: string, doctrineId: string, content: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const rank = await this.db.getFactionMemberRank(player.factionId, playerId);
    if (!rank || (rank !== 'officer' && rank !== 'founder')) {
      return { success: false, error: 'Must be officer or founder to update doctrines' };
    }

    await this.db.updateDoctrine(doctrineId, content);

    await this.db.createAuditLog(player.factionId, playerId, 'update_doctrine', {
      doctrineId
    });

    return { success: true };
  }

  async deleteDoctrine(playerId: string, doctrineId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const rank = await this.db.getFactionMemberRank(player.factionId, playerId);
    if (!rank || (rank !== 'officer' && rank !== 'founder')) {
      return { success: false, error: 'Must be officer or founder to delete doctrines' };
    }

    await this.db.deleteDoctrine(doctrineId);

    await this.db.createAuditLog(player.factionId, playerId, 'delete_doctrine', {
      doctrineId
    });

    return { success: true };
  }

  // ============================================================================
  // PHASE 5: ADVANCED MARKET ORDERS
  // ============================================================================

  async createConditionalOrder(
    playerId: string,
    zoneId: string,
    resource: string,
    side: string,
    triggerPrice: number,
    quantity: number,
    condition: string
  ): Promise<{ success: boolean; order?: any; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (player.tier !== 'operator' && player.tier !== 'command') {
      return { success: false, error: 'Conditional orders require Operator or Command tier' };
    }

    if (player.locationId !== zoneId) {
      return { success: false, error: 'Must be at the zone' };
    }

    const tick = await this.db.getCurrentTick();
    const order = await this.db.createConditionalOrder({
      playerId,
      zoneId,
      resource: resource as Resource,
      side: side as 'buy' | 'sell',
      triggerPrice,
      quantity,
      condition: condition as 'price_below' | 'price_above',
      status: 'active',
      createdAt: tick
    });

    return { success: true, order };
  }

  async createTimeWeightedOrder(
    playerId: string,
    zoneId: string,
    resource: string,
    side: string,
    price: number,
    totalQuantity: number,
    quantityPerTick: number
  ): Promise<{ success: boolean; order?: any; error?: string }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (player.tier !== 'command') {
      return { success: false, error: 'Time-weighted orders require Command tier' };
    }

    if (player.locationId !== zoneId) {
      return { success: false, error: 'Must be at the zone' };
    }

    const tick = await this.db.getCurrentTick();
    const order = await this.db.createTimeWeightedOrder({
      playerId,
      zoneId,
      resource: resource as Resource,
      side: side as 'buy' | 'sell',
      price,
      totalQuantity,
      remainingQuantity: totalQuantity,
      quantityPerTick,
      status: 'active',
      createdAt: tick
    });

    return { success: true, order };
  }

  async processConditionalOrders(tick: number): Promise<void> {
    const orders = await this.db.getActiveConditionalOrders();

    for (const order of orders) {
      const marketOrders = await this.db.getOrdersForZone(order.zoneId, order.resource);

      let bestPrice: number | null = null;
      if (order.side === 'buy') {
        // Looking at sell orders for best ask price
        const sells = marketOrders.filter(o => o.side === 'sell' && o.quantity > 0);
        if (sells.length > 0) {
          bestPrice = Math.min(...sells.map(o => o.price));
        }
      } else {
        // Looking at buy orders for best bid price
        const buys = marketOrders.filter(o => o.side === 'buy' && o.quantity > 0);
        if (buys.length > 0) {
          bestPrice = Math.max(...buys.map(o => o.price));
        }
      }

      if (bestPrice === null) continue;

      let conditionMet = false;
      if (order.condition === 'price_below' && bestPrice <= order.triggerPrice) {
        conditionMet = true;
      } else if (order.condition === 'price_above' && bestPrice >= order.triggerPrice) {
        conditionMet = true;
      }

      if (conditionMet) {
        await this.db.createOrder({
          playerId: order.playerId,
          zoneId: order.zoneId,
          resource: order.resource,
          side: order.side,
          price: order.triggerPrice,
          quantity: order.quantity,
          originalQuantity: order.quantity,
          createdAt: tick
        });

        await this.db.updateConditionalOrderStatus(order.id, 'triggered');
      }
    }
  }

  async processTimeWeightedOrders(tick: number): Promise<void> {
    const orders = await this.db.getActiveTimeWeightedOrders();

    for (const order of orders) {
      const qty = Math.min(order.quantityPerTick, order.remainingQuantity);
      if (qty <= 0) continue;

      await this.db.createOrder({
        playerId: order.playerId,
        zoneId: order.zoneId,
        resource: order.resource,
        side: order.side,
        price: order.price,
        quantity: qty,
        originalQuantity: qty,
        createdAt: tick
      });

      const newRemaining = order.remainingQuantity - qty;
      await this.db.updateTimeWeightedOrder(order.id, newRemaining);

      if (newRemaining <= 0) {
        await this.db.updateTimeWeightedOrder(order.id, 0);
      }
    }
  }

  private async processAdvancedOrders(tick: number): Promise<GameEvent[]> {
    const events: GameEvent[] = [];
    await this.processConditionalOrders(tick);
    await this.processTimeWeightedOrders(tick);
    return events;
  }

  // ============================================================================
  // PHASE 6: WEBHOOKS
  // ============================================================================

  async registerWebhook(playerId: string, url: string, events: string[]): Promise<{
    success: boolean;
    webhook?: any;
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (player.tier !== 'operator' && player.tier !== 'command') {
      return { success: false, error: 'Webhooks require Operator or Command tier' };
    }

    if (!url.startsWith('https://')) {
      return { success: false, error: 'Webhook URL must start with https://' };
    }

    const existing = await this.db.getPlayerWebhooks(playerId);
    if (existing.length >= 5) {
      return { success: false, error: 'Maximum 5 webhooks per player' };
    }

    const webhook = await this.db.createWebhook(playerId, url, events);
    return { success: true, webhook };
  }

  async getWebhooks(playerId: string): Promise<{
    success: boolean;
    webhooks?: any[];
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const webhooks = await this.db.getPlayerWebhooks(playerId);
    return { success: true, webhooks };
  }

  async deleteWebhook(playerId: string, webhookId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    await this.db.deleteWebhook(webhookId, playerId);
    return { success: true };
  }

  async triggerWebhooks(eventType: string, data: any): Promise<void> {
    const webhooks = await this.db.getWebhooksForEvent(eventType);

    for (const webhook of webhooks) {
      if (!webhook.active) continue;

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: eventType, data, timestamp: new Date().toISOString() })
        });

        if (response.ok) {
          const tick = await this.db.getCurrentTick();
          await this.db.updateWebhookStatus(webhook.id, tick, 0);
        } else {
          const newFailCount = webhook.failCount + 1;
          const tick = await this.db.getCurrentTick();
          await this.db.updateWebhookStatus(webhook.id, tick, newFailCount);
          if (newFailCount >= 5) {
            await this.db.updateWebhookStatus(webhook.id, tick, newFailCount);
          }
        }
      } catch {
        const newFailCount = webhook.failCount + 1;
        const tick = await this.db.getCurrentTick();
        await this.db.updateWebhookStatus(webhook.id, tick, newFailCount);
      }
    }
  }

  // ============================================================================
  // PHASE 6: DATA EXPORT
  // ============================================================================

  async exportPlayerData(playerId: string): Promise<{
    success: boolean;
    data?: {
      player: Player;
      units: Unit[];
      shipments: Shipment[];
      contracts: Contract[];
      intel: IntelReportWithFreshness[];
      events: GameEvent[];
    };
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const units = await this.db.getPlayerUnits(playerId);
    const shipments = await this.db.getPlayerShipments(playerId);
    const contracts = await this.db.getPlayerContracts(playerId);
    const intel = await this.db.getPlayerIntelWithFreshness(playerId);
    const events = await this.db.getEvents({ actorId: playerId });

    return {
      success: true,
      data: { player, units, shipments, contracts, intel, events }
    };
  }

  // ============================================================================
  // PHASE 6: BATCH OPERATIONS
  // ============================================================================

  async executeBatch(playerId: string, operations: Array<{ action: string; params: any }>): Promise<{
    success: boolean;
    results?: Array<{ action: string; result: any }>;
    error?: string;
  }> {
    if (operations.length > 10) {
      return { success: false, error: 'Maximum 10 operations per batch' };
    }

    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const results: Array<{ action: string; result: any }> = [];

    for (const op of operations) {
      const canAct = await this.canPlayerAct(playerId);
      if (!canAct.allowed) {
        results.push({ action: op.action, result: { success: false, error: canAct.reason } });
        continue;
      }

      let result: any;
      try {
        switch (op.action) {
          case 'travel':
            result = await this.travel(playerId, op.params.toZoneId);
            break;
          case 'extract':
            result = await this.extract(playerId, op.params.quantity);
            break;
          case 'produce':
            result = await this.produce(playerId, op.params.output, op.params.quantity);
            break;
          case 'placeOrder':
            result = await this.placeOrder(playerId, op.params.zoneId, op.params.resource, op.params.side, op.params.price, op.params.quantity);
            break;
          case 'depositSU':
            result = await this.depositSU(playerId, op.params.zoneId, op.params.amount);
            break;
          case 'scan':
            result = await this.scan(playerId, op.params.targetType, op.params.targetId);
            break;
          default:
            result = { success: false, error: `Unknown action: ${op.action}` };
        }
      } catch (err: any) {
        result = { success: false, error: err.message || 'Action failed' };
      }

      results.push({ action: op.action, result });
    }

    return { success: true, results };
  }

  // ============================================================================
  // PHASE 7: FACTION ANALYTICS
  // ============================================================================

  async getFactionAnalytics(playerId: string): Promise<{
    success: boolean;
    analytics?: {
      members: any[];
      zones: any[];
      activity: any[];
    };
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (player.tier !== 'operator' && player.tier !== 'command') {
      return { success: false, error: 'Faction analytics require Operator or Command tier' };
    }

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const rank = await this.db.getFactionMemberRank(player.factionId, playerId);
    if (!rank || (rank !== 'officer' && rank !== 'founder')) {
      return { success: false, error: 'Must be officer or founder to view analytics' };
    }

    // Get members with activity data
    const faction = await this.db.getFaction(player.factionId);
    if (!faction) return { success: false, error: 'Faction not found' };

    const allPlayers = await this.db.getAllPlayers();
    const members = allPlayers
      .filter(p => p.factionId === player.factionId)
      .map(p => ({
        id: p.id,
        name: p.name,
        tier: p.tier,
        lastActionTick: p.lastActionTick,
        reputation: p.reputation,
        locationId: p.locationId
      }));

    // Get zone control summary
    const allZones = await this.db.getAllZones();
    const zones = allZones
      .filter(z => z.ownerId === player.factionId)
      .map(z => ({
        id: z.id,
        name: z.name,
        type: z.type,
        supplyLevel: z.supplyLevel,
        suStockpile: z.suStockpile,
        burnRate: z.burnRate
      }));

    // Get resource flow from audit logs
    const auditLogs = await this.db.getFactionAuditLogs(player.factionId, 100);
    const activity = auditLogs.map(log => ({
      action: log.action,
      playerId: log.playerId,
      details: log.details,
      tick: log.tick
    }));

    return {
      success: true,
      analytics: { members, zones, activity }
    };
  }

  async getFactionAuditLogs(playerId: string, limit?: number): Promise<{
    success: boolean;
    logs?: any[];
    error?: string;
  }> {
    const player = await this.db.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (player.tier !== 'command') {
      return { success: false, error: 'Audit logs require Command tier' };
    }

    if (!player.factionId) {
      return { success: false, error: 'Not in a faction' };
    }

    const logs = await this.db.getFactionAuditLogs(player.factionId, limit || 100);
    return { success: true, logs };
  }
}
