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
  if (fieldName.includes('Ore')) return 'ore';
  if (fieldName.includes('Fuel')) return 'fuel';
  if (fieldName.includes('Grain')) return 'grain';
  if (fieldName.includes('Fiber')) return 'fiber';
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
}

export type SupplyState = 'supplied' | 'strained' | 'critical' | 'collapsed';

export function getSupplyState(supplyLevel: number): SupplyState {
  if (supplyLevel >= 100) return 'supplied';
  if (supplyLevel >= 50) return 'strained';
  if (supplyLevel > 0) return 'critical';
  return 'collapsed';
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

export type ContractType = 'haul' | 'produce' | 'scout' | 'escort';

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
    // Haul
    fromZoneId?: string;
    toZoneId?: string;
    cargo?: Partial<Inventory>;

    // Produce
    zoneId?: string;
    produceResource?: Resource | 'su';
    produceQuantity?: number;

    // Scout
    targetId?: string;
    targetType?: 'zone' | 'route';
    durationTicks?: number;

    // Escort
    shipmentId?: string;
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
  | 'player_action';

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
