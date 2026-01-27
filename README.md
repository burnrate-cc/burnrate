# BURNRATE

**A logistics war MMO for Claude Code.**

*The front doesn't feed itself.*

---

Hold territory by keeping it supplied. Every zone burns Supply Units each tick. When the supply stops, the zone falls. The best generals still lose if they can't feed the front.

- **CLI-native**: Your terminal is your war room
- **AI-collaborative**: Claude is your operations advisor
- **Operator advantage**: No grinding, no twitch—just better systems

## The Metagame

What if using Claude well *was* the actual game?

BURNRATE is designed for automation. The manual commands are training wheels. The real game is writing Claude agents that optimize extraction, find efficient routes, spot market arbitrage, and coordinate faction logistics.

The players who learn to work WITH Claude—analyzing intel, drafting doctrine, building automation—win. Skills transfer directly to real work.

**Play between tasks.** Check supply lines between deploys. Run convoys during CI builds. Strategy in the margins.

---

## Quick Start

```bash
# Install
npm install
npm run build

# Join the game
npx burnrate join YourName

# See the world
npx burnrate view
npx burnrate status

# Start playing
npx burnrate route              # See connections from your location
npx burnrate extract 50         # Extract resources (at Fields)
npx burnrate produce metal 10   # Convert resources (at Factories)
npx burnrate ship --to Factory.North --cargo "ore:50"
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

### The Meta
This game is designed for **automation**. Manual play works, but the real game is writing Claude agents that:
- Optimize extraction and production
- Find efficient multi-hop routes (pathfinding not provided)
- Analyze market arbitrage opportunities
- Coordinate faction logistics
- Gather and act on intelligence

## Commands

### Navigation & Info
```bash
burnrate view                    # Main dashboard
burnrate view zone <name>        # Zone details
burnrate route [zone]            # Direct connections from zone
burnrate status                  # Your inventory and stats
burnrate scan <zone>             # Gather intel (shared with faction)
```

### Economy
```bash
burnrate extract <qty>           # Extract at Fields
burnrate produce <item> <qty>    # Produce at Factories
burnrate ship --to <zone> --cargo "res:qty" [--via zone1,zone2]
burnrate buy <resource> <qty> [--limit price]
burnrate sell <resource> <qty> [--limit price]
```

### Military
```bash
burnrate units                   # List your units
burnrate units sell <id> <price> # List unit for sale
burnrate hire [unit-id]          # Buy units at Hubs
burnrate units escort <unit> <shipment>
burnrate units raider <unit> <from> <to>
```

### Factions
```bash
burnrate faction create <name> <TAG>
burnrate faction join <name>
burnrate faction info
burnrate faction members
burnrate faction intel           # View shared faction intelligence
burnrate capture                 # Capture current zone for faction
burnrate supply <amount>         # Deposit SU to zone
```

### Contracts
```bash
burnrate contracts               # List available
burnrate contracts post haul <from> <to> <res:qty> <reward>
burnrate contracts accept <id>
```

### Server
```bash
burnrate server status           # Check tick server
npm run server                   # Run tick server (10 min ticks)
npm run server:fast              # Run tick server (1 sec ticks, testing)
```

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

## Subscription Tiers

| Tier | Actions/Day | Market Orders | Concurrent Contracts |
|------|-------------|---------------|---------------------|
| Freelance (free) | 200 | 5 | 3 |
| Operator | 500 | 20 | 10 |
| Command | 1000 | 50 | 25 |

## Architecture

```
src/
├── cli/           # Command-line interface
│   ├── index.ts   # Command definitions
│   └── format.ts  # Terminal output formatting
├── core/          # Game logic
│   ├── types.ts   # Type definitions
│   ├── engine.ts  # Game simulation
│   ├── worldgen.ts # Map generation
│   └── pathfinding.ts # (Internal use only)
├── db/            # Persistence
│   └── database.ts # SQLite layer
└── server/        # Tick processing
    └── tick-server.ts
```

## Building Your Own Tools

The game intentionally provides minimal tooling. Build your competitive advantage:

- **Pathfinder** - Only direct routes are shown. Build multi-hop optimization.
- **Market Scanner** - Spot arbitrage opportunities across zones.
- **Supply Chain Optimizer** - Automate extraction → production → delivery.
- **Intel Aggregator** - Track zone states over time, predict collapses.
- **Risk Analyzer** - Model raider activity, route safety.

## License

MIT

---

**burnrate-cc** | A Claude Code game
