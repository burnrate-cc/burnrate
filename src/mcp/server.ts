/**
 * BURNRATE MCP Server
 * Model Context Protocol server for Claude Code integration
 *
 * This runs locally and connects to the hosted game API
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// API client for the hosted game server
class GameAPIClient {
  constructor(
    private baseUrl: string,
    private apiKey: string | null = null
  ) {}

  setApiKey(key: string) {
    this.apiKey = key;
  }

  private async request(
    method: string,
    path: string,
    body?: any,
    requiresAuth: boolean = true
  ): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (requiresAuth && this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `API error: ${response.status}`);
    }

    return data;
  }

  // Public endpoints
  async getServerStatus() {
    return this.request('GET', '/health', null, false);
  }

  async getWorldStatus() {
    return this.request('GET', '/world/status', null, false);
  }

  async join(name: string) {
    return this.request('POST', '/join', { name }, false);
  }

  // Authenticated endpoints
  async getMe() {
    return this.request('GET', '/me');
  }

  async getZones() {
    return this.request('GET', '/world/zones');
  }

  async getZone(id: string) {
    return this.request('GET', `/world/zones/${id}`);
  }

  async getRoutes(from?: string) {
    const query = from ? `?from=${from}` : '';
    return this.request('GET', `/routes${query}`);
  }

  async travel(to: string) {
    return this.request('POST', '/travel', { to });
  }

  async extract(quantity: number) {
    return this.request('POST', '/extract', { quantity });
  }

  async produce(output: string, quantity: number) {
    return this.request('POST', '/produce', { output, quantity });
  }

  async ship(type: string, path: string[], cargo: Record<string, number>) {
    return this.request('POST', '/ship', { type, path, cargo });
  }

  async getShipments() {
    return this.request('GET', '/shipments');
  }

  async placeOrder(resource: string, side: string, price: number, quantity: number) {
    return this.request('POST', '/market/order', { resource, side, price, quantity });
  }

  async getMarketOrders(resource?: string) {
    const query = resource ? `?resource=${resource}` : '';
    return this.request('GET', `/market/orders${query}`);
  }

  async scan(targetType: string, targetId: string) {
    return this.request('POST', '/scan', { targetType, targetId });
  }

  async supply(amount: number) {
    return this.request('POST', '/supply', { amount });
  }

  async capture() {
    return this.request('POST', '/capture');
  }

  async getUnits() {
    return this.request('GET', '/units');
  }

  async assignEscort(unitId: string, shipmentId: string) {
    return this.request('POST', `/units/${unitId}/escort`, { shipmentId });
  }

  async deployRaider(unitId: string, routeId: string) {
    return this.request('POST', `/units/${unitId}/raider`, { routeId });
  }

  async listUnitForSale(unitId: string, price: number) {
    return this.request('POST', `/units/${unitId}/sell`, { price });
  }

  async unlistUnit(unitId: string) {
    return this.request('DELETE', `/units/${unitId}/sell`);
  }

  async hireUnit(unitId: string) {
    return this.request('POST', `/hire/${unitId}`);
  }

  async getUnitsForSale() {
    return this.request('GET', '/market/units');
  }

  async getFactions() {
    return this.request('GET', '/factions');
  }

  async createFaction(name: string, tag: string) {
    return this.request('POST', '/factions', { name, tag });
  }

  async joinFaction(factionId: string) {
    return this.request('POST', `/factions/${factionId}/join`);
  }

  async leaveFaction() {
    return this.request('POST', '/factions/leave');
  }

  async getFactionDetails() {
    return this.request('GET', '/factions/mine');
  }

  async promoteFactionMember(playerId: string) {
    return this.request('POST', `/factions/members/${playerId}/promote`, { rank: 'officer' });
  }

  async demoteFactionMember(playerId: string) {
    return this.request('POST', `/factions/members/${playerId}/demote`, { rank: 'member' });
  }

  async kickFactionMember(playerId: string) {
    return this.request('DELETE', `/factions/members/${playerId}`);
  }

  async transferFactionLeadership(playerId: string) {
    return this.request('POST', '/factions/transfer-leadership', { targetPlayerId: playerId });
  }

  async depositToTreasury(resources: Record<string, number>) {
    return this.request('POST', '/factions/treasury/deposit', { resources });
  }

  async withdrawFromTreasury(resources: Record<string, number>) {
    return this.request('POST', '/factions/treasury/withdraw', { resources });
  }

  async getFactionIntel() {
    return this.request('GET', '/factions/intel');
  }

  async getContracts() {
    return this.request('GET', '/contracts');
  }

  async getMyContracts() {
    return this.request('GET', '/contracts/mine');
  }

  async createContract(
    type: string,
    details: any,
    reward: number,
    deadline: number,
    bonus?: number,
    bonusDeadline?: number
  ) {
    return this.request('POST', '/contracts', {
      type,
      ...details,
      reward,
      deadline,
      bonus,
      bonusDeadline
    });
  }

  async acceptContract(contractId: string) {
    return this.request('POST', `/contracts/${contractId}/accept`);
  }

  async completeContract(contractId: string) {
    return this.request('POST', `/contracts/${contractId}/complete`);
  }

  async cancelContract(contractId: string) {
    return this.request('DELETE', `/contracts/${contractId}`);
  }

  async getIntel(limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return this.request('GET', `/intel${query}`);
  }

  async getTargetIntel(targetType: string, targetId: string) {
    return this.request('GET', `/intel/${targetType}/${targetId}`);
  }

  async getSeasonStatus() {
    return this.request('GET', '/season');
  }

  async getLeaderboard(season?: number, type?: string, limit?: number) {
    const params = new URLSearchParams();
    if (season) params.append('season', String(season));
    if (type) params.append('type', type);
    if (limit) params.append('limit', String(limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request('GET', `/leaderboard${query}`);
  }

  async getSeasonScore(season?: number) {
    const query = season ? `?season=${season}` : '';
    return this.request('GET', `/season/me${query}`);
  }

  async getEvents(type?: string, limit?: number) {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (limit) params.append('limit', String(limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request('GET', `/events${query}`);
  }

  async getReputation() {
    return this.request('GET', '/reputation');
  }

  async getLicenses() {
    return this.request('GET', '/licenses');
  }

  async unlockLicense(type: string) {
    return this.request('POST', `/licenses/${type}/unlock`);
  }
}

// MCP Server
const API_URL = process.env.BURNRATE_API_URL || 'http://localhost:3000';
const client = new GameAPIClient(API_URL);

// Load API key from environment or config
if (process.env.BURNRATE_API_KEY) {
  client.setApiKey(process.env.BURNRATE_API_KEY);
}

const server = new Server(
  {
    name: 'burnrate',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ============================================================================
// TOOLS
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'burnrate_status',
        description: 'Get your current player status including inventory, location, and stats',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_join',
        description: 'Join the BURNRATE game with a new character. Returns your API key.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Your player name (2-20 characters)' }
          },
          required: ['name']
        }
      },
      {
        name: 'burnrate_set_api_key',
        description: 'Set your API key to authenticate with BURNRATE',
        inputSchema: {
          type: 'object',
          properties: {
            apiKey: { type: 'string', description: 'Your BURNRATE API key' }
          },
          required: ['apiKey']
        }
      },
      {
        name: 'burnrate_view',
        description: 'View the world map or a specific zone',
        inputSchema: {
          type: 'object',
          properties: {
            zoneId: { type: 'string', description: 'Optional: specific zone ID to view details' }
          },
          required: []
        }
      },
      {
        name: 'burnrate_routes',
        description: 'View available routes from your current location or a specified zone',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'Optional: zone ID to view routes from' }
          },
          required: []
        }
      },
      {
        name: 'burnrate_travel',
        description: 'Travel to an adjacent zone',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Zone ID to travel to' }
          },
          required: ['to']
        }
      },
      {
        name: 'burnrate_extract',
        description: 'Extract raw resources at a Field. Costs 5 credits per unit.',
        inputSchema: {
          type: 'object',
          properties: {
            quantity: { type: 'number', description: 'Amount to extract' }
          },
          required: ['quantity']
        }
      },
      {
        name: 'burnrate_produce',
        description: 'Produce resources or units at a Factory. Use recipe names: metal, chemicals, rations, textiles, ammo, medkits, parts, comms, escort, raider',
        inputSchema: {
          type: 'object',
          properties: {
            output: { type: 'string', description: 'What to produce' },
            quantity: { type: 'number', description: 'Amount to produce' }
          },
          required: ['output', 'quantity']
        }
      },
      {
        name: 'burnrate_ship',
        description: 'Send a shipment along a route. You must specify explicit waypoints.',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['courier', 'freight', 'convoy'], description: 'Shipment type' },
            path: { type: 'array', items: { type: 'string' }, description: 'Array of zone IDs forming the route' },
            cargo: { type: 'object', description: 'Cargo as {resource: amount}' }
          },
          required: ['type', 'path', 'cargo']
        }
      },
      {
        name: 'burnrate_shipments',
        description: 'View your active shipments',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_market_buy',
        description: 'Place a buy order on the market',
        inputSchema: {
          type: 'object',
          properties: {
            resource: { type: 'string', description: 'Resource to buy' },
            price: { type: 'number', description: 'Max price per unit' },
            quantity: { type: 'number', description: 'Amount to buy' }
          },
          required: ['resource', 'price', 'quantity']
        }
      },
      {
        name: 'burnrate_market_sell',
        description: 'Place a sell order on the market',
        inputSchema: {
          type: 'object',
          properties: {
            resource: { type: 'string', description: 'Resource to sell' },
            price: { type: 'number', description: 'Price per unit' },
            quantity: { type: 'number', description: 'Amount to sell' }
          },
          required: ['resource', 'price', 'quantity']
        }
      },
      {
        name: 'burnrate_market_view',
        description: 'View market orders at your current location',
        inputSchema: {
          type: 'object',
          properties: {
            resource: { type: 'string', description: 'Optional: filter by resource' }
          },
          required: []
        }
      },
      {
        name: 'burnrate_scan',
        description: 'Gather intel on a zone or route. Intel is shared with your faction.',
        inputSchema: {
          type: 'object',
          properties: {
            targetType: { type: 'string', enum: ['zone', 'route'], description: 'What to scan' },
            targetId: { type: 'string', description: 'Zone or route ID' }
          },
          required: ['targetType', 'targetId']
        }
      },
      {
        name: 'burnrate_supply',
        description: 'Deposit Supply Units to a zone. Requires 2 rations + 1 fuel + 1 parts + 1 ammo per SU.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Number of SU to deposit' }
          },
          required: ['amount']
        }
      },
      {
        name: 'burnrate_capture',
        description: 'Capture your current zone for your faction. Zone must be neutral or collapsed.',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_units',
        description: 'View your military units',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_units_escort',
        description: 'Assign an escort unit to protect a shipment',
        inputSchema: {
          type: 'object',
          properties: {
            unitId: { type: 'string', description: 'Escort unit ID' },
            shipmentId: { type: 'string', description: 'Shipment ID to protect' }
          },
          required: ['unitId', 'shipmentId']
        }
      },
      {
        name: 'burnrate_units_raider',
        description: 'Deploy a raider unit to interdict a route',
        inputSchema: {
          type: 'object',
          properties: {
            unitId: { type: 'string', description: 'Raider unit ID' },
            routeId: { type: 'string', description: 'Route ID to interdict' }
          },
          required: ['unitId', 'routeId']
        }
      },
      {
        name: 'burnrate_units_sell',
        description: 'List a unit for sale at a Hub',
        inputSchema: {
          type: 'object',
          properties: {
            unitId: { type: 'string', description: 'Unit ID to sell' },
            price: { type: 'number', description: 'Sale price in credits' }
          },
          required: ['unitId', 'price']
        }
      },
      {
        name: 'burnrate_hire',
        description: 'Buy a unit listed for sale at your current Hub',
        inputSchema: {
          type: 'object',
          properties: {
            unitId: { type: 'string', description: 'Unit ID to buy' }
          },
          required: ['unitId']
        }
      },
      {
        name: 'burnrate_faction_create',
        description: 'Create a new faction',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Faction name' },
            tag: { type: 'string', description: 'Faction tag (2-5 characters)' }
          },
          required: ['name', 'tag']
        }
      },
      {
        name: 'burnrate_faction_join',
        description: 'Join an existing faction',
        inputSchema: {
          type: 'object',
          properties: {
            factionId: { type: 'string', description: 'Faction ID to join' }
          },
          required: ['factionId']
        }
      },
      {
        name: 'burnrate_faction_leave',
        description: 'Leave your current faction',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_faction_intel',
        description: 'View intel shared by your faction members',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_factions',
        description: 'List all factions',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_faction_details',
        description: 'Get detailed info about your faction including treasury, members, and controlled zones',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_faction_promote',
        description: 'Promote a faction member to officer (founder only)',
        inputSchema: {
          type: 'object',
          properties: {
            playerId: { type: 'string', description: 'Player ID to promote' }
          },
          required: ['playerId']
        }
      },
      {
        name: 'burnrate_faction_demote',
        description: 'Demote a faction member to member (founder only)',
        inputSchema: {
          type: 'object',
          properties: {
            playerId: { type: 'string', description: 'Player ID to demote' }
          },
          required: ['playerId']
        }
      },
      {
        name: 'burnrate_faction_kick',
        description: 'Kick a member from your faction (founder/officer)',
        inputSchema: {
          type: 'object',
          properties: {
            playerId: { type: 'string', description: 'Player ID to kick' }
          },
          required: ['playerId']
        }
      },
      {
        name: 'burnrate_faction_transfer',
        description: 'Transfer faction leadership to another member (founder only)',
        inputSchema: {
          type: 'object',
          properties: {
            playerId: { type: 'string', description: 'Player ID to transfer leadership to' }
          },
          required: ['playerId']
        }
      },
      {
        name: 'burnrate_treasury_deposit',
        description: 'Deposit resources to your faction treasury',
        inputSchema: {
          type: 'object',
          properties: {
            resources: { type: 'object', description: 'Resources to deposit as {resource: amount}' }
          },
          required: ['resources']
        }
      },
      {
        name: 'burnrate_treasury_withdraw',
        description: 'Withdraw resources from faction treasury (founder/officer)',
        inputSchema: {
          type: 'object',
          properties: {
            resources: { type: 'object', description: 'Resources to withdraw as {resource: amount}' }
          },
          required: ['resources']
        }
      },
      {
        name: 'burnrate_contracts',
        description: 'View available open contracts that you can accept',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_contracts_mine',
        description: 'View contracts you have posted or accepted',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_contract_create',
        description: 'Post a new contract. Types: haul (deliver cargo A->B), supply (deliver SU to zone), scout (gather intel on target). Reward credits are escrowed.',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['haul', 'supply', 'scout'], description: 'Contract type' },
            fromZoneId: { type: 'string', description: 'For haul: pickup zone' },
            toZoneId: { type: 'string', description: 'For haul/supply: destination zone' },
            resource: { type: 'string', description: 'For haul: resource type to deliver' },
            quantity: { type: 'number', description: 'For haul/supply: amount to deliver' },
            targetType: { type: 'string', enum: ['zone', 'route'], description: 'For scout: target type' },
            targetId: { type: 'string', description: 'For scout: zone or route ID' },
            reward: { type: 'number', description: 'Credits paid on completion' },
            deadline: { type: 'number', description: 'Ticks until expiration' },
            bonus: { type: 'number', description: 'Optional: bonus credits for early completion' },
            bonusDeadline: { type: 'number', description: 'Optional: ticks until bonus expires' }
          },
          required: ['type', 'reward', 'deadline']
        }
      },
      {
        name: 'burnrate_contract_accept',
        description: 'Accept a contract to work on it',
        inputSchema: {
          type: 'object',
          properties: {
            contractId: { type: 'string', description: 'Contract ID to accept' }
          },
          required: ['contractId']
        }
      },
      {
        name: 'burnrate_contract_complete',
        description: 'Complete an accepted contract and receive the reward. Must have met all requirements.',
        inputSchema: {
          type: 'object',
          properties: {
            contractId: { type: 'string', description: 'Contract ID to complete' }
          },
          required: ['contractId']
        }
      },
      {
        name: 'burnrate_contract_cancel',
        description: 'Cancel a contract you posted (only if not yet accepted). Refunds escrowed credits.',
        inputSchema: {
          type: 'object',
          properties: {
            contractId: { type: 'string', description: 'Contract ID to cancel' }
          },
          required: ['contractId']
        }
      },
      {
        name: 'burnrate_season',
        description: 'View current season info including week number and time remaining',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_leaderboard',
        description: 'View season leaderboard rankings',
        inputSchema: {
          type: 'object',
          properties: {
            season: { type: 'number', description: 'Optional: season number (default: current)' },
            type: { type: 'string', enum: ['player', 'faction'], description: 'Optional: filter by player or faction' },
            limit: { type: 'number', description: 'Optional: max entries (default 50, max 100)' }
          },
          required: []
        }
      },
      {
        name: 'burnrate_season_score',
        description: 'View your season score and ranking',
        inputSchema: {
          type: 'object',
          properties: {
            season: { type: 'number', description: 'Optional: season number (default: current)' }
          },
          required: []
        }
      },
      {
        name: 'burnrate_events',
        description: 'View your event history. History depth depends on your tier (freelance: 200, operator: 10k, command: 100k)',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Optional: filter by event type' },
            limit: { type: 'number', description: 'Optional: max events to return (capped by tier)' }
          },
          required: []
        }
      },
      {
        name: 'burnrate_reputation',
        description: 'View your reputation score, title, and progress to next title',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_licenses',
        description: 'View your license status and requirements for unlocking new shipment types',
        inputSchema: { type: 'object', properties: {}, required: [] }
      },
      {
        name: 'burnrate_license_unlock',
        description: 'Unlock a shipment license. Requires reputation and credits.',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['freight', 'convoy'], description: 'License type to unlock' }
          },
          required: ['type']
        }
      },
      {
        name: 'burnrate_intel',
        description: 'View your gathered intel. Intel decays over time: fresh (<10 ticks), stale (10-50 ticks), or expired (>50 ticks). Stale intel has reduced accuracy; expired intel is unreliable.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max number of intel reports to return (default 100, max 500)' }
          },
          required: []
        }
      },
      {
        name: 'burnrate_intel_target',
        description: 'Get your most recent intel on a specific zone or route. Shows freshness status and decayed data if intel is old.',
        inputSchema: {
          type: 'object',
          properties: {
            targetType: { type: 'string', enum: ['zone', 'route'], description: 'Type of target' },
            targetId: { type: 'string', description: 'Zone or route ID' }
          },
          required: ['targetType', 'targetId']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: any;

    switch (name) {
      case 'burnrate_status':
        result = await client.getMe();
        break;

      case 'burnrate_join':
        result = await client.join(args?.name as string);
        if (result.apiKey) {
          client.setApiKey(result.apiKey);
        }
        break;

      case 'burnrate_set_api_key':
        client.setApiKey(args?.apiKey as string);
        result = { success: true, message: 'API key set. Use burnrate_status to verify.' };
        break;

      case 'burnrate_view':
        if (args?.zoneId) {
          result = await client.getZone(args.zoneId as string);
        } else {
          result = await client.getZones();
        }
        break;

      case 'burnrate_routes':
        result = await client.getRoutes(args?.from as string);
        break;

      case 'burnrate_travel':
        result = await client.travel(args?.to as string);
        break;

      case 'burnrate_extract':
        result = await client.extract(args?.quantity as number);
        break;

      case 'burnrate_produce':
        result = await client.produce(args?.output as string, args?.quantity as number);
        break;

      case 'burnrate_ship':
        result = await client.ship(
          args?.type as string,
          args?.path as string[],
          args?.cargo as Record<string, number>
        );
        break;

      case 'burnrate_shipments':
        result = await client.getShipments();
        break;

      case 'burnrate_market_buy':
        result = await client.placeOrder(
          args?.resource as string,
          'buy',
          args?.price as number,
          args?.quantity as number
        );
        break;

      case 'burnrate_market_sell':
        result = await client.placeOrder(
          args?.resource as string,
          'sell',
          args?.price as number,
          args?.quantity as number
        );
        break;

      case 'burnrate_market_view':
        result = await client.getMarketOrders(args?.resource as string);
        break;

      case 'burnrate_scan':
        result = await client.scan(args?.targetType as string, args?.targetId as string);
        break;

      case 'burnrate_supply':
        result = await client.supply(args?.amount as number);
        break;

      case 'burnrate_capture':
        result = await client.capture();
        break;

      case 'burnrate_units':
        result = await client.getUnits();
        break;

      case 'burnrate_units_escort':
        result = await client.assignEscort(args?.unitId as string, args?.shipmentId as string);
        break;

      case 'burnrate_units_raider':
        result = await client.deployRaider(args?.unitId as string, args?.routeId as string);
        break;

      case 'burnrate_units_sell':
        result = await client.listUnitForSale(args?.unitId as string, args?.price as number);
        break;

      case 'burnrate_hire':
        result = await client.hireUnit(args?.unitId as string);
        break;

      case 'burnrate_faction_create':
        result = await client.createFaction(args?.name as string, args?.tag as string);
        break;

      case 'burnrate_faction_join':
        result = await client.joinFaction(args?.factionId as string);
        break;

      case 'burnrate_faction_leave':
        result = await client.leaveFaction();
        break;

      case 'burnrate_faction_intel':
        result = await client.getFactionIntel();
        break;

      case 'burnrate_factions':
        result = await client.getFactions();
        break;

      case 'burnrate_faction_details':
        result = await client.getFactionDetails();
        break;

      case 'burnrate_faction_promote':
        result = await client.promoteFactionMember(args?.playerId as string);
        break;

      case 'burnrate_faction_demote':
        result = await client.demoteFactionMember(args?.playerId as string);
        break;

      case 'burnrate_faction_kick':
        result = await client.kickFactionMember(args?.playerId as string);
        break;

      case 'burnrate_faction_transfer':
        result = await client.transferFactionLeadership(args?.playerId as string);
        break;

      case 'burnrate_treasury_deposit':
        result = await client.depositToTreasury(args?.resources as Record<string, number>);
        break;

      case 'burnrate_treasury_withdraw':
        result = await client.withdrawFromTreasury(args?.resources as Record<string, number>);
        break;

      case 'burnrate_contracts':
        result = await client.getContracts();
        break;

      case 'burnrate_contracts_mine':
        result = await client.getMyContracts();
        break;

      case 'burnrate_contract_create':
        result = await client.createContract(
          args?.type as string,
          {
            fromZoneId: args?.fromZoneId,
            toZoneId: args?.toZoneId,
            resource: args?.resource,
            quantity: args?.quantity,
            targetType: args?.targetType,
            targetId: args?.targetId
          },
          args?.reward as number,
          args?.deadline as number,
          args?.bonus as number | undefined,
          args?.bonusDeadline as number | undefined
        );
        break;

      case 'burnrate_contract_accept':
        result = await client.acceptContract(args?.contractId as string);
        break;

      case 'burnrate_contract_complete':
        result = await client.completeContract(args?.contractId as string);
        break;

      case 'burnrate_contract_cancel':
        result = await client.cancelContract(args?.contractId as string);
        break;

      case 'burnrate_intel':
        result = await client.getIntel(args?.limit as number);
        break;

      case 'burnrate_intel_target':
        result = await client.getTargetIntel(args?.targetType as string, args?.targetId as string);
        break;

      case 'burnrate_season':
        result = await client.getSeasonStatus();
        break;

      case 'burnrate_leaderboard':
        result = await client.getLeaderboard(
          args?.season as number,
          args?.type as string,
          args?.limit as number
        );
        break;

      case 'burnrate_season_score':
        result = await client.getSeasonScore(args?.season as number);
        break;

      case 'burnrate_events':
        result = await client.getEvents(args?.type as string, args?.limit as number);
        break;

      case 'burnrate_reputation':
        result = await client.getReputation();
        break;

      case 'burnrate_licenses':
        result = await client.getLicenses();
        break;

      case 'burnrate_license_unlock':
        result = await client.unlockLicense(args?.type as string);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
});

// ============================================================================
// RESOURCES
// ============================================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'burnrate://status',
        name: 'Player Status',
        description: 'Current player status, inventory, location, and stats',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://world',
        name: 'World Status',
        description: 'Current world state including tick, season, and week',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://zones',
        name: 'Zone Map',
        description: 'All zones with types, controllers, and supply levels',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://routes',
        name: 'Route Network',
        description: 'All routes from your current location',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://shipments',
        name: 'Active Shipments',
        description: 'Your shipments currently in transit',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://units',
        name: 'Military Units',
        description: 'Your escort and raider units with their status',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://market',
        name: 'Market Orders',
        description: 'Buy and sell orders at your current location',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://contracts',
        name: 'Available Contracts',
        description: 'Open contracts you can accept',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://intel',
        name: 'Intel Reports',
        description: 'Your gathered intelligence with freshness status',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://faction',
        name: 'Faction Details',
        description: 'Your faction info including members and controlled zones',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://leaderboard',
        name: 'Season Leaderboard',
        description: 'Current season rankings',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://reputation',
        name: 'Reputation',
        description: 'Your reputation score, title, and progress',
        mimeType: 'application/json'
      },
      {
        uri: 'burnrate://licenses',
        name: 'License Status',
        description: 'Your shipment licenses and requirements to unlock more',
        mimeType: 'application/json'
      }
    ]
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    let data: any;

    switch (uri) {
      case 'burnrate://status':
        data = await client.getMe();
        break;
      case 'burnrate://world':
        data = await client.getWorldStatus();
        break;
      case 'burnrate://zones':
        data = await client.getZones();
        break;
      case 'burnrate://routes':
        data = await client.getRoutes();
        break;
      case 'burnrate://shipments':
        data = await client.getShipments();
        break;
      case 'burnrate://units':
        data = await client.getUnits();
        break;
      case 'burnrate://market':
        data = await client.getMarketOrders();
        break;
      case 'burnrate://contracts':
        data = await client.getContracts();
        break;
      case 'burnrate://intel':
        data = await client.getIntel(100);
        break;
      case 'burnrate://faction':
        data = await client.getFactionDetails();
        break;
      case 'burnrate://leaderboard':
        data = await client.getLeaderboard();
        break;
      case 'burnrate://reputation':
        data = await client.getReputation();
        break;
      case 'burnrate://licenses':
        data = await client.getLicenses();
        break;
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    };
  }
});

// ============================================================================
// PROMPTS
// ============================================================================

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'situation_analysis',
        description: 'Analyze your current game situation and suggest immediate priorities',
        arguments: []
      },
      {
        name: 'route_planning',
        description: 'Find safe and profitable shipping routes from a zone',
        arguments: [
          {
            name: 'from',
            description: 'Starting zone ID (defaults to current location)',
            required: false
          },
          {
            name: 'destination',
            description: 'Target zone ID if you have a specific destination',
            required: false
          }
        ]
      },
      {
        name: 'threat_assessment',
        description: 'Assess threats in a zone or along a route using available intel',
        arguments: [
          {
            name: 'target',
            description: 'Zone ID or route ID to assess',
            required: true
          }
        ]
      },
      {
        name: 'trade_opportunities',
        description: 'Analyze market conditions to find profitable trades',
        arguments: [
          {
            name: 'resource',
            description: 'Specific resource to analyze (optional)',
            required: false
          }
        ]
      },
      {
        name: 'mission_briefing',
        description: 'Get a mission briefing for a specific task type',
        arguments: [
          {
            name: 'mission_type',
            description: 'Type of mission: extraction, production, shipping, capture, or contract',
            required: true
          }
        ]
      },
      {
        name: 'faction_strategy',
        description: 'Analyze faction standing and suggest strategic priorities',
        arguments: []
      },
      {
        name: 'season_progress',
        description: 'Review your season performance and suggest ways to climb the leaderboard',
        arguments: []
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Helper to safely fetch data with error handling
  const safeFetch = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  try {
    switch (name) {
      case 'situation_analysis': {
        const [status, world, shipments, units, intel] = await Promise.all([
          safeFetch(() => client.getMe(), null),
          safeFetch(() => client.getWorldStatus(), null),
          safeFetch(() => client.getShipments(), { shipments: [] }),
          safeFetch(() => client.getUnits(), { units: [] }),
          safeFetch(() => client.getIntel(20), { intel: [] })
        ]);

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Analyze my current BURNRATE situation and suggest immediate priorities.

## My Status
${status ? JSON.stringify(status, null, 2) : 'Unable to fetch status - you may need to authenticate first'}

## World State
${world ? JSON.stringify(world, null, 2) : 'Unable to fetch world state'}

## Active Shipments
${JSON.stringify(shipments, null, 2)}

## Military Units
${JSON.stringify(units, null, 2)}

## Recent Intel (newest first)
${JSON.stringify(intel, null, 2)}

Based on this data:
1. What is my current situation? (resources, location, threats)
2. What are my most pressing needs?
3. What are 3 immediate actions I should take?
4. Any warnings or threats I should be aware of?`
              }
            }
          ]
        };
      }

      case 'route_planning': {
        const from = args?.from as string | undefined;
        const destination = args?.destination as string | undefined;

        const [status, routes, zones, intel] = await Promise.all([
          safeFetch(() => client.getMe(), null),
          safeFetch(() => client.getRoutes(from), { routes: [] }),
          safeFetch(() => client.getZones(), { zones: [] }),
          safeFetch(() => client.getIntel(50), { intel: [] })
        ]);

        const currentLocation = from || (status as any)?.location || 'unknown';

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Help me plan shipping routes in BURNRATE.

## Starting Point
${currentLocation}
${destination ? `\n## Desired Destination\n${destination}` : ''}

## Available Routes from ${currentLocation}
${JSON.stringify(routes, null, 2)}

## Zone Information
${JSON.stringify(zones, null, 2)}

## Intel on Routes and Zones
${JSON.stringify(intel, null, 2)}

Analyze the routes and recommend:
1. Safest route (lowest raider activity)
2. Most profitable route (good trading opportunities)
3. Fastest route to a production hub
4. Any routes to avoid and why
5. Recommended cargo for each route based on destination zone needs`
              }
            }
          ]
        };
      }

      case 'threat_assessment': {
        const target = args?.target as string;
        if (!target) {
          throw new Error('Target zone or route ID is required');
        }

        const [intel, zones] = await Promise.all([
          safeFetch(() => client.getIntel(100), { intel: [] }),
          safeFetch(() => client.getZones(), { zones: [] })
        ]);

        // Filter intel relevant to the target
        const relevantIntel = (intel as any).intel?.filter((i: any) =>
          i.targetId === target || i.targetId?.includes(target)
        ) || [];

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Assess threats for target: ${target}

## All Intel
${JSON.stringify(intel, null, 2)}

## Relevant Intel for ${target}
${JSON.stringify(relevantIntel, null, 2)}

## Zone Data
${JSON.stringify(zones, null, 2)}

Provide a threat assessment:
1. Threat level (low/medium/high/critical)
2. Known hostile units in the area
3. Recent hostile activity
4. Intel freshness (is our data reliable?)
5. Recommended precautions
6. Best time/approach for operations here`
              }
            }
          ]
        };
      }

      case 'trade_opportunities': {
        const resource = args?.resource as string | undefined;

        const [status, market, zones] = await Promise.all([
          safeFetch(() => client.getMe(), null),
          safeFetch(() => client.getMarketOrders(resource), { orders: [] }),
          safeFetch(() => client.getZones(), { zones: [] })
        ]);

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Analyze trade opportunities${resource ? ` for ${resource}` : ''}.

## My Status
${JSON.stringify(status, null, 2)}

## Market Orders${resource ? ` (${resource})` : ''}
${JSON.stringify(market, null, 2)}

## Zone Economy
${JSON.stringify(zones, null, 2)}

Find profitable trades:
1. Best buy opportunities (underpriced resources)
2. Best sell opportunities (high demand)
3. Arbitrage opportunities between zones
4. Resources I should stockpile
5. Market trends and predictions
6. Recommended trade routes`
              }
            }
          ]
        };
      }

      case 'mission_briefing': {
        const missionType = args?.mission_type as string;
        if (!missionType) {
          throw new Error('Mission type is required: extraction, production, shipping, capture, or contract');
        }

        const [status, zones, routes, contracts, licenses] = await Promise.all([
          safeFetch(() => client.getMe(), null),
          safeFetch(() => client.getZones(), { zones: [] }),
          safeFetch(() => client.getRoutes(), { routes: [] }),
          safeFetch(() => client.getContracts(), { contracts: [] }),
          safeFetch(() => client.getLicenses(), null)
        ]);

        const missionInstructions: Record<string, string> = {
          extraction: `EXTRACTION MISSION
Goal: Gather raw resources from Field zones.
Requirements: Be at a Field zone, have 5 credits per unit to extract.
Process: Use burnrate_extract to gather raw materials.`,
          production: `PRODUCTION MISSION
Goal: Convert resources into valuable goods or military units at Factories.
Requirements: Be at a Factory zone, have required input resources.
Process: Use burnrate_produce with recipe name and quantity.`,
          shipping: `SHIPPING MISSION
Goal: Transport cargo safely between zones.
Requirements: Licensed for shipment type, cargo in inventory, valid route.
Process: Plan route, load cargo, use burnrate_ship, optionally assign escorts.`,
          capture: `CAPTURE MISSION
Goal: Take control of a neutral or collapsed zone for your faction.
Requirements: Be in faction, zone must be neutral/collapsed.
Process: Travel to target, use burnrate_capture.`,
          contract: `CONTRACT MISSION
Goal: Complete contracts for rewards.
Types: haul (deliver cargo), supply (deliver SU), scout (gather intel).
Process: Find contract with burnrate_contracts, accept it, complete requirements.`
        };

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Mission Briefing: ${missionType.toUpperCase()}

${missionInstructions[missionType] || 'Unknown mission type. Valid types: extraction, production, shipping, capture, contract'}

## My Current Status
${JSON.stringify(status, null, 2)}

## Zone Data
${JSON.stringify(zones, null, 2)}

## Available Routes
${JSON.stringify(routes, null, 2)}

${missionType === 'contract' ? `## Open Contracts\n${JSON.stringify(contracts, null, 2)}` : ''}

${missionType === 'shipping' ? `## My Licenses\n${JSON.stringify(licenses, null, 2)}` : ''}

Provide a mission plan:
1. Am I ready for this mission? What do I need?
2. Best location/target for this mission
3. Step-by-step execution plan
4. Risks and mitigations
5. Expected rewards`
              }
            }
          ]
        };
      }

      case 'faction_strategy': {
        const [faction, zones, intel, leaderboard] = await Promise.all([
          safeFetch(() => client.getFactionDetails(), null),
          safeFetch(() => client.getZones(), { zones: [] }),
          safeFetch(() => client.getIntel(50), { intel: [] }),
          safeFetch(() => client.getLeaderboard(undefined, 'faction', 20), { leaderboard: [] })
        ]);

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Analyze faction strategy and suggest priorities.

## My Faction
${faction ? JSON.stringify(faction, null, 2) : 'Not in a faction'}

## Territory Map
${JSON.stringify(zones, null, 2)}

## Intel
${JSON.stringify(intel, null, 2)}

## Faction Leaderboard
${JSON.stringify(leaderboard, null, 2)}

Provide strategic analysis:
1. Current faction strength and position
2. Vulnerable zones we control
3. Expansion opportunities
4. Threats from other factions
5. Resource priorities for faction growth
6. Recommended coordination with faction members`
              }
            }
          ]
        };
      }

      case 'season_progress': {
        const [score, leaderboard, reputation, season] = await Promise.all([
          safeFetch(() => client.getSeasonScore(), null),
          safeFetch(() => client.getLeaderboard(undefined, 'player', 50), { leaderboard: [] }),
          safeFetch(() => client.getReputation(), null),
          safeFetch(() => client.getSeasonStatus(), null)
        ]);

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Review my season progress and suggest improvements.

## Season Status
${JSON.stringify(season, null, 2)}

## My Season Score
${JSON.stringify(score, null, 2)}

## My Reputation
${JSON.stringify(reputation, null, 2)}

## Player Leaderboard
${JSON.stringify(leaderboard, null, 2)}

Analyze my progress:
1. Current ranking and gap to top players
2. My strongest scoring categories
3. Categories where I'm underperforming
4. Specific actions to gain more points
5. Time remaining and realistic goals
6. Reputation grind progress`
              }
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  } catch (error) {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Error generating prompt: ${error instanceof Error ? error.message : String(error)}`
          }
        }
      ]
    };
  }
});

// ============================================================================
// START SERVER
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BURNRATE MCP Server running');
}

main().catch(console.error);
