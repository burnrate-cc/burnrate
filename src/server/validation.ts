/**
 * BURNRATE API Validation Schemas
 * Using Zod for runtime validation
 */

import { z } from 'zod';

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

// Tradeable resources (excluding credits which is currency)
export const ResourceSchema = z.enum([
  'ore', 'fuel', 'grain', 'fiber',
  'metal', 'chemicals', 'rations', 'textiles',
  'ammo', 'medkits', 'parts', 'comms'
]);

// All inventory items including credits
export const InventoryItemSchema = z.enum([
  'ore', 'fuel', 'grain', 'fiber',
  'metal', 'chemicals', 'rations', 'textiles',
  'ammo', 'medkits', 'parts', 'comms',
  'credits'
]);

export const ShipmentTypeSchema = z.enum(['courier', 'freight', 'convoy']);

export const ContractTypeSchema = z.enum(['haul', 'supply', 'scout']);

export const FactionRankSchema = z.enum(['founder', 'officer', 'member']);

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

export const JoinSchema = z.object({
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(20, 'Name must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Name can only contain letters, numbers, underscores, and hyphens')
});

export const TravelSchema = z.object({
  to: z.string().min(1, 'Destination zone ID required')
});

export const ExtractSchema = z.object({
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(1000, 'Quantity cannot exceed 1000')
});

export const ProduceSchema = z.object({
  output: z.string().min(1, 'Output type required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity cannot exceed 100')
});

export const CargoSchema = z.object({
  ore: z.number().int().min(0).max(10000).default(0),
  fuel: z.number().int().min(0).max(10000).default(0),
  grain: z.number().int().min(0).max(10000).default(0),
  fiber: z.number().int().min(0).max(10000).default(0),
  metal: z.number().int().min(0).max(10000).default(0),
  chemicals: z.number().int().min(0).max(10000).default(0),
  rations: z.number().int().min(0).max(10000).default(0),
  textiles: z.number().int().min(0).max(10000).default(0),
  ammo: z.number().int().min(0).max(10000).default(0),
  medkits: z.number().int().min(0).max(10000).default(0),
  parts: z.number().int().min(0).max(10000).default(0),
  comms: z.number().int().min(0).max(10000).default(0),
}).refine(
  (cargo) => Object.values(cargo).some(v => v > 0),
  'Cargo must contain at least one resource'
);

export const ShipSchema = z.object({
  type: ShipmentTypeSchema,
  path: z.array(z.string()).min(2, 'Path must have at least origin and destination'),
  cargo: CargoSchema
});

export const MarketOrderSchema = z.object({
  resource: ResourceSchema,
  side: z.enum(['buy', 'sell']),
  price: z.number().int().min(1, 'Price must be at least 1').max(100000, 'Price cannot exceed 100000'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10000, 'Quantity cannot exceed 10000')
});

export const ScanSchema = z.object({
  targetType: z.enum(['zone', 'route']),
  targetId: z.string().min(1, 'Target ID required')
});

export const SupplySchema = z.object({
  amount: z.number().int().min(1, 'Amount must be at least 1').max(1000, 'Amount cannot exceed 1000')
});

export const EscortAssignSchema = z.object({
  shipmentId: z.string().min(1, 'Shipment ID required')
});

export const RaiderDeploySchema = z.object({
  routeId: z.string().min(1, 'Route ID required')
});

export const UnitSellSchema = z.object({
  price: z.number().int().min(1, 'Price must be at least 1').max(100000, 'Price cannot exceed 100000')
});

export const FactionCreateSchema = z.object({
  name: z.string()
    .min(3, 'Faction name must be at least 3 characters')
    .max(30, 'Faction name must be at most 30 characters'),
  tag: z.string()
    .min(2, 'Tag must be at least 2 characters')
    .max(5, 'Tag must be at most 5 characters')
    .regex(/^[A-Z0-9]+$/, 'Tag must be uppercase letters and numbers only')
});

export const ContractCreateSchema = z.object({
  type: ContractTypeSchema,
  fromZoneId: z.string().optional(),
  toZoneId: z.string().optional(),
  resource: ResourceSchema.optional(),
  quantity: z.number().int().min(1).max(10000).optional(),
  reward: z.number().int().min(1, 'Reward must be at least 1').max(100000),
  deadline: z.number().int().min(10, 'Deadline must be at least 10 ticks').max(1000, 'Deadline cannot exceed 1000 ticks'),
  bonus: z.number().int().min(0).max(100000).optional(),
  bonusDeadline: z.number().int().min(1).optional()
}).refine(
  (data) => {
    if (data.type === 'haul') {
      return data.fromZoneId && data.toZoneId && data.resource && data.quantity;
    }
    if (data.type === 'supply') {
      return data.toZoneId && data.quantity;
    }
    if (data.type === 'scout') {
      return data.toZoneId;
    }
    return false;
  },
  'Missing required fields for contract type'
);

export const WebhookCreateSchema = z.object({
  url: z.string().url('Invalid webhook URL'),
  events: z.array(z.enum([
    'shipment_arrived',
    'shipment_intercepted',
    'zone_critical',
    'zone_captured',
    'contract_completed',
    'market_order_filled',
    'under_attack'
  ])).min(1, 'Must subscribe to at least one event')
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type JoinRequest = z.infer<typeof JoinSchema>;
export type TravelRequest = z.infer<typeof TravelSchema>;
export type ExtractRequest = z.infer<typeof ExtractSchema>;
export type ProduceRequest = z.infer<typeof ProduceSchema>;
export type ShipRequest = z.infer<typeof ShipSchema>;
export type MarketOrderRequest = z.infer<typeof MarketOrderSchema>;
export type ScanRequest = z.infer<typeof ScanSchema>;
export type SupplyRequest = z.infer<typeof SupplySchema>;
export type FactionCreateRequest = z.infer<typeof FactionCreateSchema>;
export type ContractCreateRequest = z.infer<typeof ContractCreateSchema>;
export type WebhookCreateRequest = z.infer<typeof WebhookCreateSchema>;
