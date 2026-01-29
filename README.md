# BURNRATE

**A logistics war MMO for Claude Code.**

*The front doesn't feed itself.*

---

Hold territory by keeping it supplied. Every zone burns Supply Units each tick. When the supply stops, the zone falls. The best generals still lose if they can't feed the front.

- **MCP-native**: Play entirely through Claude Code's MCP integration
- **Multiplayer**: Compete and collaborate on shared servers
- **AI-collaborative**: Claude is your operations advisor
- **Operator advantage**: No grinding, no twitch—just better systems

## The Metagame

What if using Claude well *was* the actual game?

BURNRATE is designed for automation. The MCP tools are your interface, but the real game is building Claude agents that optimize extraction, find efficient routes, spot market arbitrage, and coordinate faction logistics.

The players who learn to work WITH Claude—analyzing intel, optimizing routes, building automation—win. Skills transfer directly to real work.

**Play between tasks.** Check supply lines between deploys. Run convoys during CI builds. Strategy in the margins.

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│ Claude Code │────▶│ MCP Server  │────▶│  Game API   │────▶│  Turso   │
│  (Player)   │◀────│  (Local)    │◀────│  (Hosted)   │◀────│ Database │
└─────────────┘     └─────────────┘     └─────────────┘     └──────────┘
```

- **Claude Code** - Your terminal and AI advisor
- **MCP Server** - Runs locally, provides tools/resources/prompts
- **Game API** - Hosted server running the game simulation
- **Turso** - Distributed SQLite database for persistence

## Quick Start

**One command to set up, then you're in.**

```bash
npx burnrate-setup
```

The setup wizard connects to the live server, auto-configures your Claude Code MCP settings, and verifies the connection.

**Restart Claude Code**, then tell Claude:

```
Use burnrate_join to create a character named "YourName"
```

You'll get an API key. Run `npx burnrate-setup` again and paste it in, or manually add `"BURNRATE_API_KEY": "your-key"` to the env block in `~/.claude/settings.json`. Restart Claude Code one more time, and you're set.

### Setup from Source (Alternative)

If you want to contribute or run a local server:

```bash
git clone https://github.com/burnrate-cc/burnrate.git ~/burnrate
cd ~/burnrate && npm install && npm run build
npm run setup
```

### Manual Config (Alternative)

Add this directly to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "burnrate": {
      "command": "npx",
      "args": ["-y", "burnrate", "start"],
      "env": {
        "BURNRATE_API_URL": "https://burnrate-api-server-production.up.railway.app",
        "BURNRATE_API_KEY": "your-key-here"
      }
    }
  }
}
```

### Start Playing

```
Use burnrate_status to see my inventory and location
Use burnrate_view to see the world map
Use burnrate_routes to see where I can travel
```

New players start with a 5-step tutorial that teaches core mechanics. Use `burnrate_tutorial` to see your progress, or ask Claude to use the `game_overview` prompt for a full walkthrough.

## Core Concepts

### The Burn
Every controlled zone consumes **Supply Units (SU)** each tick. If supply runs out, the zone collapses and becomes neutral. Winners are the players and factions that keep their zones fed while starving enemies. You can play solo or join a faction — solo players can capture and hold zones independently, though factions make sustained logistics far more manageable.

### Credits
Credits are the in-game currency. You start with 500 and earn more through contracts, trading, and zone income. Spend them on:
- Extraction (5 credits per raw resource unit)
- Licenses (500-2000 credits)
- Hiring units from other players
- Posting contract rewards

### Resources
```
T0 (Raw)       → T1 (Processed)  → T2 (Strategic)  → SU
ore, fuel,       metal, chemicals,  ammo, medkits,    Supply Units
grain, fiber     rations, textiles  parts, comms
```

### Zones
- **Hubs** - Safe starting areas, marketplaces
- **Fields** - Extract raw resources (T0)
- **Factories** - Convert resources, produce units
- **Junctions** - Crossroads, no burn
- **Fronts** - Contested territory, high burn
- **Strongholds** - Victory objectives, highest burn

### Field Resources
Each Field zone produces a specific raw resource based on its name:
| Field Name Pattern | Resource |
|-------------------|----------|
| Mine | ore |
| Refinery | fuel |
| Farm | grain |
| Grove | fiber |

### Shipment Types
| Type | Capacity | Requirements |
|------|----------|-------------|
| Courier | 100 total units | Free (default license) |
| Freight | 500 total units | 50 rep + 500cr license |
| Convoy | 2000 total units | 200 rep + 2000cr license |

Cargo is specified per-resource. Only include resources you're shipping (others default to 0):
```json
{ "ore": 50, "fuel": 20 }
```

### Intel Decay
Intelligence gathered through scanning decays over time:
- **Fresh** (<10 ticks) - Full accuracy
- **Stale** (10-50 ticks) - Reduced signal quality, some data obscured
- **Expired** (>50 ticks) - Unreliable, most data unavailable

### Reputation

Reputation unlocks licenses and earns you titles. Earn it through gameplay:

| Action | Rep Change |
|--------|------------|
| Deliver a shipment | +5 |
| Complete a contract | +10 |
| Deliver supply to zone | +2 |
| Capture a zone | +25 |
| Shipment intercepted | -10 |
| Fail a contract | -20 |

### Zone Efficiency
Well-supplied zones gain battlefield bonuses. Supply states:

| State | Condition | Effects |
|-------|-----------|---------|
| Fortified | 100% supply + 50-tick streak | +50% raid resist, +50% capture defense, +10% production |
| Supplied | 100% supply | Baseline |
| Strained | 50-99% supply | -25% raid resist, -25% capture defense |
| Critical | 1-49% supply | -50% raid resist, -75% capture defense |
| Collapsed | 0% supply | No defense — zone becomes capturable |

**Stockpiles** boost zone defense further:
- **Medkits**: Deposit to zone → boosts escort strength in combat (up to +50%). Decays 1 per 10 ticks.
- **Comms**: Deposit to zone → degrades enemy scan quality (up to -50%). Decays 1 per 20 ticks.

**Compliance streaks** (consecutive ticks at full supply) multiply a zone's season-end score value:

| Streak | Multiplier |
|--------|-----------|
| 0-4 ticks | 1.0x |
| 5-19 ticks | 1.2x |
| 20-49 ticks | 1.5x |
| 50-99 ticks | 2.0x |
| 100+ ticks | 3.0x |

### Zone Income
Owned zones generate **credits per tick** distributed to the owner (solo player) or split among faction members:

| Zone Type | Credits/tick |
|-----------|-------------|
| Field | 5 |
| Factory | 10 |
| Front | 25 |
| Stronghold | 50 |

This rewards sustained territory control — hoarding until season end is suboptimal compared to capturing and holding zones early.

### Seasons
The game runs in seasons (4 weeks each). Earn points through:
- Controlling zones at season end (100 pts/zone, multiplied by compliance streak)
- Completing shipments (10 pts each)
- Fulfilling contracts (25 pts each)
- Delivering supplies (1 pt per SU)
- Winning combat (50 pts per victory)
- Gaining reputation (2 pts per rep point)

**Season reset**: When a season ends, scores are archived. Zones reset to neutral, inventories reset to 500 credits, reputation halves. Accounts, licenses, and faction identities persist.

### Doctrines
Factions can create strategy documents stored server-side. Officers and founders write doctrines to coordinate members — convoy rules, zone defense protocols, market strategies. Visible to all faction members.

### Advanced Market Orders
Beyond basic buy/sell orders, higher tiers unlock automation:
- **Conditional Orders** (Operator+) — Trigger when a resource price crosses a threshold. "Buy ore if price drops below 10."
- **Time-Weighted Orders** (Command) — Drip-feed large orders across ticks to avoid moving the market. "Sell 1000 metal over 50 ticks."

### Webhooks
Operator+ players can register HTTPS webhooks to receive real-time notifications for game events — shipment arrivals, zone collapses, combat results. Webhooks auto-disable after 5 consecutive failures.

### Data Export & Batch Operations
- **Export** (`burnrate_export`) — Bulk download of all your game data: player info, units, shipments, contracts, intel, and event history.
- **Batch** (`burnrate_batch`) — Execute up to 10 game actions in a single call. Each action is still individually rate-limited.

### Faction Analytics
- **Analytics** (Operator+, officer+) — Member activity, zone control summary, and resource flow tracking from audit logs.
- **Audit Logs** (Command) — Full history of all faction member actions for accountability and coordination.

## REST API Reference

All authenticated endpoints require the `X-API-Key` header. Get your key from `POST /join`.

### Public Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Server info and endpoint summary |
| `GET` | `/health` | Health check with tick info |
| `GET` | `/world/status` | World overview (tick, season, zone/faction counts) |
| `POST` | `/join` | Create account `{ "name": "YourName" }` → returns API key |

### Player & Navigation
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/me` | Your status, inventory, location |
| `GET` | `/world/zones` | All zones (id, name, type, owner, supply) |
| `GET` | `/world/zones/:id` | Zone details with connections and market |
| `GET` | `/routes` | Routes from current location (or `?from=zoneId`) |
| `POST` | `/travel` | Move to adjacent zone `{ "to": "zone-id" }` |

### Economy
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/extract` | Extract resources at a Field `{ "quantity": 10 }` |
| `POST` | `/produce` | Produce at a Factory `{ "output": "metal", "quantity": 5 }` |
| `POST` | `/ship` | Create shipment `{ "type", "path", "cargo" }` |
| `GET` | `/shipments` | Your active shipments |
| `POST` | `/market/order` | Place market order `{ "resource", "side", "price", "quantity" }` |
| `GET` | `/market/orders` | Orders at your location (optional `?resource=ore`) |
| `GET` | `/market/units` | Units for sale at your location |

### Military & Intel
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/units` | Your units |
| `POST` | `/units/:id/escort` | Assign escort `{ "shipmentId": "..." }` |
| `POST` | `/units/:id/raider` | Deploy raider `{ "routeId": "..." }` |
| `POST` | `/units/:id/sell` | List unit for sale `{ "price": 100 }` |
| `POST` | `/hire/:unitId` | Purchase a unit |
| `POST` | `/scan` | Scan zone/route `{ "targetType", "targetId" }` |
| `GET` | `/intel` | Your intel reports (optional `?limit=100`) |
| `GET` | `/intel/:targetType/:targetId` | Intel on specific target |

### Territory
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/supply` | Deposit SU to zone `{ "amount": 5 }` |
| `POST` | `/capture` | Capture neutral/collapsed zone |
| `POST` | `/stockpile` | Deposit medkits/comms `{ "resource", "amount" }` |
| `GET` | `/zone/:zoneId/efficiency` | Zone bonuses and supply state |

### Factions
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/factions` | List all factions |
| `POST` | `/factions` | Create faction `{ "name", "tag" }` |
| `POST` | `/factions/:id/join` | Join a faction |
| `POST` | `/factions/leave` | Leave current faction |
| `GET` | `/factions/mine` | Your faction details |
| `GET` | `/factions/intel` | Shared faction intel |
| `POST` | `/factions/members/:id/promote` | Promote member |
| `POST` | `/factions/members/:id/demote` | Demote member |
| `DELETE` | `/factions/members/:id` | Kick member |
| `POST` | `/factions/transfer-leadership` | Transfer ownership |
| `POST` | `/factions/treasury/deposit` | Deposit to treasury |
| `POST` | `/factions/treasury/withdraw` | Withdraw from treasury |

### Contracts
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/contracts` | Open contracts |
| `GET` | `/contracts/mine` | Your posted/accepted contracts |
| `POST` | `/contracts` | Create contract |
| `POST` | `/contracts/:id/accept` | Accept contract |
| `POST` | `/contracts/:id/complete` | Complete contract |
| `DELETE` | `/contracts/:id` | Cancel contract |

### Progression & Seasons
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/reputation` | Your rep score and title |
| `GET` | `/licenses` | License status |
| `POST` | `/licenses/:type/unlock` | Unlock a license |
| `GET` | `/events` | Event history (optional `?type=&limit=`) |
| `GET` | `/tutorial` | Tutorial progress |
| `POST` | `/tutorial/complete` | Complete tutorial step `{ "step": 1 }` |
| `GET` | `/season` | Current season info |
| `GET` | `/leaderboard` | Rankings (optional `?type=player&limit=50`) |
| `GET` | `/season/me` | Your season score |
| `GET` | `/subscription` | Your tier and limits |

### Advanced (Tier-Gated)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/market/conditional` | Conditional order (Operator+) |
| `POST` | `/market/time-weighted` | Time-weighted order (Command) |
| `GET` | `/webhooks` | Your webhooks (Operator+) |
| `POST` | `/webhooks` | Register webhook (Operator+) |
| `DELETE` | `/webhooks/:id` | Delete webhook |
| `GET` | `/me/export` | Export all your data |
| `POST` | `/batch` | Batch operations (max 10) |
| `GET` | `/faction/analytics` | Faction analytics (Operator+) |
| `GET` | `/faction/audit` | Audit logs (Command) |
| `GET` | `/doctrines` | Faction doctrines |
| `POST` | `/doctrines` | Create doctrine (officer+) |
| `PUT` | `/doctrines/:id` | Update doctrine (officer+) |
| `DELETE` | `/doctrines/:id` | Delete doctrine (officer+) |

---

## MCP Tools Reference

### Status & Navigation
| Tool | Description |
|------|-------------|
| `burnrate_status` | Your current status, inventory, location |
| `burnrate_view` | World map or specific zone details |
| `burnrate_routes` | Available routes from location |
| `burnrate_travel` | Move to an adjacent zone |

### Economy
| Tool | Description |
|------|-------------|
| `burnrate_extract` | Gather raw resources at Fields (5cr/unit) |
| `burnrate_produce` | Convert resources at Factories |
| `burnrate_ship` | Send cargo along a route |
| `burnrate_shipments` | View active shipments |
| `burnrate_market_buy` | Place buy order |
| `burnrate_market_sell` | Place sell order |
| `burnrate_market_view` | View market orders |

### Military
| Tool | Description |
|------|-------------|
| `burnrate_units` | List your military units |
| `burnrate_units_escort` | Assign escort to protect shipment |
| `burnrate_units_raider` | Deploy raider to interdict route |
| `burnrate_units_sell` | List unit for sale |
| `burnrate_hire` | Purchase a unit |

### Intelligence
| Tool | Description |
|------|-------------|
| `burnrate_scan` | Gather intel on zone/route |
| `burnrate_intel` | View your intel with freshness |
| `burnrate_intel_target` | Get intel on specific target |

### Territory
| Tool | Description |
|------|-------------|
| `burnrate_supply` | Deposit Supply Units to zone |
| `burnrate_capture` | Capture neutral/collapsed zone |
| `burnrate_stockpile` | Deposit medkits/comms to zone stockpile |
| `burnrate_zone_efficiency` | View zone bonuses (raid resistance, production, etc.) |

### Factions
| Tool | Description |
|------|-------------|
| `burnrate_factions` | List all factions |
| `burnrate_faction_create` | Create new faction |
| `burnrate_faction_join` | Join existing faction |
| `burnrate_faction_leave` | Leave current faction |
| `burnrate_faction_details` | Your faction info |
| `burnrate_faction_intel` | Shared faction intelligence |
| `burnrate_faction_promote` | Promote member to officer |
| `burnrate_faction_demote` | Demote officer to member |
| `burnrate_faction_kick` | Remove member from faction |
| `burnrate_faction_transfer` | Transfer leadership |
| `burnrate_treasury_deposit` | Add resources to treasury |
| `burnrate_treasury_withdraw` | Take resources from treasury |

### Contracts
| Tool | Description |
|------|-------------|
| `burnrate_contracts` | View available contracts |
| `burnrate_contracts_mine` | Your posted/accepted contracts |
| `burnrate_contract_create` | Post a new contract |
| `burnrate_contract_accept` | Accept a contract |
| `burnrate_contract_complete` | Complete and claim reward |
| `burnrate_contract_cancel` | Cancel unaccepted contract |

### Progression
| Tool | Description |
|------|-------------|
| `burnrate_reputation` | Your reputation score and title |
| `burnrate_licenses` | License status and requirements |
| `burnrate_license_unlock` | Unlock freight or convoy license |
| `burnrate_events` | Your event history |
| `burnrate_tutorial` | View tutorial progress and current step |
| `burnrate_tutorial_complete` | Complete a tutorial step and receive rewards |

### Seasons & Leaderboards
| Tool | Description |
|------|-------------|
| `burnrate_season` | Current season info |
| `burnrate_leaderboard` | Season rankings |
| `burnrate_season_score` | Your season score |

### Doctrines
| Tool | Description |
|------|-------------|
| `burnrate_doctrines` | View faction strategy documents |
| `burnrate_doctrine_create` | Create a new doctrine (officer+) |
| `burnrate_doctrine_update` | Update an existing doctrine (officer+) |
| `burnrate_doctrine_delete` | Delete a doctrine (officer+) |

### Advanced Market Orders
| Tool | Description |
|------|-------------|
| `burnrate_market_conditional` | Conditional order — triggers on price threshold (Operator+) |
| `burnrate_market_twap` | Time-weighted order — drip-feeds quantity per tick (Command) |

### Webhooks & Automation
| Tool | Description |
|------|-------------|
| `burnrate_webhooks` | List your registered webhooks |
| `burnrate_webhook_register` | Register a webhook for game events (Operator+) |
| `burnrate_webhook_delete` | Delete a webhook |
| `burnrate_export` | Export all your game data |
| `burnrate_batch` | Execute multiple actions in one call (max 10) |

### Faction Analytics
| Tool | Description |
|------|-------------|
| `burnrate_faction_analytics` | Member activity, zone control, resource flows (Operator+) |
| `burnrate_faction_audit` | Full audit logs of faction actions (Command) |

### Account
| Tool | Description |
|------|-------------|
| `burnrate_subscription` | View your subscription tier and limits |

## MCP Resources

Access these as read-only data sources:

| Resource URI | Description |
|--------------|-------------|
| `burnrate://status` | Player status and inventory |
| `burnrate://world` | World state (tick, season) |
| `burnrate://zones` | All zones with controllers |
| `burnrate://routes` | Routes from current location |
| `burnrate://shipments` | Active shipments |
| `burnrate://units` | Military units |
| `burnrate://market` | Current market orders |
| `burnrate://contracts` | Available contracts |
| `burnrate://intel` | Intel reports with freshness |
| `burnrate://faction` | Faction details |
| `burnrate://leaderboard` | Season rankings |
| `burnrate://reputation` | Reputation progress |
| `burnrate://licenses` | License status |

## Building Your Edge

The game provides basic tools. Your competitive advantage comes from what you build on top.

### MCP Prompts (Starting Points)

These built-in prompts are intentionally simple—templates to get you started:

| Prompt | What it does |
|--------|--------------|
| `situation_analysis` | Pulls your status, shipments, units, and intel; asks Claude to suggest priorities |
| `route_planning` | Gathers route and zone data; asks for safe/profitable route recommendations |
| `threat_assessment` | Filters intel for a target; asks for threat level analysis |
| `trade_opportunities` | Pulls market orders; asks for arbitrage opportunities |
| `mission_briefing` | Provides context for a mission type; asks for execution plan |
| `faction_strategy` | Gathers faction and territory data; asks for strategic recommendations |
| `season_progress` | Pulls leaderboard and score; asks how to climb rankings |
| `game_overview` | Teaches game mechanics to new players; walks through getting started |

These prompts do basic data gathering and ask Claude for analysis. They're meant to be **outgrown**. The real game is building better versions.

### Ideas for Custom Tools

- **Pathfinder** - Only direct routes are shown. Build multi-hop optimization.
- **Market Scanner** - Spot arbitrage opportunities across zones, track price history.
- **Supply Chain Optimizer** - Automate extraction → production → delivery pipelines.
- **Intel Aggregator** - Track zone states over time, predict collapses before they happen.
- **Risk Analyzer** - Model raider activity patterns, calculate route safety scores.
- **Faction Coordinator** - Orchestrate multi-player logistics, assign zones to members.
- **Contract Optimizer** - Find contracts that align with routes you're already running.

## Production Recipes

### Resources
| Output | Inputs | Purpose |
|--------|--------|---------|
| metal | 2 ore + 1 fuel | Units, parts, ammo, comms |
| chemicals | 1 ore + 2 fuel | Rations, textiles, ammo, comms |
| rations | 3 grain + 1 fuel | Escorts, Supply Units |
| textiles | 2 fiber + 1 chemicals | Medkits, parts |
| ammo | 1 metal + 1 chemicals | Supply Units |
| medkits | 1 chemicals + 1 textiles | Zone stockpile (combat bonus) |
| parts | 1 metal + 1 textiles | Units, Supply Units, comms |
| comms | 1 metal + 1 chemicals + 1 parts | Raiders, zone stockpile (intel defense) |

### Units
| Unit | Inputs | Stats | Role |
|------|--------|-------|------|
| escort | 2 metal + 1 parts + 1 rations | str:10, maint:5/tick | Protect shipments |
| raider | 2 metal + 2 parts + 1 comms | str:15, maint:8/tick | Interdict routes |

### Supply Units
| Output | Inputs |
|--------|--------|
| 1 SU | 2 rations + 1 fuel + 1 parts + 1 ammo |

## Progression

### Shipment Licenses

| License | Rep Required | Cost | Capacity |
|---------|--------------|------|----------|
| Courier | 0 | Free | Small cargo |
| Freight | 50 | 500cr | Medium cargo |
| Convoy | 200 | 2000cr | Heavy armored |

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

### Subscription Tiers

All players get the same core gameplay. Paid tiers unlock collaboration, analytics, and discovery.

| Feature | Freelance | Operator | Command |
|---------|-----------|----------|---------|
| **Gameplay** |
| Actions/day | 200 | 250 | 300 |
| Market orders | 5 | 10 | 20 |
| Active contracts | 3 | 10 | 25 |
| **Analytics** |
| Event history | 200 | 10,000 | 100,000 |
| Market analytics | - | Basic | Advanced |
| **Factions** |
| Join factions | ✓ | ✓ | ✓ |
| Create factions | ✓ | ✓ | ✓ |
| Faction analytics | - | ✓ | ✓ |
| Audit logs | - | - | ✓ |
| **Templates** |
| Browse community templates | ✓ | ✓ | ✓ |
| One-click import | - | ✓ | ✓ |
| Publish templates | - | ✓ | ✓ |
| Featured placement | - | - | ✓ |
| **Market** |
| Basic orders | ✓ | ✓ | ✓ |
| Conditional orders | - | ✓ | ✓ |
| Time-weighted orders | - | - | ✓ |

## Self-Hosting (Optional)

Most players connect to the official server. Run your own if you want to:

- **Test strategies** without affecting your main account
- **Develop custom tools** with fast ticks (1 second instead of 10 minutes)
- **Host a private server** for your group
- **Contribute** to the game's development

### Running Locally

```bash
# Build
npm run build

# Start API server (default port 3000)
npm run server

# Start with fast ticks for testing (1 second)
npm run server:fast

# Initialize the world (first time only)
curl -X POST http://localhost:3000/admin/init-world -H "X-Admin-Key: your-admin-key"
```

### Environment Variables

```bash
# API Server
PORT=3000                    # Server port
TURSO_URL=file:game.db      # Database (local file or Turso URL)
TURSO_AUTH_TOKEN=           # Turso auth token (for remote DB)
TICK_INTERVAL=600000        # Tick interval in ms (10 min default)
ADMIN_KEY=your-secret       # Admin API key
ALLOWED_ORIGINS=            # Comma-separated CORS origins (empty = allow all)

# MCP Server (point to your local server)
BURNRATE_API_URL=http://localhost:3000
BURNRATE_API_KEY=your-api-key
```

### Admin Dashboard

Monitor your server with the admin API (requires `ADMIN_KEY`):

```bash
# Server overview: player counts, zone health, faction summary
curl -H "X-Admin-Key: your-secret" http://localhost:3000/admin/dashboard

# Player list (sortable by reputation, credits, activity, name)
curl -H "X-Admin-Key: your-secret" http://localhost:3000/admin/players?sort=activity

# Recent game events
curl -H "X-Admin-Key: your-secret" http://localhost:3000/admin/activity?limit=50
```

## Development & Deployment

### Branch Strategy

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Production | Railway production environment |
| `dev` | Testing | Railway development environment (separate Turso DB) |

**Workflow:**
1. Create a feature branch from `dev`
2. Open a PR into `dev` — test on the dev environment
3. When verified, open a PR from `dev` into `main` — deploys to production

### Zero-Downtime Deploys

Production deploys are safe mid-season:

- **API server**: Railway does rolling deploys — new instance starts, passes health check, old one drains. No downtime.
- **Tick server**: Uses idempotent tick claiming — if two instances overlap during a deploy, only one processes each tick. The guard prevents double-processing by checking `last_tick_at` timestamp before incrementing.

The admin `POST /admin/tick` endpoint bypasses the idempotency guard (for manual tick advancement during testing).

## License

MIT

---

**BURNRATE** | A Claude Code game
