# BURNRATE: Production Launch Plan

## Design Principle: Tooling Extensibility

**Core Rule:** API endpoints expose exactly what a player could learn through normal gameplay - no more, no less.

### What Tools CAN Access
- Player's own inventory, shipments, units, orders
- Zones the player has recently scanned (with freshness decay)
- Public market data at player's current location
- Faction-shared intel (if in a faction)
- Routes from zones the player has visited
- Historical events the player was involved in (tier-limited)

### What Tools CANNOT Access
- Other players' inventories or positions
- Unscanned zone details (supply levels, garrison, etc.)
- Enemy faction intel
- Global market data across all zones (must travel or scan)
- Shipments they don't own or haven't detected
- Raw database queries

### The Tooling Opportunity
Even with these constraints, players can build:
- **Personal dashboards** - Aggregate their own data beautifully
- **Route planners** - Optimize paths using scanned route data
- **Market analyzers** - Track prices at zones they visit
- **Intel aggregators** - Combine faction intel over time
- **Automation agents** - Execute strategies via API
- **Alert systems** - Monitor their assets and trigger notifications
- **Doctrine validators** - Check plans against faction rules

---

## Phase 1: Critical Infrastructure (Blocks Everything Else)

### 1.1 Database Transactions
- Wrap critical operations in transactions (trades, captures, unit transfers)
- Add optimistic locking for concurrent updates
- Implement retry logic for transaction conflicts

### 1.2 API Rate Limiting
- Add rate limit middleware (100 req/min base, scales with tier)
- Separate limits for read vs write operations
- Return `Retry-After` headers when limited

### 1.3 Input Validation
- Add Zod schemas for all request bodies
- Sanitize all string inputs
- Validate resource names, quantities, IDs

### 1.4 Error Handling
- Structured error responses with codes
- Don't leak internal errors to clients
- Add request ID for debugging

---

## Phase 2: Complete Core Gameplay

### 2.1 Contracts System
```
POST /contracts          - Create contract (costs credits as escrow)
POST /contracts/:id/accept - Accept contract
POST /contracts/:id/complete - Mark complete (auto-verified for haul)
POST /contracts/:id/cancel - Cancel (escrow returned minus fee)
GET /contracts           - List contracts at current zone
GET /contracts/mine      - List player's active contracts
```

Contract types:
- **Haul**: Move cargo from A to B (auto-completes on delivery)
- **Supply**: Deliver SU to a zone (auto-completes)
- **Scout**: Maintain scan coverage (verified per-tick)

### 2.2 Intel Decay System
- Add `gatheredAt` tick to all intel
- Add `freshness` calculation: fresh (<10 ticks), stale (10-50), expired (>50)
- Expired intel returns degraded data (ranges instead of exact values)
- Stale intel has accuracy penalties

### 2.3 Faction Permissions
```typescript
enum FactionRank { FOUNDER, OFFICER, MEMBER }

Permissions by rank:
- FOUNDER: Everything
- OFFICER: Withdraw (daily limit), post contracts, edit doctrine, invite/kick members
- MEMBER: Deposit, accept contracts, view doctrine
```

### 2.4 License Progression
- Start with Courier license only
- Earn Freight at 1000 cr profit + 10 successful deliveries
- Earn Convoy at 5000 cr profit + 50 successful deliveries
- Licenses persist across seasons

### 2.5 Reputation System
- Global reputation: Sum of successful contracts, deliveries, faction contributions
- Faction reputation: Standing within faction (affects rank eligibility)
- Reputation decays slowly over time (keeps game active)

### 2.6 Event History Limits
```
Freelance: 200 events (last ~3 hours of activity)
Operator: 2000 events (last ~day)
Command: 20000 events (last ~week)
```

---

## Phase 3: Season System

### 3.1 Season State
```typescript
interface Season {
  id: string;
  number: number;
  startedAt: Date;
  endsAt: Date;
  status: 'active' | 'ending' | 'complete';
}
```

### 3.2 Scoring Categories
- **Territory**: Zone-ticks controlled (sum of ticks × zone value)
- **Logistics**: SU delivered to contested zones
- **Commerce**: Trade volume executed
- **Intel**: Scan coverage hours

### 3.3 Season Reset
- Archive current season data
- Reset: zones, inventories, faction territories, market orders
- Preserve: accounts, licenses, legacy titles, faction identities

### 3.4 Leaderboards
```
GET /leaderboard/players?category=territory&limit=20
GET /leaderboard/factions?category=logistics&limit=10
```

---

## Phase 4: MCP & Claude Code Experience

### 4.1 MCP Prompts (Context for Claude)
```typescript
// Prompts that give Claude game context
prompts: [
  {
    name: 'game_overview',
    description: 'Explain BURNRATE mechanics to help player'
  },
  {
    name: 'situation_brief',
    description: 'Analyze current player situation and suggest actions'
  },
  {
    name: 'market_analysis',
    description: 'Analyze market data the player has access to'
  }
]
```

### 4.2 MCP Resources (Live Data)
```typescript
resources: [
  'burnrate://me'           // Player status
  'burnrate://alerts'       // Active warnings
  'burnrate://intel'        // Recent intel (respects decay)
  'burnrate://faction'      // Faction status if member
]
```

### 4.3 Conversational Tool Responses
Instead of raw JSON, format responses for readability:
```
✓ Extracted 50 ore at Mine.3
  Cost: 250 cr
  Inventory: ore 150 (+50)
  Field remaining: 450 ore
```

### 4.4 Easy Setup
- `npx burnrate-mcp setup` command to configure Claude Code
- Stores API key in config file
- Auto-detects API URL

---

## Phase 5: API Documentation & Tooling Support

### 5.1 OpenAPI Specification
- Generate from Hono routes
- Document all endpoints, params, responses
- Include authentication requirements
- Note rate limits and tier restrictions

### 5.2 Player Data Export
```
GET /me/export - Export all player data (respects tier limits)
  - inventory
  - shipments (active + recent)
  - units
  - orders
  - intel (with freshness)
  - events (tier-limited)
  - contracts
```

### 5.3 Webhook System (Operator+ tier)
```
POST /webhooks - Register webhook URL
  Events: shipment_arrived, shipment_intercepted, zone_critical,
          contract_completed, market_order_filled, under_attack
```

### 5.4 Bulk Operations
```
GET /me/intel/all - All player's intel (with freshness)
GET /me/shipments/all - All shipments with full history
POST /batch - Execute multiple actions (still rate limited)
```

---

## Phase 6: README & Documentation

### 6.1 README Rewrite
- Quick start for MCP-based play
- How to connect to hosted server
- How to set up MCP in Claude Code
- Link to API docs
- Updated architecture diagram

### 6.2 API Documentation
- Endpoint reference
- Authentication guide
- Rate limit explanation
- Tier comparison
- Example workflows

### 6.3 Tool Building Guide
- What data is available
- Best practices for automation
- Example: price monitoring agent
- Example: supply chain optimizer

---

## Implementation Order

### Week 1: Infrastructure + Critical Fixes
1. ✓ Database transactions wrapper
2. ✓ API rate limiting middleware
3. ✓ Input validation (Zod)
4. ✓ Error handling standardization
5. ✓ Intel decay system

### Week 2: Core Gameplay Completion
6. ✓ Contracts system (full)
7. ✓ Faction permissions
8. ✓ License progression
9. ✓ Reputation system
10. ✓ Event history limits

### Week 3: Season & Leaderboards
11. ✓ Season state management
12. ✓ Scoring system
13. ✓ Leaderboards
14. ✓ Season reset logic

### Week 4: MCP & Documentation
15. ✓ MCP prompts
16. ✓ MCP resources
17. ✓ Conversational responses
18. ✓ README rewrite
19. ✓ API documentation
20. ✓ Tool building guide

### Week 5: Tooling Support
21. ✓ OpenAPI spec
22. ✓ Player data export
23. ✓ Webhook system
24. ✓ Easy MCP setup command

---

## Success Criteria

### For Players
- [ ] Can join game via Claude Code MCP
- [ ] Claude understands game state and can advise
- [ ] All core gameplay loops functional
- [ ] Contracts provide "infinite jobs"
- [ ] Seasons provide fresh starts and competition

### For Tool Builders
- [ ] API documentation is complete
- [ ] Can build dashboard with exported data
- [ ] Can automate via API (within rate limits)
- [ ] Webhooks enable reactive automation
- [ ] No access beyond what gameplay allows

### For Operators
- [ ] Can deploy to Railway with env vars
- [ ] Health checks work
- [ ] Rate limiting prevents abuse
- [ ] Errors are logged, not leaked
