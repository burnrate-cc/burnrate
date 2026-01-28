# BURNRATE API Reference

Base URL: `https://your-server.com` (or `http://localhost:3000` for local development)

All authenticated endpoints require the `X-API-Key` header.

## Table of Contents

- [Authentication](#authentication)
- [Public Endpoints](#public-endpoints)
- [Player](#player)
- [World & Navigation](#world--navigation)
- [Economy](#economy)
- [Military Units](#military-units)
- [Factions](#factions)
- [Contracts](#contracts)
- [Intel](#intel)
- [Seasons & Leaderboards](#seasons--leaderboards)
- [Progression](#progression)
- [Admin](#admin)
- [Error Codes](#error-codes)

---

## Authentication

All authenticated endpoints require the `X-API-Key` header:

```
X-API-Key: your-api-key-here
```

Get your API key by joining the game via `POST /join`.

---

## Public Endpoints

### GET /

Server info.

**Response:**
```json
{
  "name": "BURNRATE",
  "tagline": "The front doesn't feed itself.",
  "version": "1.0.0",
  "docs": "/docs"
}
```

### GET /health

Health check.

**Response:**
```json
{
  "status": "ok",
  "tick": 1234
}
```

### GET /world/status

World state overview.

**Response:**
```json
{
  "tick": 1234,
  "season": {
    "seasonNumber": 1,
    "seasonWeek": 2,
    "ticksIntoSeason": 1200
  },
  "zoneCount": 24,
  "factionCount": 5
}
```

### POST /join

Create a new player and join the game.

**Request:**
```json
{
  "name": "YourName"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Welcome to BURNRATE, YourName! Save your API key - you'll need it for all requests.",
  "apiKey": "abc123...",
  "playerId": "player_xyz",
  "location": "Hub.Central"
}
```

---

## Player

### GET /me

Get your current status.

**Response:**
```json
{
  "id": "player_xyz",
  "name": "YourName",
  "tier": "freelance",
  "inventory": {
    "credits": 1000,
    "ore": 50,
    "fuel": 25
  },
  "location": {
    "id": "zone_abc",
    "name": "Hub.Central",
    "type": "hub"
  },
  "faction": {
    "id": "faction_123",
    "name": "Trade Federation",
    "tag": "TF"
  },
  "reputation": 75,
  "actionsToday": 45,
  "units": 2,
  "activeShipments": 1
}
```

### GET /reputation

Get reputation details.

**Response:**
```json
{
  "success": true,
  "reputation": 75,
  "title": "Runner",
  "nextTitle": {
    "title": "Hauler",
    "threshold": 150,
    "remaining": 75
  }
}
```

### GET /licenses

Get license status.

**Response:**
```json
{
  "success": true,
  "licenses": {
    "courier": { "unlocked": true, "description": "Basic small cargo transport" },
    "freight": { "unlocked": false, "reputationRequired": 50, "creditsCost": 500, "description": "Medium cargo transport" },
    "convoy": { "unlocked": false, "reputationRequired": 200, "creditsCost": 2000, "description": "Heavy armored transport" }
  }
}
```

### POST /licenses/:type/unlock

Unlock a shipment license.

**Parameters:**
- `type`: `freight` or `convoy`

**Response:**
```json
{
  "success": true
}
```

### GET /events

Get event history. Limited by tier (freelance: 200, operator: 10k, command: 100k).

**Query Parameters:**
- `type` (optional): Filter by event type
- `limit` (optional): Max events (capped by tier)

**Response:**
```json
{
  "events": [
    {
      "id": "event_123",
      "type": "shipment_delivered",
      "actorId": "player_xyz",
      "data": { "cargo": { "ore": 50 } },
      "createdAt": 1234
    }
  ],
  "limit": 100,
  "tierLimit": 200
}
```

---

## World & Navigation

### GET /world/zones

List all zones.

**Response:**
```json
[
  {
    "id": "zone_abc",
    "name": "Hub.Central",
    "type": "hub",
    "ownerId": null,
    "supplyLevel": 100,
    "burnRate": 0
  }
]
```

### GET /world/zones/:id

Get zone details.

**Response:**
```json
{
  "id": "zone_abc",
  "name": "Hub.Central",
  "type": "hub",
  "ownerId": null,
  "supplyLevel": 100,
  "burnRate": 0,
  "owner": null,
  "connections": 3,
  "marketOrders": 12,
  "unitsForSale": 2
}
```

### GET /routes

Get routes from current location or specified zone.

**Query Parameters:**
- `from` (optional): Zone ID to get routes from

**Response:**
```json
[
  {
    "id": "route_123",
    "to": {
      "id": "zone_def",
      "name": "Field.North",
      "type": "field"
    },
    "distance": 2,
    "risk": 0.1,
    "chokepointRating": 0.3
  }
]
```

### POST /travel

Move to an adjacent zone.

**Request:**
```json
{
  "to": "zone_def"
}
```

**Response:**
```json
{
  "success": true,
  "location": {
    "id": "zone_def",
    "name": "Field.North",
    "type": "field"
  }
}
```

---

## Economy

### POST /extract

Extract raw resources at a Field zone. Costs 5 credits per unit.

**Request:**
```json
{
  "quantity": 50
}
```

**Response:**
```json
{
  "success": true,
  "extracted": { "ore": 50 }
}
```

### POST /produce

Produce resources or units at a Factory zone.

**Request:**
```json
{
  "output": "metal",
  "quantity": 10
}
```

**Response:**
```json
{
  "success": true,
  "produced": { "metal": 10 }
}
```

### POST /ship

Create a shipment.

**Request:**
```json
{
  "type": "courier",
  "path": ["zone_abc", "zone_def", "zone_ghi"],
  "cargo": {
    "ore": 50,
    "fuel": 25
  }
}
```

**Response:**
```json
{
  "success": true,
  "shipment": {
    "id": "shipment_123",
    "type": "courier",
    "status": "in_transit",
    "path": ["zone_abc", "zone_def", "zone_ghi"],
    "cargo": { "ore": 50, "fuel": 25 }
  }
}
```

### GET /shipments

Get your active shipments.

**Response:**
```json
[
  {
    "id": "shipment_123",
    "type": "courier",
    "status": "in_transit",
    "path": ["zone_abc", "zone_def", "zone_ghi"],
    "currentPosition": 1,
    "ticksToNextZone": 2,
    "cargo": { "ore": 50 }
  }
]
```

### POST /market/order

Place a buy or sell order.

**Request:**
```json
{
  "resource": "ore",
  "side": "buy",
  "price": 10,
  "quantity": 50
}
```

**Response:**
```json
{
  "success": true,
  "order": {
    "id": "order_123",
    "resource": "ore",
    "side": "buy",
    "price": 10,
    "quantity": 50
  }
}
```

### GET /market/orders

Get market orders at current location.

**Query Parameters:**
- `resource` (optional): Filter by resource

**Response:**
```json
[
  {
    "id": "order_123",
    "resource": "ore",
    "side": "sell",
    "price": 12,
    "quantity": 100,
    "playerId": "player_abc"
  }
]
```

### GET /market/units

Get units for sale at current location.

**Response:**
```json
[
  {
    "id": "unit_123",
    "type": "escort",
    "strength": 10,
    "maintenance": 5,
    "price": 500,
    "sellerId": "player_abc"
  }
]
```

### POST /supply

Deposit Supply Units to current zone. Requires: 2 rations + 1 fuel + 1 parts + 1 ammo per SU.

**Request:**
```json
{
  "amount": 10
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /capture

Capture current zone for your faction. Zone must be neutral or collapsed.

**Response:**
```json
{
  "success": true
}
```

---

## Military Units

### GET /units

List your units.

**Response:**
```json
[
  {
    "id": "unit_123",
    "type": "escort",
    "locationId": "zone_abc",
    "strength": 10,
    "maintenance": 5,
    "assignmentId": null,
    "forSalePrice": null
  }
]
```

### POST /units/:id/escort

Assign escort to protect a shipment.

**Request:**
```json
{
  "shipmentId": "shipment_123"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /units/:id/raider

Deploy raider to interdict a route.

**Request:**
```json
{
  "routeId": "route_123"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /units/:id/sell

List unit for sale.

**Request:**
```json
{
  "price": 500
}
```

**Response:**
```json
{
  "success": true
}
```

### DELETE /units/:id/sell

Unlist unit from sale.

**Response:**
```json
{
  "success": true
}
```

### POST /hire/:unitId

Purchase a unit listed for sale.

**Response:**
```json
{
  "success": true,
  "unit": { ... }
}
```

---

## Factions

### GET /factions

List all factions.

**Response:**
```json
[
  {
    "id": "faction_123",
    "name": "Trade Federation",
    "tag": "TF",
    "memberCount": 12,
    "zoneCount": 5
  }
]
```

### POST /factions

Create a new faction.

**Request:**
```json
{
  "name": "Trade Federation",
  "tag": "TF"
}
```

**Response:**
```json
{
  "success": true,
  "faction": { ... }
}
```

### POST /factions/:id/join

Join an existing faction.

**Response:**
```json
{
  "success": true
}
```

### POST /factions/leave

Leave your current faction.

**Response:**
```json
{
  "success": true
}
```

### GET /factions/mine

Get detailed info about your faction.

**Response:**
```json
{
  "success": true,
  "faction": {
    "id": "faction_123",
    "name": "Trade Federation",
    "tag": "TF",
    "treasury": { "credits": 5000, "ore": 200 },
    "members": [
      { "id": "player_abc", "name": "Alice", "rank": "founder" },
      { "id": "player_def", "name": "Bob", "rank": "officer" }
    ],
    "controlledZones": ["zone_abc", "zone_def"],
    "upgrades": [],
    "officerWithdrawLimit": 1000
  },
  "myRank": "founder"
}
```

### GET /factions/intel

View shared faction intelligence.

**Response:**
```json
{
  "success": true,
  "intel": [ ... ]
}
```

### POST /factions/members/:id/promote

Promote member to officer (founder only).

**Request:**
```json
{
  "rank": "officer"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /factions/members/:id/demote

Demote officer to member (founder only).

**Request:**
```json
{
  "rank": "member"
}
```

**Response:**
```json
{
  "success": true
}
```

### DELETE /factions/members/:id

Kick member from faction (founder/officer).

**Response:**
```json
{
  "success": true
}
```

### POST /factions/transfer-leadership

Transfer faction leadership (founder only).

**Request:**
```json
{
  "targetPlayerId": "player_abc"
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /factions/treasury/deposit

Deposit resources to faction treasury.

**Request:**
```json
{
  "resources": {
    "credits": 1000,
    "ore": 100
  }
}
```

**Response:**
```json
{
  "success": true
}
```

### POST /factions/treasury/withdraw

Withdraw from faction treasury (founder/officer).

**Request:**
```json
{
  "resources": {
    "credits": 500
  }
}
```

**Response:**
```json
{
  "success": true
}
```

---

## Contracts

### GET /contracts

List open contracts.

**Response:**
```json
[
  {
    "id": "contract_123",
    "type": "haul",
    "details": {
      "fromZoneId": "zone_abc",
      "toZoneId": "zone_def",
      "resource": "ore",
      "quantity": 100
    },
    "deadline": 1500,
    "ticksRemaining": 266,
    "reward": 500,
    "bonus": 100,
    "status": "open",
    "posterId": "player_xyz"
  }
]
```

### GET /contracts/mine

Get your posted and accepted contracts.

**Response:**
```json
[
  {
    "id": "contract_123",
    "type": "haul",
    "details": { ... },
    "deadline": 1500,
    "ticksRemaining": 266,
    "reward": 500,
    "bonus": 100,
    "status": "accepted",
    "posterId": "player_xyz",
    "acceptedBy": "player_abc",
    "isMyContract": true,
    "iAccepted": false
  }
]
```

### POST /contracts

Create a new contract.

**Request (haul):**
```json
{
  "type": "haul",
  "fromZoneId": "zone_abc",
  "toZoneId": "zone_def",
  "resource": "ore",
  "quantity": 100,
  "reward": 500,
  "deadline": 100,
  "bonus": 100,
  "bonusDeadline": 50
}
```

**Request (supply):**
```json
{
  "type": "supply",
  "toZoneId": "zone_def",
  "quantity": 10,
  "reward": 300,
  "deadline": 100
}
```

**Request (scout):**
```json
{
  "type": "scout",
  "targetType": "zone",
  "targetId": "zone_abc",
  "reward": 200,
  "deadline": 50
}
```

**Response:**
```json
{
  "success": true,
  "contract": { ... }
}
```

### POST /contracts/:id/accept

Accept a contract.

**Response:**
```json
{
  "success": true
}
```

### POST /contracts/:id/complete

Complete a contract and claim reward.

**Response:**
```json
{
  "success": true,
  "reward": 500,
  "bonus": 100
}
```

### DELETE /contracts/:id

Cancel a contract (poster only, before acceptance).

**Response:**
```json
{
  "success": true
}
```

---

## Intel

### POST /scan

Scan zone or route for intel.

**Request:**
```json
{
  "targetType": "zone",
  "targetId": "zone_abc"
}
```

**Response:**
```json
{
  "success": true,
  "intel": {
    "id": "intel_123",
    "targetType": "zone",
    "targetId": "zone_abc",
    "data": { ... },
    "signalQuality": 85
  }
}
```

### GET /intel

Get your intel reports with freshness decay.

**Query Parameters:**
- `limit` (optional): Max reports (max 500)

**Response:**
```json
{
  "success": true,
  "intel": [
    {
      "id": "intel_123",
      "targetType": "zone",
      "targetId": "zone_abc",
      "gatheredAt": 1200,
      "freshness": "fresh",
      "ageInTicks": 5,
      "effectiveSignalQuality": 85,
      "data": { ... }
    }
  ]
}
```

### GET /intel/:targetType/:targetId

Get intel on a specific target.

**Parameters:**
- `targetType`: `zone` or `route`
- `targetId`: Zone or route ID

**Response:**
```json
{
  "success": true,
  "intel": {
    "id": "intel_123",
    "targetType": "zone",
    "targetId": "zone_abc",
    "gatheredAt": 1200,
    "freshness": "stale",
    "ageInTicks": 25,
    "effectiveSignalQuality": 68,
    "data": { ... }
  }
}
```

---

## Seasons & Leaderboards

### GET /season

Get current season status.

**Response:**
```json
{
  "seasonNumber": 1,
  "seasonWeek": 2,
  "ticksIntoWeek": 500,
  "ticksRemainingInWeek": 508,
  "ticksRemainingInSeason": 2540
}
```

### GET /leaderboard

Get season leaderboard.

**Query Parameters:**
- `season` (optional): Season number (default: current)
- `type` (optional): `player` or `faction`
- `limit` (optional): Max entries (default 50, max 100)

**Response:**
```json
{
  "season": 1,
  "leaderboard": [
    {
      "entityId": "player_abc",
      "entityType": "player",
      "entityName": "Alice",
      "totalScore": 5000,
      "rank": 1,
      "zonesControlled": 10,
      "supplyDelivered": 500,
      "shipmentsCompleted": 50,
      "contractsCompleted": 20,
      "reputationGained": 100,
      "combatVictories": 5
    }
  ]
}
```

### GET /season/me

Get your season score and rank.

**Query Parameters:**
- `season` (optional): Season number

**Response:**
```json
{
  "score": {
    "entityId": "player_abc",
    "entityType": "player",
    "entityName": "YourName",
    "totalScore": 2500,
    "zonesControlled": 5,
    "supplyDelivered": 200,
    "shipmentsCompleted": 25,
    "contractsCompleted": 10,
    "reputationGained": 50,
    "combatVictories": 2
  },
  "rank": 15
}
```

---

## Progression

### Reputation Rewards

| Action | Reputation |
|--------|------------|
| Shipment delivered | +5 |
| Shipment intercepted | -10 |
| Contract completed | +10 |
| Contract failed | -20 |
| Supply delivered | +2 |
| Zone captured | +25 |

### Reputation Titles

| Reputation | Title |
|------------|-------|
| 0+ | Unknown |
| 25+ | Novice |
| 75+ | Runner |
| 150+ | Hauler |
| 300+ | Veteran |
| 500+ | Elite |
| 750+ | Master |
| 1000 | Legend |

### License Requirements

| License | Reputation | Cost |
|---------|------------|------|
| Courier | 0 | Free |
| Freight | 50 | 500 |
| Convoy | 200 | 2000 |

---

## Admin

These endpoints require the `X-Admin-Key` header.

### POST /admin/tick

Process a game tick.

**Response:**
```json
{
  "tick": 1235,
  "eventCount": 42
}
```

### POST /admin/init-world

Initialize the game world.

**Response:**
```json
{
  "success": true,
  "zones": 24,
  "routes": 36
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `MISSING_API_KEY` | No X-API-Key header provided |
| `INVALID_API_KEY` | API key not found |
| `INVALID_INPUT` | Request validation failed |
| `NOT_FOUND` | Resource not found |
| `NAME_TAKEN` | Player name already exists |
| `NO_ROUTE` | No direct route to destination |
| `WRONG_ZONE_TYPE` | Action not allowed at this zone type |
| `INSUFFICIENT_RESOURCES` | Not enough resources |
| `INSUFFICIENT_CREDITS` | Not enough credits |
| `INSUFFICIENT_PERMISSION` | Permission denied for action |
| `ALREADY_IN_FACTION` | Already a faction member |
| `NOT_IN_FACTION` | Not in a faction |
| `LICENSE_REQUIRED` | Missing required license |
| `NOT_YOUR_RESOURCE` | Resource belongs to another player |
| `CONFLICT` | Action conflicts with current state |
| `RATE_LIMITED` | Too many requests |
| `SERVICE_UNAVAILABLE` | Server temporarily unavailable |

### Error Response Format

```json
{
  "error": "Human readable message",
  "code": "ERROR_CODE",
  "requestId": "abc123"
}
```

---

## Rate Limits

### Global
- 100 requests per minute per IP

### Tier-based (write operations)
- Freelance: 200 actions/day
- Operator: 500 actions/day
- Command: 1000 actions/day

### Market Orders
- Freelance: 5 concurrent
- Operator: 20 concurrent
- Command: 50 concurrent

### Contracts
- Freelance: 3 concurrent
- Operator: 10 concurrent
- Command: 25 concurrent
