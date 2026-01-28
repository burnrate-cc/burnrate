/**
 * BURNRATE Async Tick Server
 * Processes game ticks at regular intervals using TursoDatabase
 */

import { TursoDatabase } from '../db/turso-database.js';
import { AsyncGameEngine } from '../core/async-engine.js';

const TICK_INTERVAL = parseInt(process.env.BURNRATE_TICK_INTERVAL || '600000'); // 10 minutes

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   BURNRATE TICK SERVER                       ║
║              The front doesn't feed itself.                  ║
╠══════════════════════════════════════════════════════════════╣
║  Tick interval: ${(TICK_INTERVAL / 1000).toString().padEnd(6)}seconds                              ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
`);

  const db = new TursoDatabase();
  await db.initialize();
  const engine = new AsyncGameEngine(db);

  const currentTick = await db.getCurrentTick();
  console.log(`[TICK SERVER] Starting at tick ${currentTick}`);

  async function processTick() {
    const startTime = Date.now();

    try {
      const result = await engine.processTick();
      const duration = Date.now() - startTime;

      console.log(`[TICK ${result.tick}] Processed in ${duration}ms, ${result.events.length} events`);

      // Log significant events
      for (const event of result.events) {
        if (event.type === 'zone_captured') {
          console.log(`  → Zone ${(event.data as any).zoneName} captured by ${(event.data as any).newOwner || 'neutral'}`);
        } else if (event.type === 'zone_state_changed') {
          console.log(`  → Zone ${(event.data as any).zoneName}: ${(event.data as any).previousState} → ${(event.data as any).newState}`);
        } else if (event.type === 'combat_resolved') {
          console.log(`  → Combat at ${(event.data as any).location}: ${(event.data as any).outcome}`);
        } else if (event.type === 'shipment_intercepted') {
          console.log(`  → Shipment intercepted: ${(event.data as any).outcome}`);
        }
      }
    } catch (error) {
      console.error(`[TICK ERROR] ${error}`);
    }
  }

  // Process first tick immediately
  await processTick();

  // Schedule regular ticks
  setInterval(processTick, TICK_INTERVAL);
}

main().catch(console.error);
