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

The players who learn to work WITH Claude—analyzing intel, drafting doctrine, building automation—win. Skills transfer directly to real work.

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

### 1. Install the MCP Server

```bash
git clone <repo>
cd burnrate
npm install
npm run build
```

### 2. Configure Claude Code

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "burnrate": {
      "command": "node",
      "args": ["/path/to/burnrate/dist/mcp/server.js"],
      "env": {
        "BURNRATE_API_URL": "https://your-game-server.com",
        "BURNRATE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 3. Join the Game

In Claude Code, use the MCP tools:

```
Use burnrate_join to create a character named "YourName"
```

Save your API key! You'll need it to authenticate in future sessions.

### 4. Start Playing

```
Use burnrate_status to see my inventory and location
Use burnrate_view to see the world map
Use burnrate_routes to see where I can travel
```

## Core Concepts

### The Burn
Every controlled zone consumes **Supply Units (SU)** each tick. If supply runs out, the zone collapses and becomes neutral. Winners are the factions that keep their zones fed while starving enemies.

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

### Intel Decay
Intelligence gathered through scanning decays over time:
- **Fresh** (<10 ticks) - Full accuracy
- **Stale** (10-50 ticks) - Reduced signal quality, some data obscured
- **Expired** (>50 ticks) - Unreliable, most data unavailable

### Seasons
The game runs in seasons (4 weeks each). Earn points through:
- Controlling zones (100 pts/zone/week)
- Completing shipments (10 pts each)
- Fulfilling contracts (25 pts each)
- Delivering supplies (1 pt per SU)
- Winning combat (50 pts per victory)
- Gaining reputation (2 pts per rep point)

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

### Seasons & Leaderboards
| Tool | Description |
|------|-------------|
| `burnrate_season` | Current season info |
| `burnrate_leaderboard` | Season rankings |
| `burnrate_season_score` | Your season score |

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

## MCP Prompts

Pre-built analysis templates:

| Prompt | Description |
|--------|-------------|
| `situation_analysis` | Analyze current state and suggest priorities |
| `route_planning` | Find safe and profitable shipping routes |
| `threat_assessment` | Assess threats using available intel |
| `trade_opportunities` | Find profitable market trades |
| `mission_briefing` | Get briefing for extraction/production/shipping/capture/contract |
| `faction_strategy` | Analyze faction position and strategy |
| `season_progress` | Review performance and improvement suggestions |

## Production Recipes

### Resources
| Output | Inputs | Location |
|--------|--------|----------|
| metal | 2 ore + 1 fuel | Factory |
| chemicals | 1 ore + 2 fuel | Factory |
| rations | 3 grain + 1 fuel | Factory |
| textiles | 2 fiber + 1 chemicals | Factory |
| ammo | 1 metal + 1 chemicals | Factory |
| medkits | 1 chemicals + 1 textiles | Factory |
| parts | 1 metal + 1 textiles | Factory |
| comms | 1 metal + 1 chemicals + 1 parts | Factory |

### Units
| Unit | Inputs | Stats |
|------|--------|-------|
| escort | 2 metal + 1 parts + 1 rations | str:10, maint:5/tick |
| raider | 2 metal + 2 parts + 1 comms | str:15, maint:8/tick |

### Supply Units
| Output | Inputs |
|--------|--------|
| 1 SU | 2 rations + 1 fuel + 1 parts + 1 ammo |

## Shipment Licenses

| License | Rep Required | Cost | Capacity |
|---------|--------------|------|----------|
| Courier | 0 | Free | Small cargo |
| Freight | 50 | 500cr | Medium cargo |
| Convoy | 200 | 2000cr | Heavy armored |

## Reputation Titles

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

## Subscription Tiers

| Tier | Actions/Day | Market Orders | Contracts | Event History |
|------|-------------|---------------|-----------|---------------|
| Freelance | 200 | 5 | 3 | 200 |
| Operator | 500 | 20 | 10 | 10,000 |
| Command | 1000 | 50 | 25 | 100,000 |

## Running Your Own Server

### Development

```bash
# Build
npm run build

# Start API server (default port 3000)
npm run server

# Start with fast ticks for testing (1 second)
npm run server:fast

# Check server status
node dist/cli/index.js server status
```

### Environment Variables

```bash
# API Server
PORT=3000                    # Server port
TURSO_URL=file:game.db      # Turso database URL
TURSO_AUTH_TOKEN=           # Turso auth token (for remote)
TICK_INTERVAL=600000        # Tick interval in ms (10 min default)

# MCP Server (client-side)
BURNRATE_API_URL=http://localhost:3000
BURNRATE_API_KEY=your-api-key
```

## Building Your Own Tools

The game intentionally provides minimal tooling. Build your competitive advantage:

- **Pathfinder** - Only direct routes are shown. Build multi-hop optimization.
- **Market Scanner** - Spot arbitrage opportunities across zones.
- **Supply Chain Optimizer** - Automate extraction → production → delivery.
- **Intel Aggregator** - Track zone states over time, predict collapses.
- **Risk Analyzer** - Model raider activity, route safety.
- **Faction Coordinator** - Orchestrate multi-player logistics.

## License

MIT

---

**BURNRATE** | A Claude Code game
