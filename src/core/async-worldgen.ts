/**
 * BURNRATE Async World Generator
 * Creates the initial map for a new season (returns data for async database)
 */

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

export function generateWorldData(config: WorldGenConfig = DEFAULT_CONFIG): { zones: Omit<Zone, 'id'>[]; routes: Omit<Route, 'id'>[] } {
  const zones: Omit<Zone, 'id'>[] = [];
  const zoneNames: string[] = [];

  // Generate Hubs (safe starting areas)
  const hubNames = ['Hub.Central', 'Hub.East', 'Hub.West'];
  for (let i = 0; i < config.hubs; i++) {
    const name = hubNames[i] || `Hub.${i + 1}`;
    zoneNames.push(name);
    zones.push({
      name,
      type: 'hub',
      ownerId: null,
      supplyLevel: 100,
      burnRate: BURN_RATES.hub,
      complianceStreak: 0,
      suStockpile: 0,
      inventory: { ...emptyInventory(), credits: 10000 },
      productionCapacity: 0,
      garrisonLevel: 10,
      marketDepth: 2.0
    });
  }

  // Generate Factories
  const factoryPrefixes = ['Factory', 'Mill', 'Works', 'Plant'];
  const factorySuffixes = ['North', 'South', 'East', 'West', 'Central', 'Upper', 'Lower', 'Main'];
  for (let i = 0; i < config.factories; i++) {
    const prefix = factoryPrefixes[i % factoryPrefixes.length];
    const suffix = factorySuffixes[i % factorySuffixes.length];
    const name = `${prefix}.${suffix}`;
    zoneNames.push(name);
    zones.push({
      name,
      type: 'factory',
      ownerId: null,
      supplyLevel: 100,
      burnRate: BURN_RATES.factory,
      complianceStreak: 0,
      suStockpile: 0,
      inventory: emptyInventory(),
      productionCapacity: 100,
      garrisonLevel: 2,
      marketDepth: 1.0
    });
  }

  // Generate Fields
  const fieldTypes = [
    { prefix: 'Mine', resource: 'ore' },
    { prefix: 'Refinery', resource: 'fuel' },
    { prefix: 'Farm', resource: 'grain' },
    { prefix: 'Grove', resource: 'fiber' }
  ];
  for (let i = 0; i < config.fields; i++) {
    const fieldType = fieldTypes[i % fieldTypes.length];
    const name = `${fieldType.prefix}.${i + 1}`;
    zoneNames.push(name);
    const inventory = emptyInventory();
    (inventory as any)[fieldType.resource] = 500;
    zones.push({
      name,
      type: 'field',
      ownerId: null,
      supplyLevel: 100,
      burnRate: BURN_RATES.field,
      complianceStreak: 0,
      suStockpile: 0,
      inventory,
      productionCapacity: 50,
      garrisonLevel: 0,
      marketDepth: 0.5
    });
  }

  // Generate Junctions
  for (let i = 0; i < config.junctions; i++) {
    const name = `Junction.${String.fromCharCode(65 + i)}`;
    zoneNames.push(name);
    zones.push({
      name,
      type: 'junction',
      ownerId: null,
      supplyLevel: 100,
      burnRate: BURN_RATES.junction,
      complianceStreak: 0,
      suStockpile: 0,
      inventory: emptyInventory(),
      productionCapacity: 0,
      garrisonLevel: 0,
      marketDepth: 0.5
    });
  }

  // Generate Fronts
  for (let i = 0; i < config.fronts; i++) {
    const name = `Front.${['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'][i] || `F${i + 1}`}`;
    zoneNames.push(name);
    zones.push({
      name,
      type: 'front',
      ownerId: null,
      supplyLevel: 50,
      burnRate: BURN_RATES.front,
      complianceStreak: 0,
      suStockpile: 0,
      inventory: emptyInventory(),
      productionCapacity: 0,
      garrisonLevel: 5,
      marketDepth: 0.2
    });
  }

  // Generate Strongholds
  for (let i = 0; i < config.strongholds; i++) {
    const name = `Stronghold.${['Prime', 'Omega', 'Nexus'][i] || `S${i + 1}`}`;
    zoneNames.push(name);
    zones.push({
      name,
      type: 'stronghold',
      ownerId: null,
      supplyLevel: 25,
      burnRate: BURN_RATES.stronghold,
      complianceStreak: 0,
      suStockpile: 0,
      inventory: emptyInventory(),
      productionCapacity: 0,
      garrisonLevel: 10,
      marketDepth: 0.1
    });
  }

  // Generate routes (create a connected graph)
  const routes: Omit<Route, 'id'>[] = [];
  const totalZones = zones.length;

  // Connect hubs to factories
  for (let i = 0; i < config.hubs; i++) {
    const hubIdx = i;
    for (let j = 0; j < 3; j++) {
      const factoryIdx = config.hubs + (i * 3 + j) % config.factories;
      routes.push(createRoute(zoneNames[hubIdx], zoneNames[factoryIdx], 2, 0.05));
    }
  }

  // Connect factories to fields
  for (let i = 0; i < config.factories; i++) {
    const factoryIdx = config.hubs + i;
    const field1Idx = config.hubs + config.factories + (i * 2) % config.fields;
    const field2Idx = config.hubs + config.factories + (i * 2 + 1) % config.fields;
    routes.push(createRoute(zoneNames[factoryIdx], zoneNames[field1Idx], 3, 0.1));
    routes.push(createRoute(zoneNames[factoryIdx], zoneNames[field2Idx], 3, 0.1));
  }

  // Connect junctions
  const junctionStart = config.hubs + config.factories + config.fields;
  for (let i = 0; i < config.junctions; i++) {
    const jIdx = junctionStart + i;
    // Connect to some factories
    const factoryIdx = config.hubs + (i * 2) % config.factories;
    routes.push(createRoute(zoneNames[jIdx], zoneNames[factoryIdx], 2, 0.15));
    // Connect to next junction
    if (i < config.junctions - 1) {
      routes.push(createRoute(zoneNames[jIdx], zoneNames[jIdx + 1], 2, 0.2));
    }
  }

  // Connect fronts to junctions and other fronts
  const frontStart = junctionStart + config.junctions;
  for (let i = 0; i < config.fronts; i++) {
    const fIdx = frontStart + i;
    const jIdx = junctionStart + (i * 2) % config.junctions;
    routes.push(createRoute(zoneNames[fIdx], zoneNames[jIdx], 3, 0.3));
    // Connect to next front
    if (i < config.fronts - 1) {
      routes.push(createRoute(zoneNames[fIdx], zoneNames[fIdx + 1], 2, 0.35));
    }
  }

  // Connect strongholds to fronts
  const strongholdStart = frontStart + config.fronts;
  for (let i = 0; i < config.strongholds; i++) {
    const sIdx = strongholdStart + i;
    const f1Idx = frontStart + (i * 2) % config.fronts;
    const f2Idx = frontStart + (i * 2 + 1) % config.fronts;
    routes.push(createRoute(zoneNames[sIdx], zoneNames[f1Idx], 3, 0.4));
    routes.push(createRoute(zoneNames[sIdx], zoneNames[f2Idx], 3, 0.4));
  }

  return { zones, routes };
}

function createRoute(fromName: string, toName: string, distance: number, risk: number): Omit<Route, 'id'> {
  return {
    fromZoneId: fromName,  // Will be replaced with actual IDs after zone creation
    toZoneId: toName,
    distance,
    capacity: 1000,
    baseRisk: risk,
    chokepointRating: 1.0 + Math.random() * 0.5
  };
}

// Helper to convert zone names to IDs after creation
export function mapRouteNamesToIds(routes: Omit<Route, 'id'>[], zoneNameToId: Map<string, string>): Omit<Route, 'id'>[] {
  return routes.map(r => ({
    ...r,
    fromZoneId: zoneNameToId.get(r.fromZoneId) || r.fromZoneId,
    toZoneId: zoneNameToId.get(r.toZoneId) || r.toZoneId
  }));
}
