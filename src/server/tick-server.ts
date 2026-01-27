#!/usr/bin/env node
/**
 * BURNRATE Tick Server
 * Automatically processes game ticks at regular intervals
 *
 * Default: 1 tick every 10 minutes (600,000ms)
 * For testing: Use --interval flag to speed up
 */

import { GameDatabase } from '../db/database.js';
import { GameEngine } from '../core/engine.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Configuration
const TICK_INTERVAL_MS = parseInt(process.env.BURNRATE_TICK_INTERVAL || '600000');  // 10 minutes default
const DB_DIR = path.join(os.homedir(), '.burnrate');
const DB_PATH = path.join(DB_DIR, 'game.db');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initialize
const db = new GameDatabase(DB_PATH);
const engine = new GameEngine(db);

// State
let running = true;
let tickCount = 0;
let lastTickTime = Date.now();

// Logging
function log(message: string) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Process a tick
function processTick() {
  const startTime = Date.now();
  const result = engine.processTick();
  const duration = Date.now() - startTime;

  tickCount++;
  lastTickTime = Date.now();

  // Log tick summary
  const eventSummary: Record<string, number> = {};
  for (const event of result.events) {
    eventSummary[event.type] = (eventSummary[event.type] || 0) + 1;
  }

  log(`Tick ${result.tick} processed in ${duration}ms (${result.events.length} events)`);

  // Log important events
  for (const event of result.events) {
    if (event.type === 'zone_state_changed') {
      log(`  Zone ${event.data.zoneName}: ${event.data.previousState} → ${event.data.newState}`);
    }
    if (event.type === 'zone_captured') {
      log(`  Zone ${event.data.zoneName} captured by ${event.data.newOwner || 'neutral'}`);
    }
    if (event.type === 'shipment_arrived') {
      log(`  Shipment ${(event.data.shipmentId as string).slice(0, 8)} arrived at destination`);
    }
    if (event.type === 'shipment_intercepted') {
      log(`  Shipment ${(event.data.shipmentId as string).slice(0, 8)} intercepted! ${event.data.outcome}`);
    }
    if (event.type === 'combat_resolved') {
      log(`  Combat: ${event.data.outcome} (E:${event.data.escortStrength} vs R:${event.data.raiderStrength})`);
    }
  }
}

// Main loop
function startTickLoop() {
  log(`BURNRATE Tick Server started`);
  log(`Tick interval: ${TICK_INTERVAL_MS}ms (${TICK_INTERVAL_MS / 60000} minutes)`);
  log(`Database: ${DB_PATH}`);
  log(`Current tick: ${db.getCurrentTick()}`);
  log(`Press Ctrl+C to stop\n`);

  // Process first tick immediately
  processTick();

  // Schedule subsequent ticks
  const interval = setInterval(() => {
    if (running) {
      processTick();
    }
  }, TICK_INTERVAL_MS);

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('\nShutting down...');
    running = false;
    clearInterval(interval);
    db.close();
    log(`Processed ${tickCount} ticks total`);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('\nReceived SIGTERM, shutting down...');
    running = false;
    clearInterval(interval);
    db.close();
    process.exit(0);
  });
}

// Status endpoint (simple file-based for CLI querying)
function writeStatus() {
  const statusPath = path.join(DB_DIR, 'server-status.json');
  const status = {
    running,
    tickCount,
    currentTick: db.getCurrentTick(),
    lastTickTime: new Date(lastTickTime).toISOString(),
    intervalMs: TICK_INTERVAL_MS,
    pid: process.pid
  };
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}

// Update status every tick
setInterval(writeStatus, 5000);

// Start the server
startTickLoop();
