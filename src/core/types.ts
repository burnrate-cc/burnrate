/**
 * BURNRATE Core Types
 * The front doesn't feed itself.
 */

// ============================================================================
// RESOURCES
// ============================================================================

/** T0 Raw Materials */
export type RawResource = 'ore' | 'fuel' | 'grain' | 'fiber';

/** T1 Processed Goods */
export type ProcessedResource = 'metal' | 'chemicals' | 'rations' | 'textiles';

/** T2 Strategic Goods */
export type StrategicResource = 'ammo' | 'medkits' | 'parts' | 'comms';

/** All tradeable resources */
export type Resource = RawResource | ProcessedResource | StrategicResource;

/** Resource inventory (including SU) */
export interface Inventory {
  ore: number;
  fuel: number;
  grain: number;
  fiber: number;
  metal: number;
  chemicals: number;
  rations: number;
  textiles: number;
  ammo: number;
  medkits: number;
  parts: number;
  comms: number;
  credits: number;
}

/** Empty inventory factory */
export function emptyInventory(): Inventory {
  return {
    ore: 0, fuel: 0, grain: 0, fiber: 0,
    metal: 0, chemicals: 0, rations: 0, textiles: 0,
    ammo: 0, medkits: 0, parts: 0, comms: 0,
    credits: 0
  };
}

/** SU recipe: what's needed to create 1 Supply Unit */
export const SU_RECIPE = {
  rations: 2,
  fuel: 1,
  parts: 1,
  ammo: 1
} as const;

/** Production recipes: inputs required to produce 1 unit of output */
export const RECIPES: Record<string, { inputs: Partial<Record<Resource, number>>; tier: number; isUnit?: boolean }> = {
  // T1 (Processed) - made from T0 (Raw)
  metal:     { inputs: { ore: 2, fuel: 1 }, tier: 1 },
  chemicals: { inputs: { ore: 1, fuel: 2 }, tier: 1 },
  rations:   { inputs: { grain: 3, fuel: 1 }, tier: 1 },
  textiles:  { inputs: { fiber: 2, chemicals: 1 }, tier: 1 },

  // T2 (Strategic) - made from T1 (Processed)
  ammo:     { inputs: { metal: 1, chemicals: 1 }, tier: 2 },
  medkits:  { inputs: { chemicals: 1, textiles: 1 }, tier: 2 },
  parts:    { inputs: { metal: 1, textiles: 1 }, tier: 2 },
  comms:    { inputs: { metal: 1, chemicals: 1, parts: 1 }, tier: 2 },

  // T3 (Military Units) - made from T2 (Strategic)
  escort:   { inputs: { metal: 2, parts: 1, rations: 1 }, tier: 3, isUnit: true },
  raider:   { inputs: { metal: 2, parts: 2, comms: 1 }, tier: 3, isUnit: true },
};

/** What raw resource a Field produces based on its name */
export function getFieldResource(fieldName: string): RawResource | null {
  if (fieldName.includes('Mine') || fieldName.includes('Ore')) return 'ore';
  if (fieldName.includes('Refinery') || fieldName.includes('Fuel')) return 'fuel';
  if (fieldName.includes('Farm') || fieldName.includes('Grain')) return 'grain';
  if (fieldName.includes('Grove') || fieldName.includes('Fiber')) return 'fiber';
  return null;
}

// ============================================================================
// ZONES
// ============================================================================

export type ZoneType = 'hub' | 'factory' | 'field' | 'junction' | 'front' | 'stronghold';

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;

  /** Faction that controls this zone (null = neutral) */
  ownerId: string | null;

  /** Current supply level (0-100+, percentage of burn rate covered) */
  supplyLevel: number;

  /** SU burned per tick to maintain control */
  burnRate: number;

  /** Consecutive ticks at 100%+ supply */
  complianceStreak: number;

  /** Current SU stockpile */
  suStockpile: number;

  /** Zone inventory (for production, markets) */
  inventory: Inventory;

  /** Production capacity (units/tick) for factory zones */
  productionCapacity: number;

  /** Garrison strength (faction investment) */
  garrisonLevel: number;

  /** Market depth multiplier */
  marketDepth: number;

  /** Medkit stockpile for combat bonuses */
  medkitStockpile: number;

  /** Comms stockpile for intel defense */
  commsStockpile: number;
}

export type SupplyState = 'fortified' | 'supplied' | 'strained' | 'critical' | 'collapsed';

export function getSupplyState(supplyLevel: number, complianceStreak: number = 0): SupplyState {
  if (supplyLevel >= 100 && complianceStreak >= 50) return 'fortified';
  if (supplyLevel >= 100) return 'supplied';
  if (supplyLevel >= 50) return 'strained';
  if (supplyLevel > 0) return 'critical';
  return 'collapsed';
}

/** Front efficiency: bonuses from supply level and compliance streak */
export interface ZoneEfficiency {
  /** Supply state label */
  state: SupplyState;
  /** Multiplier for raid resistance (higher = harder to raid) */
  raidResistance: number;
  /** Multiplier for capture difficulty (higher = harder to capture) */
  captureDefense: number;
  /** Production bonus (0.0 = none, 0.2 = +20%) */
  productionBonus: number;
  /** Medkit combat bonus (reduces unit attrition) */
  medkitBonus: number;
  /** Comms intel bonus (reduces enemy scan quality) */
  commsDefense: number;
}

/** Calculate zone efficiency from supply state, streak, and stockpiles */
export function getZoneEfficiency(
  supplyLevel: number,
  complianceStreak: number,
  medkitStockpile: number = 0,
  commsStockpile: number = 0
): ZoneEfficiency {
  const state = getSupplyState(supplyLevel, complianceStreak);

  // Base values by supply state
  let raidResistance = 1.0;
  let captureDefense = 1.0;
  let productionBonus = 0.0;

  switch (state) {
    case 'fortified':
      raidResistance = 1.5;
      captureDefense = 1.5;
      productionBonus = 0.1;
      break;
    case 'supplied':
      raidResistance = 1.0;
      captureDefense = 1.0;
      productionBonus = 0.0;
      break;
    case 'strained':
      raidResistance = 0.75;
      captureDefense = 0.75;
      productionBonus = 0.0;
      break;
    case 'critical':
      raidResistance = 0.5;
      captureDefense = 0.25;
      productionBonus = 0.0;
      break;
    case 'collapsed':
      raidResistance = 0.0;
      captureDefense = 0.0;
      productionBonus = 0.0;
      break;
  }

  // Compliance streak bonuses (stacking on top of fortified)
  if (complianceStreak >= 500) {
    raidResistance += 0.5;
    captureDefense += 0.5;
    productionBonus += 0.2;
  } else if (complianceStreak >= 200) {
    raidResistance += 0.25;
    captureDefense += 0.25;
    productionBonus += 0.1;
  } else if (complianceStreak >= 50) {
    raidResistance += 0.1;
    captureDefense += 0.1;
  }

  // Medkit stockpile → combat bonus (diminishing returns, cap at +50%)
  const medkitBonus = Math.min(0.5, medkitStockpile * 0.02);

  // Comms stockpile → intel defense (diminishing returns, cap at +50%)
  const commsDefense = Math.min(0.5, commsStockpile * 0.025);

  return { state, raidResistance, captureDefense, productionBonus, medkitBonus, commsDefense };
}

/** Burn rates by zone type */
export const BURN_RATES: Record<ZoneType, number> = {
  hub: 0,        // Hubs don't burn (safe zones)
  factory: 5,
  field: 3,
  junction: 0,   // Junctions don't burn (transit only)
  front: 10,
  stronghold: 20
};

/** Credits generated per tick for each owned zone type (split among faction members) */
export const ZONE_INCOME: Record<ZoneType, number> = {
  hub: 0,          // Hubs are neutral
  factory: 10,
  field: 5,
  junction: 0,     // Junctions are transit only
  front: 25,
  stronghold: 50
};

/** Compliance streak multiplier for season-end zone scoring.
 *  Zones held at full supply for longer streaks are worth more. */
export function getStreakMultiplier(complianceStreak: number): number {
  if (complianceStreak >= 100) return 3.0;
  if (complianceStreak >= 50) return 2.0;
  if (complianceStreak >= 20) return 1.5;
  if (complianceStreak >= 5) return 1.2;
  return 1.0;
}

// ============================================================================
// ROUTES
// ============================================================================

export interface Route {
  id: string;
  fromZoneId: string;
  toZoneId: string;

  /** Ticks to traverse */
  distance: number;

  /** Max cargo per tick */
  capacity: number;

  /** Base interception probability (0-1) */
  baseRisk: number;

  /** Chokepoint multiplier for ambushes (1-3) */
  chokepointRating: number;
}

// ============================================================================
// SHIPMENTS
// ============================================================================

export type ShipmentType = 'courier' | 'freight' | 'convoy';

export interface Shipment {
  id: string;
  playerId: string;

  type: ShipmentType;

  /** Route path (zone IDs in order) */
  path: string[];

  /** Current position (index in path) */
  currentPosition: number;

  /** Ticks remaining until next zone */
  ticksToNextZone: number;

  /** Cargo being shipped */
  cargo: Partial<Inventory>;

  /** Escort unit IDs attached */
  escortIds: string[];

  /** Tick when shipment was created */
  createdAt: number;

  /** Status */
  status: 'in_transit' | 'arrived' | 'intercepted';
}

export const SHIPMENT_SPECS: Record<ShipmentType, {
  capacity: number;
  speedModifier: number;  // multiplier on route distance
  visibilityModifier: number;  // multiplier on interception chance
}> = {
  courier: { capacity: 10, speedModifier: 0.67, visibilityModifier: 0.5 },
  freight: { capacity: 50, speedModifier: 1.0, visibilityModifier: 1.0 },
  convoy: { capacity: 200, speedModifier: 1.33, visibilityModifier: 2.0 }
};

/** License unlock requirements */
export const LICENSE_REQUIREMENTS: Record<ShipmentType, {
  reputationRequired: number;
  creditsCost: number;
  description: string;
}> = {
  courier: { reputationRequired: 0, creditsCost: 0, description: 'Basic small cargo transport' },
  freight: { reputationRequired: 50, creditsCost: 500, description: 'Medium cargo transport' },
  convoy: { reputationRequired: 200, creditsCost: 2000, description: 'Heavy armored transport' }
};

/** Reputation rewards for various actions */
export const REPUTATION_REWARDS = {
  // Shipments
  shipmentDelivered: 5,           // per successful delivery
  shipmentIntercepted: -10,       // lost cargo
  escortSuccess: 3,               // escort protected a shipment

  // Contracts
  contractCompleted: 10,          // base reward (+ contract-specific)
  contractFailed: -20,            // failed to complete
  contractBonus: 5,               // completed early

  // Zone supply
  supplyDelivered: 2,             // per SU delivered
  zoneCaptured: 25,               // captured a zone

  // Combat
  raiderDestroyed: 5,             // destroyed an enemy raider
  escortDestroyed: -5,            // lost an escort

  // Market
  tradeCompleted: 1,              // completed a trade

  // Daily decay (for inactive players)
  dailyDecay: -1,                 // lose 1 rep per day of inactivity

  // Maximum reputation
  maxReputation: 1000
} as const;

/** Reputation thresholds for titles */
export const REPUTATION_TITLES: { threshold: number; title: string }[] = [
  { threshold: 0, title: 'Unknown' },
  { threshold: 25, title: 'Runner' },
  { threshold: 50, title: 'Trader' },
  { threshold: 100, title: 'Hauler' },
  { threshold: 200, title: 'Merchant' },
  { threshold: 350, title: 'Supplier' },
  { threshold: 500, title: 'Quartermaster' },
  { threshold: 700, title: 'Logistics Chief' },
  { threshold: 900, title: 'Supply Marshal' },
  { threshold: 1000, title: 'Legend' }
];

/** Get reputation title based on rep value */
export function getReputationTitle(reputation: number): string {
  for (let i = REPUTATION_TITLES.length - 1; i >= 0; i--) {
    if (reputation >= REPUTATION_TITLES[i].threshold) {
      return REPUTATION_TITLES[i].title;
    }
  }
  return 'Unknown';
}

// ============================================================================
// COMBAT UNITS
// ============================================================================

export type UnitType = 'escort' | 'raider';

export interface Unit {
  id: string;
  playerId: string;
  type: UnitType;

  /** Current location (zone ID) */
  locationId: string;

  /** Combat strength */
  strength: number;

  /** Movement speed (affects raider interception range) */
  speed: number;

  /** Maintenance cost (credits/tick) */
  maintenance: number;

  /** If assigned to a shipment (escort) or route (raider) */
  assignmentId: string | null;

  /** If listed for sale, the asking price (null = not for sale) */
  forSalePrice: number | null;
}

// ============================================================================
// PLAYERS
// ============================================================================

export type SubscriptionTier = 'freelance' | 'operator' | 'command';

export interface Player {
  id: string;
  name: string;

  tier: SubscriptionTier;

  /** Personal inventory and credits */
  inventory: Inventory;

  /** Current location (zone ID) */
  locationId: string;

  /** Faction membership */
  factionId: string | null;

  /** Global reputation (0-1000) */
  reputation: number;

  /** Actions taken today */
  actionsToday: number;

  /** Last action timestamp (for rate limiting) */
  lastActionTick: number;

  /** Licenses unlocked */
  licenses: {
    courier: boolean;
    freight: boolean;
    convoy: boolean;
  };

  /** Tutorial progress (0-5, each step completed) */
  tutorialStep: number;
}

export const TIER_LIMITS: Record<SubscriptionTier, {
  dailyActions: number;
  eventHistory: number;
  concurrentContracts: number;
  marketOrders: number;
}> = {
  freelance: { dailyActions: 200, eventHistory: 200, concurrentContracts: 3, marketOrders: 5 },
  operator: { dailyActions: 500, eventHistory: 10000, concurrentContracts: 10, marketOrders: 20 },
  command: { dailyActions: 1000, eventHistory: 100000, concurrentContracts: 25, marketOrders: 50 }
};

// ============================================================================
// FACTIONS
// ============================================================================

export type FactionRank = 'founder' | 'officer' | 'member';

/** Permissions for each rank */
export const FACTION_PERMISSIONS: Record<FactionRank, {
  canInvite: boolean;
  canKick: boolean;
  canPromote: boolean;
  canDemote: boolean;
  canWithdraw: boolean;
  canSetDoctrine: boolean;
  canDeclareWar: boolean;
  canUpgrade: boolean;
}> = {
  founder: {
    canInvite: true,
    canKick: true,
    canPromote: true,
    canDemote: true,
    canWithdraw: true,
    canSetDoctrine: true,
    canDeclareWar: true,
    canUpgrade: true
  },
  officer: {
    canInvite: true,
    canKick: true, // can kick members only, not officers
    canPromote: false,
    canDemote: false,
    canWithdraw: true, // up to officer limit
    canSetDoctrine: false,
    canDeclareWar: false,
    canUpgrade: false
  },
  member: {
    canInvite: false,
    canKick: false,
    canPromote: false,
    canDemote: false,
    canWithdraw: false,
    canSetDoctrine: false,
    canDeclareWar: false,
    canUpgrade: false
  }
};

export interface FactionMember {
  playerId: string;
  rank: FactionRank;
  joinedAt: number;
}

export interface Faction {
  id: string;
  name: string;
  tag: string;  // Short identifier (3-5 chars)

  /** Founder player ID */
  founderId: string;

  /** Treasury */
  treasury: Inventory;

  /** Daily withdrawal limit for officers (credits) */
  officerWithdrawLimit: number;

  /** Member list with ranks */
  members: FactionMember[];

  /** Zone IDs controlled by this faction */
  controlledZones: string[];

  /** Doctrine hash (for compliance tracking) */
  doctrineHash: string | null;

  /** Infrastructure upgrades */
  upgrades: {
    relayNetwork: number;    // Intel coverage
    routeFortification: number;
    productionBonus: number;
    garrisonStrength: number;
    marketDepth: number;
  };

  /** Alliance/war state with other factions */
  relations: Record<string, 'allied' | 'neutral' | 'war'>;
}

// ============================================================================
// INTEL
// ============================================================================

/** Intel freshness states based on age */
export type IntelFreshness = 'fresh' | 'stale' | 'expired';

/** Intel freshness thresholds (in ticks) */
export const INTEL_DECAY_THRESHOLDS = {
  fresh: 10,     // <10 ticks: full accuracy
  stale: 50,     // 10-50 ticks: degraded accuracy
  // >50 ticks: expired, major degradation
} as const;

/** Calculate intel freshness based on age */
export function getIntelFreshness(gatheredAt: number, currentTick: number): IntelFreshness {
  const age = currentTick - gatheredAt;
  if (age < INTEL_DECAY_THRESHOLDS.fresh) return 'fresh';
  if (age < INTEL_DECAY_THRESHOLDS.stale) return 'stale';
  return 'expired';
}

/** Calculate effective signal quality with decay */
export function getDecayedSignalQuality(
  originalQuality: number,
  gatheredAt: number,
  currentTick: number
): number {
  const freshness = getIntelFreshness(gatheredAt, currentTick);

  switch (freshness) {
    case 'fresh':
      return originalQuality;
    case 'stale':
      // Lose 1% per tick after fresh threshold
      const staleAge = currentTick - gatheredAt - INTEL_DECAY_THRESHOLDS.fresh;
      return Math.max(50, originalQuality - staleAge);
    case 'expired':
      // Minimum 20% quality for expired intel
      return Math.max(20, originalQuality * 0.3);
  }
}

/** Apply decay to intel data based on freshness */
export function applyIntelDecay(
  data: Record<string, unknown>,
  freshness: IntelFreshness
): Record<string, unknown> {
  if (freshness === 'fresh') {
    return { ...data };
  }

  const decayed = { ...data };

  if (freshness === 'stale') {
    // For stale intel, add uncertainty to numeric values
    for (const [key, value] of Object.entries(decayed)) {
      if (typeof value === 'number' && key !== 'distance') {
        // Add ±10% noise to numbers
        const variance = Math.round(value * 0.1);
        decayed[key] = value + (Math.random() > 0.5 ? variance : -variance);
      }
    }
    decayed._stale = true;
    decayed._warning = 'Intel is stale. Values may be inaccurate.';
  }

  if (freshness === 'expired') {
    // For expired intel, heavily degrade or remove sensitive data
    const sensitiveKeys = ['raiderStrength', 'raiderPresence', 'activeShipments',
                          'suStockpile', 'supplyLevel', 'marketActivity'];

    for (const key of sensitiveKeys) {
      if (key in decayed) {
        if (typeof decayed[key] === 'number') {
          // Replace with "unknown" range
          const originalValue = decayed[key] as number;
          decayed[key] = `~${Math.round(originalValue * 0.5)}-${Math.round(originalValue * 1.5)}`;
        } else if (typeof decayed[key] === 'boolean') {
          decayed[key] = 'unknown';
        }
      }
    }

    decayed._expired = true;
    decayed._warning = 'Intel is expired. Data is unreliable and should be refreshed.';
  }

  return decayed;
}

export interface IntelReport {
  id: string;
  playerId: string;

  /** Faction this intel is shared with (null = private) */
  factionId: string | null;

  /** What was scanned */
  targetType: 'zone' | 'route';
  targetId: string;

  /** Tick when gathered */
  gatheredAt: number;

  /** Data captured (varies by target type) */
  data: Record<string, unknown>;

  /** Signal quality when gathered (0-100) */
  signalQuality: number;
}

/** Intel report with freshness information */
export interface IntelReportWithFreshness extends IntelReport {
  freshness: IntelFreshness;
  effectiveSignalQuality: number;
  ageInTicks: number;
}

// ============================================================================
// MARKET
// ============================================================================

export type OrderSide = 'buy' | 'sell';

export interface MarketOrder {
  id: string;
  playerId: string;
  zoneId: string;

  resource: Resource;
  side: OrderSide;

  /** Price per unit */
  price: number;

  /** Quantity remaining */
  quantity: number;

  /** Original quantity */
  originalQuantity: number;

  /** Tick when placed */
  createdAt: number;
}

export interface Trade {
  id: string;
  zoneId: string;
  resource: Resource;

  buyerId: string;
  sellerId: string;

  price: number;
  quantity: number;

  executedAt: number;
}

// ============================================================================
// CONTRACTS
// ============================================================================

export type ContractType = 'haul' | 'supply' | 'scout' | 'tutorial';

/** Tutorial contract definitions */
export const TUTORIAL_CONTRACTS = [
  {
    step: 1,
    title: 'First Haul',
    description: 'Buy 20 ore at the Hub market and deliver it to an adjacent Factory. This teaches market buying, inventory management, and basic shipping.',
    type: 'tutorial' as ContractType,
    reward: { credits: 100, reputation: 5 }
  },
  {
    step: 2,
    title: 'Factory Floor',
    description: 'At a Factory, produce 10 metal from ore. This teaches production recipes and resource conversion.',
    type: 'tutorial' as ContractType,
    reward: { credits: 150, reputation: 5 }
  },
  {
    step: 3,
    title: 'Supply Run',
    description: 'Craft and deposit 5 Supply Units to any Front zone. This teaches the SU recipe, supply mechanics, and multi-hop route planning.',
    type: 'tutorial' as ContractType,
    reward: { credits: 250, reputation: 10 }
  },
  {
    step: 4,
    title: 'Intel Sweep',
    description: 'Scan 3 different zones to gather intel. This teaches the intel system, freshness decay, and faction intel sharing.',
    type: 'tutorial' as ContractType,
    reward: { credits: 200, reputation: 5 }
  },
  {
    step: 5,
    title: 'Join the Fight',
    description: 'Join a faction and deposit any resource to the faction treasury. This teaches faction membership, treasury mechanics, and collaborative play.',
    type: 'tutorial' as ContractType,
    reward: { credits: 500, reputation: 15 }
  }
];

export interface Contract {
  id: string;

  type: ContractType;

  /** Who posted (player ID or faction ID) */
  posterId: string;
  posterType: 'player' | 'faction';

  /** Who accepted (null if open) */
  acceptedBy: string | null;

  /** Contract details (varies by type) */
  details: {
    // Haul: deliver cargo from A to B
    fromZoneId?: string;
    toZoneId?: string;
    resource?: Resource;
    quantity?: number;

    // Supply: deliver SU to a zone
    // uses toZoneId and quantity

    // Scout: gather fresh intel on a target
    targetId?: string;
    targetType?: 'zone' | 'route';
  };

  /** Deadline (tick) */
  deadline: number;

  /** Reward */
  reward: {
    credits: number;
    reputation: number;
  };

  /** Bonus for early completion */
  bonus?: {
    deadline: number;  // Earlier deadline
    credits: number;
  };

  status: 'open' | 'active' | 'completed' | 'failed' | 'expired';

  createdAt: number;
}

// ============================================================================
// EVENTS (for event sourcing)
// ============================================================================

export type GameEventType =
  | 'tick'
  | 'shipment_created'
  | 'shipment_moved'
  | 'shipment_arrived'
  | 'shipment_intercepted'
  | 'trade_executed'
  | 'order_placed'
  | 'order_cancelled'
  | 'zone_supplied'
  | 'zone_state_changed'
  | 'zone_captured'
  | 'combat_resolved'
  | 'intel_gathered'
  | 'contract_posted'
  | 'contract_accepted'
  | 'contract_completed'
  | 'contract_failed'
  | 'faction_created'
  | 'faction_joined'
  | 'faction_left'
  | 'player_action'
  | 'stockpile_deposited'
  | 'tutorial_completed'
  | 'doctrine_updated'
  | 'webhook_triggered'
  | 'zone_income'
  | 'season_zone_scored';

export interface GameEvent {
  id: string;
  type: GameEventType;
  tick: number;
  timestamp: Date;

  /** Actor (player/faction) who caused the event */
  actorId: string | null;
  actorType: 'player' | 'faction' | 'system';

  /** Event-specific data */
  data: Record<string, unknown>;
}

// ============================================================================
// SEASONS
// ============================================================================

/** Season configuration */
export const SEASON_CONFIG = {
  ticksPerWeek: 1008,        // 7 days * 144 ticks/day
  weeksPerSeason: 4,         // 4 weeks per season
  ticksPerSeason: 4032,      // 4 weeks * 1008 ticks

  // Scoring weights
  scoring: {
    zonesControlled: 100,     // per zone at season end
    supplyDelivered: 1,       // per SU delivered
    shipmentsCompleted: 10,   // per successful delivery
    contractsCompleted: 25,   // per contract completed
    reputationGained: 2,      // per reputation point gained
    combatVictories: 50,      // per successful defense/raid
  }
} as const;

/** Season score entry */
export interface SeasonScore {
  id: string;
  seasonNumber: number;
  entityId: string;           // player or faction ID
  entityType: 'player' | 'faction';
  entityName: string;

  // Score components
  zonesControlled: number;
  supplyDelivered: number;
  shipmentsCompleted: number;
  contractsCompleted: number;
  reputationGained: number;
  combatVictories: number;

  // Calculated total
  totalScore: number;

  // Ranking
  rank?: number;
}

/** Calculate total score from components */
export function calculateSeasonScore(score: Omit<SeasonScore, 'id' | 'totalScore' | 'rank'>): number {
  return (
    score.zonesControlled * SEASON_CONFIG.scoring.zonesControlled +
    score.supplyDelivered * SEASON_CONFIG.scoring.supplyDelivered +
    score.shipmentsCompleted * SEASON_CONFIG.scoring.shipmentsCompleted +
    score.contractsCompleted * SEASON_CONFIG.scoring.contractsCompleted +
    score.reputationGained * SEASON_CONFIG.scoring.reputationGained +
    score.combatVictories * SEASON_CONFIG.scoring.combatVictories
  );
}

// ============================================================================
// WORLD STATE
// ============================================================================

export interface WorldState {
  currentTick: number;
  seasonNumber: number;
  seasonWeek: number;

  zones: Map<string, Zone>;
  routes: Map<string, Route>;
  players: Map<string, Player>;
  factions: Map<string, Faction>;
  shipments: Map<string, Shipment>;
  units: Map<string, Unit>;
  orders: Map<string, MarketOrder>;
  contracts: Map<string, Contract>;
  intel: Map<string, IntelReport>;
}

// ============================================================================
// DOCTRINES (Phase 5)
// ============================================================================

export interface Doctrine {
  id: string;
  factionId: string;
  title: string;
  content: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

// ============================================================================
// WEBHOOKS (Phase 6)
// ============================================================================

export type WebhookEventType =
  | 'shipment_arrived' | 'shipment_intercepted'
  | 'zone_critical' | 'zone_collapsed' | 'zone_captured'
  | 'contract_completed' | 'contract_expired'
  | 'market_order_filled'
  | 'under_attack';

export interface Webhook {
  id: string;
  playerId: string;
  url: string;
  events: WebhookEventType[];
  active: boolean;
  createdAt: number;
  lastTriggeredAt: number | null;
  failCount: number;
}

// ============================================================================
// ADVANCED MARKET ORDERS (Phase 5)
// ============================================================================

export type AdvancedOrderType = 'conditional' | 'time_weighted';

export interface ConditionalOrder {
  id: string;
  playerId: string;
  zoneId: string;
  resource: Resource;
  side: 'buy' | 'sell';
  triggerPrice: number;
  quantity: number;
  condition: 'price_below' | 'price_above';
  status: 'active' | 'triggered' | 'cancelled';
  createdAt: number;
}

export interface TimeWeightedOrder {
  id: string;
  playerId: string;
  zoneId: string;
  resource: Resource;
  side: 'buy' | 'sell';
  price: number;
  totalQuantity: number;
  remainingQuantity: number;
  quantityPerTick: number;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: number;
}

// ============================================================================
// GARRISON (Phase 5)
// ============================================================================

export interface GarrisonUpgrade {
  level: number;
  defense: number;      // Passive capture defense multiplier
  raidResist: number;   // Passive raid resistance
  maintenance: number;  // Credits/tick to maintain
}

export const GARRISON_LEVELS: GarrisonUpgrade[] = [
  { level: 0, defense: 0, raidResist: 0, maintenance: 0 },
  { level: 1, defense: 0.1, raidResist: 0.1, maintenance: 10 },
  { level: 2, defense: 0.2, raidResist: 0.2, maintenance: 25 },
  { level: 3, defense: 0.35, raidResist: 0.35, maintenance: 50 },
  { level: 4, defense: 0.5, raidResist: 0.5, maintenance: 100 },
  { level: 5, defense: 0.75, raidResist: 0.75, maintenance: 200 },
];

// ============================================================================
// DIPLOMACY (Phase 5)
// ============================================================================

export type DiplomacyStatus = 'allied' | 'neutral' | 'war' | 'nap';

export interface DiplomacyRelation {
  factionId: string;
  targetFactionId: string;
  status: DiplomacyStatus;
  proposedBy: string;     // Player who proposed
  acceptedBy: string | null;
  createdAt: number;
}

// ============================================================================
// FACTION ANALYTICS (Phase 7)
// ============================================================================

export interface AuditLogEntry {
  id: string;
  factionId: string;
  playerId: string;
  action: string;
  details: Record<string, unknown>;
  tick: number;
  timestamp: Date;
}
