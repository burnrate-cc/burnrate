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

### 1. Install the MCP Server

Create a dedicated directory for BURNRATE (don't install inside other projects):

```bash
mkdir ~/burnrate && cd ~/burnrate
git clone https://github.com/burnrate-cc/burnrate.git .
npm install
npm run build
```

### 2. Configure Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "burnrate": {
      "command": "node",
      "args": ["/Users/YOU/burnrate/dist/mcp/server.js"],
      "env": {
        "BURNRATE_API_URL": "https://api.burnrate.cc"
      }
    }
  }
}
```

> **Note**: No API key needed yet—you'll get one when you join.

### 3. Join the Game

In Claude Code, ask Claude to join the game:

```
Use burnrate_join to create a character named "YourName"
```

You'll receive an API key. **Save it!** Then update your MCP settings to include it:

```json
"env": {
  "BURNRATE_API_URL": "https://api.burnrate.cc",
  "BURNRATE_API_KEY": "your-key-here"
}
```

Restart Claude Code to apply the new settings.

### 4. Start Playing

```
Use burnrate_status to see my inventory and location
Use burnrate_view to see the world map
Use burnrate_routes to see where I can travel
```

New players start with a 5-step tutorial that teaches core mechanics. Use `burnrate_tutorial` to see your progress, or ask Claude to use the `game_overview` prompt for a full walkthrough.

## Core Concepts

### The Burn
Every controlled zone consumes **Supply Units (SU)** each tick. If supply runs out, the zone collapses and becomes neutral. Winners are the factions that keep their zones fed while starving enemies.

### Credits
Credits are the in-game currency. You start with 1000 and earn more through contracts and trading. Spend them on:
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

Compliance streaks (consecutive ticks at 100% supply) grant additional bonuses at 50, 200, and 500 ticks.

### Seasons
The game runs in seasons (4 weeks each). Earn points through:
- Controlling zones (100 pts/zone/week)
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

# MCP Server (point to your local server)
BURNRATE_API_URL=http://localhost:3000
BURNRATE_API_KEY=your-api-key
```

## License

MIT

---

**BURNRATE** | A Claude Code game
