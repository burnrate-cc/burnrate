/**
 * BURNRATE World Generator
 * Creates the initial map for a new season
 */

import { GameDatabase } from '../db/database.js';
import { Zone, Route, BURN_RATES, emptyInventory } from './types.js';

interface WorldGenConfig {
  hubs: number;
  factories: number;
  fields: number;
  junctions: number;
  fronts: number;
  strongholds: number;
}

const DEFAULT_CONFIG: WorldGenConfig = {
  hubs: 3,
  factories: 8,
  fields: 12,
  junctions: 10,
  fronts: 6,
  strongholds: 3
};

/**
 * Generate a new world for Season 1
 */
export function generateWorld(db: GameDatabase, config: WorldGenConfig = DEFAULT_CONFIG): void {
  const zones: Zone[] = [];

  // Generate Hubs (safe starting areas)
  const hubNames = ['Hub.Central', 'Hub.East', 'Hub.West'];
  for (let i = 0; i < config.hubs; i++) {
    const zone = db.createZone({
      name: hubNames[i] || `Hub.${i + 1}`,
      type: 'hub',
      ownerId: null,
      supplyLevel: 100,
      burnRate: BURN_RATES.hub,
      complianceStreak: 0,
      suStockpile: 0,
      inventory: { ...emptyInventory(), credits: 10000 },  // Hub has market liquidity
      productionCapacity: 0,
      garrisonLevel: 10,  // Hubs are well defended
      marketDepth: 2.0,
      medkitStockpile: 0,
      commsStockpile: 0
    });
    zones.push(zone);
  }

  // Generate Factories
  const factoryNames = [
    'Factory.North', 'Factory.South', 'Factory.Iron', 'Factory.Chemical',
    'Factory.Munitions', 'Factory.Textile', 'Factory.Parts', 'Factory.Comms'
  ];
  for (let i = 0; i < config.factories; i++) {
    const zone = db.createZone({
      name: factoryNames[i] || `Factory.${i + 1}`,
      type: 'factory',
      ownerId: null,
      supplyLevel: 100,
      burnRate: BURN_RATES.factory,
      complianceStreak: 0,
      suStockpile: 50,
      inventory: emptyInventory(),
      productionCapacity: 100,  // Can produce 100 units/tick
      garrisonLevel: 2,
      marketDepth: 1.0,
      medkitStockpile: 0,
      commsStockpile: 0
    });
    zones.push(zone);
  }

  // Generate Fields (resource extraction)
  const fieldNames = [
    'Field.Ore.Alpha', 'Field.Ore.Beta', 'Field.Ore.Gamma',
    'Field.Fuel.1', 'Field.Fuel.2', 'Field.Fuel.3',
    'Field.Grain.North', 'Field.Grain.South', 'Field.Grain.Valley',
    'Field.Fiber.1', 'Field.Fiber.2', 'Field.Fiber.3'
  ];
  for (let i = 0; i < config.fields; i++) {
    // Determine what this field produces based on name
    const name = fieldNames[i] || `Field.${i + 1}`;
    let inventory = emptyInventory();

    if (name.includes('Ore')) inventory.ore = 500;
    else if (name.includes('Fuel')) inventory.fuel = 500;
    else if (name.includes('Grain')) inventory.grain = 500;
    else if (name.includes('Fiber')) inventory.fiber = 500;

    const zone = db.createZone({
      name,
      type: 'field',
      ownerId: null,
      supplyLevel: 100,
      burnRate: BURN_RATES.field,
      complianceStreak: 0,
      suStockpile: 30,
      inventory,
      productionCapacity: 50,  // Extraction rate
      garrisonLevel: 1,
      marketDepth: 0.5,
      medkitStockpile: 0,
      commsStockpile: 0
    });
    zones.push(zone);
  }

  // Generate Junctions (crossroads)
  const junctionNames = [
    'Junction.1', 'Junction.2', 'Junction.3', 'Junction.4', 'Junction.5',
    'Junction.North', 'Junction.South', 'Junction.East', 'Junction.West', 'Junction.Center'
  ];
  for (let i = 0; i < config.junctions; i++) {
    const zone = db.createZone({
      name: junctionNames[i] || `Junction.${i + 1}`,
      type: 'junction',
      ownerId: null,
      supplyLevel: 100,
      burnRate: BURN_RATES.junction,
      complianceStreak: 0,
      suStockpile: 0,
      inventory: emptyInventory(),
      productionCapacity: 0,
      garrisonLevel: 0,
      marketDepth: 0.3,
      medkitStockpile: 0,
      commsStockpile: 0
    });
    zones.push(zone);
  }

  // Generate Fronts (contested zones)
  const frontNames = [
    'Front.Kessel', 'Front.Ardenne', 'Front.Kursk',
    'Front.Marne', 'Front.Somme', 'Front.Verdun'
  ];
  for (let i = 0; i < config.fronts; i++) {
    const zone = db.createZone({
      name: frontNames[i] || `Front.${i + 1}`,
      type: 'front',
      ownerId: null,
      supplyLevel: 0,  // Starts unsupplied
      burnRate: BURN_RATES.front,
      complianceStreak: 0,
      suStockpile: 0,
      inventory: emptyInventory(),
      productionCapacity: 0,
      garrisonLevel: 0,
      marketDepth: 0.2,
      medkitStockpile: 0,
      commsStockpile: 0
    });
    zones.push(zone);
  }

  // Generate Strongholds (victory points)
  const strongholdNames = ['Stronghold.Prime', 'Stronghold.Alpha', 'Stronghold.Omega'];
  for (let i = 0; i < config.strongholds; i++) {
    const zone = db.createZone({
      name: strongholdNames[i] || `Stronghold.${i + 1}`,
      type: 'stronghold',
      ownerId: null,
      supplyLevel: 0,
      burnRate: BURN_RATES.stronghold,
      complianceStreak: 0,
      suStockpile: 0,
      inventory: emptyInventory(),
      productionCapacity: 0,
      garrisonLevel: 5,
      marketDepth: 0.1,
      medkitStockpile: 0,
      commsStockpile: 0
    });
    zones.push(zone);
  }

  // Generate Routes
  // Strategy: Create a connected graph with logical geography
  const zoneMap = new Map(zones.map(z => [z.name, z]));

  // Helper to create bidirectional routes
  const connectZones = (from: string, to: string, distance: number, risk: number, chokepoint: number = 1.0) => {
    const fromZone = zoneMap.get(from);
    const toZone = zoneMap.get(to);
    if (!fromZone || !toZone) return;

    // Create route in both directions
    db.createRoute({
      fromZoneId: fromZone.id,
      toZoneId: toZone.id,
      distance,
      capacity: 500,
      baseRisk: risk,
      chokepointRating: chokepoint
    });
    db.createRoute({
      fromZoneId: toZone.id,
      toZoneId: fromZone.id,
      distance,
      capacity: 500,
      baseRisk: risk,
      chokepointRating: chokepoint
    });
  };

  // Hub connections (safe routes between hubs)
  connectZones('Hub.Central', 'Hub.East', 2, 0.02);
  connectZones('Hub.Central', 'Hub.West', 2, 0.02);
  connectZones('Hub.East', 'Hub.West', 3, 0.03);

  // Hub to Factory routes
  connectZones('Hub.Central', 'Factory.North', 2, 0.05);
  connectZones('Hub.Central', 'Factory.South', 2, 0.05);
  connectZones('Hub.East', 'Factory.Iron', 2, 0.05);
  connectZones('Hub.East', 'Factory.Chemical', 2, 0.05);
  connectZones('Hub.West', 'Factory.Munitions', 2, 0.05);
  connectZones('Hub.West', 'Factory.Textile', 2, 0.05);

  // Factory to Field routes
  connectZones('Factory.Iron', 'Field.Ore.Alpha', 3, 0.08);
  connectZones('Factory.Iron', 'Field.Ore.Beta', 3, 0.08);
  connectZones('Factory.Chemical', 'Field.Fuel.1', 3, 0.08);
  connectZones('Factory.Chemical', 'Field.Fuel.2', 3, 0.08);
  connectZones('Factory.Textile', 'Field.Fiber.1', 3, 0.08);
  connectZones('Factory.Textile', 'Field.Grain.North', 3, 0.08);
  connectZones('Factory.North', 'Field.Ore.Gamma', 2, 0.06);
  connectZones('Factory.South', 'Field.Fuel.3', 2, 0.06);

  // Factory interconnections
  connectZones('Factory.North', 'Factory.Iron', 2, 0.06);
  connectZones('Factory.South', 'Factory.Chemical', 2, 0.06);
  connectZones('Factory.Parts', 'Factory.Iron', 2, 0.06);
  connectZones('Factory.Parts', 'Factory.Textile', 2, 0.06);
  connectZones('Factory.Comms', 'Factory.Parts', 2, 0.06);
  connectZones('Factory.Munitions', 'Factory.Chemical', 2, 0.06);

  // Junction connections (crossroads)
  connectZones('Junction.1', 'Factory.North', 2, 0.10);
  connectZones('Junction.1', 'Factory.Parts', 2, 0.10);
  connectZones('Junction.2', 'Factory.South', 2, 0.10);
  connectZones('Junction.2', 'Factory.Munitions', 2, 0.10);
  connectZones('Junction.3', 'Factory.Iron', 2, 0.10);
  connectZones('Junction.4', 'Factory.Chemical', 2, 0.10);
  connectZones('Junction.5', 'Factory.Textile', 2, 0.10);

  // Junction to Junction (main arteries)
  connectZones('Junction.1', 'Junction.North', 2, 0.12);
  connectZones('Junction.2', 'Junction.South', 2, 0.12);
  connectZones('Junction.3', 'Junction.East', 2, 0.12);
  connectZones('Junction.4', 'Junction.West', 2, 0.12);
  connectZones('Junction.5', 'Junction.Center', 2, 0.12);
  connectZones('Junction.North', 'Junction.Center', 2, 0.15);
  connectZones('Junction.South', 'Junction.Center', 2, 0.15);
  connectZones('Junction.East', 'Junction.Center', 2, 0.15);
  connectZones('Junction.West', 'Junction.Center', 2, 0.15);

  // Front connections (dangerous routes)
  connectZones('Junction.North', 'Front.Kessel', 3, 0.25, 1.5);
  connectZones('Junction.East', 'Front.Ardenne', 3, 0.25, 1.5);
  connectZones('Junction.South', 'Front.Kursk', 3, 0.25, 1.5);
  connectZones('Junction.West', 'Front.Marne', 3, 0.25, 1.5);
  connectZones('Junction.Center', 'Front.Somme', 3, 0.30, 2.0);  // Major chokepoint
  connectZones('Junction.Center', 'Front.Verdun', 3, 0.30, 2.0);

  // Front interconnections
  connectZones('Front.Kessel', 'Front.Ardenne', 4, 0.35, 1.8);
  connectZones('Front.Ardenne', 'Front.Kursk', 4, 0.35, 1.8);
  connectZones('Front.Kursk', 'Front.Marne', 4, 0.35, 1.8);
  connectZones('Front.Marne', 'Front.Somme', 3, 0.30, 1.5);
  connectZones('Front.Somme', 'Front.Verdun', 3, 0.30, 1.5);
  connectZones('Front.Verdun', 'Front.Kessel', 4, 0.35, 1.8);

  // Stronghold connections (hardest routes)
  connectZones('Front.Kessel', 'Stronghold.Prime', 5, 0.40, 2.5);
  connectZones('Front.Somme', 'Stronghold.Prime', 5, 0.40, 2.5);
  connectZones('Front.Ardenne', 'Stronghold.Alpha', 5, 0.40, 2.5);
  connectZones('Front.Kursk', 'Stronghold.Alpha', 5, 0.40, 2.5);
  connectZones('Front.Marne', 'Stronghold.Omega', 5, 0.40, 2.5);
  connectZones('Front.Verdun', 'Stronghold.Omega', 5, 0.40, 2.5);

  // Some alternative routes (bypass options)
  connectZones('Hub.Central', 'Junction.Center', 4, 0.15);  // Direct but longer
  connectZones('Hub.East', 'Junction.East', 3, 0.12);
  connectZones('Hub.West', 'Junction.West', 3, 0.12);

  // Field interconnections
  connectZones('Field.Ore.Alpha', 'Field.Ore.Beta', 2, 0.08);
  connectZones('Field.Fuel.1', 'Field.Fuel.2', 2, 0.08);
  connectZones('Field.Grain.North', 'Field.Grain.South', 2, 0.08);
  connectZones('Field.Fiber.1', 'Field.Fiber.2', 2, 0.08);

  console.log(`Generated world with ${zones.length} zones`);
}

/**
 * Seed initial market prices in zones
 */
export function seedMarkets(db: GameDatabase): void {
  const zones = db.getAllZones();

  for (const zone of zones) {
    if (zone.type === 'hub') {
      // Add some initial inventory for trading
      const inventory = { ...zone.inventory };
      inventory.ore = 200;
      inventory.fuel = 200;
      inventory.grain = 200;
      inventory.fiber = 200;
      inventory.metal = 100;
      inventory.chemicals = 100;
      inventory.rations = 100;
      inventory.textiles = 100;
      inventory.ammo = 50;
      inventory.medkits = 50;
      inventory.parts = 50;
      inventory.comms = 25;
      db.updateZone(zone.id, { inventory });
    }
  }
}
