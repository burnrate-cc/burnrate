/**
 * BURNRATE Pathfinding
 * Find optimal routes between zones
 */

import { GameDatabase } from '../db/database.js';
import { Route } from './types.js';

interface PathNode {
  zoneId: string;
  distance: number;
  risk: number;
  path: string[];
}

/**
 * Find shortest path between two zones using Dijkstra's algorithm
 * Optimizes for distance by default, can also factor in risk
 */
export function findPath(
  db: GameDatabase,
  fromZoneId: string,
  toZoneId: string,
  options: { optimizeFor?: 'distance' | 'risk' | 'balanced' } = {}
): { path: string[]; totalDistance: number; totalRisk: number; routes: Route[] } | null {
  const { optimizeFor = 'distance' } = options;

  // Get all zones and routes
  const allZones = db.getAllZones();
  const zoneIds = new Set(allZones.map(z => z.id));

  if (!zoneIds.has(fromZoneId) || !zoneIds.has(toZoneId)) {
    return null;
  }

  // Build adjacency map
  const adjacency = new Map<string, Route[]>();
  for (const zone of allZones) {
    adjacency.set(zone.id, db.getRoutesFromZone(zone.id));
  }

  // Dijkstra's algorithm
  const visited = new Set<string>();
  const costs = new Map<string, number>();
  const paths = new Map<string, string[]>();
  const risks = new Map<string, number>();
  const distances = new Map<string, number>();  // Track actual distances separately
  const routePaths = new Map<string, Route[]>();

  costs.set(fromZoneId, 0);
  paths.set(fromZoneId, [fromZoneId]);
  risks.set(fromZoneId, 0);
  distances.set(fromZoneId, 0);
  routePaths.set(fromZoneId, []);

  while (visited.size < zoneIds.size) {
    // Find unvisited node with lowest cost
    let current: string | null = null;
    let lowestCost = Infinity;

    for (const [zoneId, cost] of costs) {
      if (!visited.has(zoneId) && cost < lowestCost) {
        lowestCost = cost;
        current = zoneId;
      }
    }

    if (current === null) break;
    if (current === toZoneId) break;

    visited.add(current);

    // Check all neighbors
    const routes = adjacency.get(current) || [];
    for (const route of routes) {
      const neighbor = route.toZoneId;
      if (visited.has(neighbor)) continue;

      // Calculate cost based on optimization strategy
      let edgeCost: number;
      switch (optimizeFor) {
        case 'risk':
          edgeCost = route.baseRisk * route.chokepointRating * 100;
          break;
        case 'balanced':
          edgeCost = route.distance + route.baseRisk * route.chokepointRating * 50;
          break;
        case 'distance':
        default:
          edgeCost = route.distance;
      }

      const newCost = (costs.get(current) || 0) + edgeCost;
      const currentNeighborCost = costs.get(neighbor) ?? Infinity;

      if (newCost < currentNeighborCost) {
        costs.set(neighbor, newCost);
        paths.set(neighbor, [...(paths.get(current) || []), neighbor]);
        risks.set(neighbor, (risks.get(current) || 0) + route.baseRisk * route.chokepointRating);
        distances.set(neighbor, (distances.get(current) || 0) + route.distance);
        routePaths.set(neighbor, [...(routePaths.get(current) || []), route]);
      }
    }
  }

  const finalPath = paths.get(toZoneId);
  if (!finalPath) return null;

  return {
    path: finalPath,
    totalDistance: distances.get(toZoneId) || 0,  // Return actual distance, not cost
    totalRisk: risks.get(toZoneId) || 0,
    routes: routePaths.get(toZoneId) || []
  };
}

/**
 * Find all paths up to a certain length (for showing alternatives)
 */
export function findAlternativePaths(
  db: GameDatabase,
  fromZoneId: string,
  toZoneId: string,
  maxPaths: number = 3
): Array<{ path: string[]; totalDistance: number; totalRisk: number }> {
  const results: Array<{ path: string[]; totalDistance: number; totalRisk: number }> = [];

  // Get shortest path
  const shortest = findPath(db, fromZoneId, toZoneId, { optimizeFor: 'distance' });
  if (shortest) {
    results.push({
      path: shortest.path,
      totalDistance: shortest.totalDistance,
      totalRisk: shortest.totalRisk
    });
  }

  // Get safest path
  const safest = findPath(db, fromZoneId, toZoneId, { optimizeFor: 'risk' });
  if (safest && !pathsEqual(safest.path, shortest?.path || [])) {
    results.push({
      path: safest.path,
      totalDistance: safest.totalDistance,
      totalRisk: safest.totalRisk
    });
  }

  // Get balanced path
  const balanced = findPath(db, fromZoneId, toZoneId, { optimizeFor: 'balanced' });
  if (balanced && !pathsEqual(balanced.path, shortest?.path || []) && !pathsEqual(balanced.path, safest?.path || [])) {
    results.push({
      path: balanced.path,
      totalDistance: balanced.totalDistance,
      totalRisk: balanced.totalRisk
    });
  }

  return results.slice(0, maxPaths);
}

function pathsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Calculate total distance and ETA for a path with a specific shipment type
 */
export function calculatePathStats(
  routes: Route[],
  speedModifier: number
): { totalTicks: number; totalDistance: number; legs: Array<{ from: string; to: string; ticks: number }> } {
  let totalTicks = 0;
  let totalDistance = 0;
  const legs: Array<{ from: string; to: string; ticks: number }> = [];

  for (const route of routes) {
    const ticks = Math.ceil(route.distance * speedModifier);
    totalTicks += ticks;
    totalDistance += route.distance;
    legs.push({
      from: route.fromZoneId,
      to: route.toZoneId,
      ticks
    });
  }

  return { totalTicks, totalDistance, legs };
}
