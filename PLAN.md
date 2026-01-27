# BURNRATE: Complete Game Design

> *The front doesn't feed itself.*

## Design Philosophy

### The Core Thesis
**"The game rewards you for becoming a better operator, not a better clicker."**

BURNRATE is a persistent territory control game where supply chains determine outcomes. The unique twist: your Claude Code session is both your interface AND your operations advisor. The skill ceiling isn't reaction time or hours played—it's how well you build systems, analyze patterns, and leverage AI assistance.

### What Makes This Novel
This is the first game designed around the assumption that players have access to an AI collaborator. Other games fight this (anti-bot, anti-automation). We embrace it:
- Players who learn to work WITH Claude gain real advantage
- The metagame is "teach Claude your doctrine and let it help you execute"
- Automation isn't cheating—it's the point

### The Three Pillars of Fun
1. **Operational Mastery**: Building better logistics systems than your rivals
2. **Strategic Depth**: Forecasting markets, planning offensives, coordinating factions
3. **Discovery Loop**: Finding new ways to leverage Claude, data analysis, and automation

---

## Part 1: The World

### Map Structure
The world is a **directed graph** of zones connected by routes. Not a grid—a network with chokepoints, bypass routes, and strategic geography.

**Initial Map Size (Season 1, <500 players):**
- 40-60 zones
- 100-150 routes
- 3-5 distinct "regions" with internal coherence
- 2-3 major chokepoints that become strategic flashpoints

**Zone Types:**

| Type | Count | Properties |
|------|-------|------------|
| **Hub** | 3-4 | Maximum safety, deep markets, spawn points for new players |
| **Factory** | 8-12 | Production centers that convert T0→T1→T2 goods |
| **Field** | 12-16 | Produces raw materials (ore, fuel, grain, fiber) |
| **Junction** | 10-15 | Crossroads with low intrinsic value but route importance |
| **Front** | 6-10 | High-value zones that require supply to hold |
| **Stronghold** | 3-5 | Control points that determine regional ownership |

**Route Properties:**
- `distance`: Time to traverse (in game-ticks, ~1 tick = 10 minutes real time)
- `capacity`: Maximum cargo flow per tick
- `base_risk`: Inherent interception probability (0.0-0.3)
- `chokepoint_rating`: Multiplier for ambush effectiveness (1.0-3.0)
- `terrain`: Affects what escort types are effective

### Time Scale
- **1 game tick = 10 minutes real time**
- Supply burns happen each tick
- Markets update each tick
- Shipments move zone-to-zone per tick based on distance

This creates a rhythm where:
- Quick check (1-2 ticks): Review alerts, dispatch couriers, adjust orders
- Session play (6-12 ticks): Run a convoy operation, do a recon sweep
- Strategic planning: Happens across many sessions

---

## Part 2: Resources and Production

### Resource Tiers

**T0 (Raw Materials)** - Produced by Fields
- `ore` → used in metal production
- `fuel` → used in everything that moves
- `grain` → used in rations
- `fiber` → used in textiles and parts

**T1 (Processed Goods)** - Made in Factories
- `metal` = ore + fuel (2:1)
- `chemicals` = ore + fuel (1:2)
- `rations` = grain + fuel (3:1)
- `textiles` = fiber + chemicals (2:1)

**T2 (Strategic Goods)** - Made in Factories
- `ammo` = metal + chemicals (1:1)
- `medkits` = chemicals + textiles (1:1)
- `parts` = metal + textiles (1:1)
- `comms` = metal + chemicals + parts (1:1:1)

**Supply Units (SU)** - The universal war currency
```
1 SU = 2 rations + 1 fuel + 1 parts + 1 ammo
```

### Why This Resource Tree Works
- Forces multi-commodity logistics (can't just haul one thing)
- Creates natural trade specialization (fuel-rich vs grain-rich regions)
- Every offensive creates predictable supply shocks
- Factory zones become strategic targets
- Shortage cascades create emergent crises

### Production Mechanics
- Zones have **production capacity** (units/tick)
- Production requires inputs to be present in zone inventory
- Players can own **production orders** that reserve capacity
- Recipes are fixed, but efficiency upgrades exist

---

## Part 3: The Supply Burn Mechanic

### Core Rule
**Every controlled zone burns Supply Units (SU) each tick to remain stable.**

| Zone Type | SU Burn Rate | Control Benefit |
|-----------|--------------|-----------------|
| Front | 10 SU/tick | +50% interception in adjacent routes |
| Stronghold | 20 SU/tick | Regional ownership, production bonuses |
| Factory | 5 SU/tick | Production efficiency +20% |
| Field | 3 SU/tick | Extraction rate +30% |

### Supply States
- **Supplied (100%+)**: Full buffs active, zone stable
- **Strained (50-99%)**: Reduced buffs, visible warning
- **Critical (<50%)**: Buffs disabled, zone becomes raidable
- **Collapsed (0%)**: Zone flips to neutral, can be claimed

### Supply Compliance Streak
Consecutive ticks of 100%+ supply build a **compliance streak**:
- 50 ticks: +10% zone buff
- 200 ticks: +25% zone buff
- 500 ticks: +50% zone buff, "Stronghold" status

This rewards sustained logistics excellence, not just burst supply dumps.

---

## Part 4: Logistics System

### Shipment Types

| Type | Capacity | Speed | Visibility | Interception Chance Modifier |
|------|----------|-------|------------|------------------------------|
| Courier | 10 units | Fast (+50%) | Low | -50% |
| Freight | 50 units | Normal | Medium | +0% |
| Convoy | 200 units | Slow (-25%) | High | +100% |

### Shipment Lifecycle
1. **Create**: Specify origin, destination, cargo, type
2. **Launch**: Shipment enters route, becomes visible to intel
3. **Transit**: Moves through intermediate zones
4. **Arrival**: Cargo delivered (or lost if intercepted)

### Escort Mechanics
Convoys can have escorts that reduce interception risk:
- Each escort unit reduces interception chance by flat percentage
- Escorts can "counter-ambush" if attacker is detected early
- Escort strength vs attacker strength determines engagement outcome

### Interception Resolution
```
interception_chance = base_route_risk
    × chokepoint_rating
    × shipment_visibility_modifier
    × (1 - escort_reduction)
    × attacker_intel_quality
    × (1 - defender_intel_warning)
```

If intercepted, cargo is partially or fully lost based on:
- Attacker strength vs escort strength
- Element of surprise (intel advantage)
- Route terrain

**Key insight**: Interception is probabilistic but predictable. Good operators can calculate risk and make informed decisions.

---

## Part 5: Intel System

### Fog of War
Players do not see the world state directly. They see:
- Their own assets (shipments, orders, inventory)
- Zones they have "coverage" in
- Intel reports (which decay over time)

### Intel Actions
- **SCAN**: Reveal current state of a route or zone (costs action, coverage lasts 10 ticks)
- **WATCH**: Place persistent surveillance on a route (requires asset, continuous intel)
- **ANALYZE**: Process historical data to predict patterns (Claude-assisted)

### Intel Quality
Each intel report has a **freshness** rating:
- Fresh (<5 ticks old): Accurate
- Stale (5-20 ticks): May be outdated
- Expired (>20 ticks): Unreliable

### Intel Outputs
Good intel networks produce:
- Route risk heatmaps
- Convoy sighting reports
- Supply burn rate estimates for enemy zones
- Production capacity utilization guesses
- Offensive preparation indicators

### The Claude-Intel Connection
This is where Claude becomes your intel analyst:
- "Summarize the last 50 intel reports and identify patterns"
- "Based on these convoy sightings, where is the enemy offensive likely targeting?"
- "Write a morning brief for my faction based on overnight intel"

---

## Part 6: The Claude Integration Layer

### The Novel Differentiator
This section defines what makes the game *only possible* in Claude Code.

### Principle: Progressive AI Collaboration
Players start executing simple commands. Over time, they discover they can:
1. Ask Claude questions about game state
2. Have Claude analyze data and suggest actions
3. Teach Claude their faction's doctrine
4. Let Claude draft operational plans
5. Build automation scripts with Claude's help
6. Run those automations on schedule

### The Natural Progression

**Level 1: Command Execution** (Day 1)
```
> burnrate view
> burnrate ship --from Hub.Central --to Front.Kessel --cargo "rations:50"
> burnrate events
```

**Level 2: Asking for Help** (Day 2-3)
```
> "What's the safest route from Hub.Central to Front.Kessel right now?"
> "Summarize my faction's supply situation"
```

**Level 3: Analysis and Planning** (Week 1)
```
> "Analyze these 100 convoy intercepts and identify patterns"
> "Draft a weekly logistics plan for maintaining Front.Kessel"
```

**Level 4: Doctrine and Memory** (Week 2+)
```
> "Read our faction doctrine in /doctrine/convoy_rules.md and check if this plan complies"
> "Update our intel brief based on the last 24 hours"
```

**Level 5: Agent Building** (Week 3+)
```
> "Write me an agent that monitors Hub.Central prices and alerts me if fuel exceeds 50 cr"
> "Help me build an agent that maintains 500 SU stockpile in Front.Kessel"
```

**Level 6: Continuous Improvement** (Ongoing)
```
> "Review our convoy loss rates this week and suggest doctrine updates"
> "Our agent isn't catching price spikes fast enough. Improve it."
```

### What the Game Provides

**1. Rich Data Exports**
The game API returns structured data that Claude can analyze:
```json
{
  "zone": "Front.Kessel",
  "supply_status": "strained",
  "burn_rate": 10,
  "current_stock": 45,
  "hours_until_critical": 4.5,
  "inbound_shipments": [...],
  "route_risks": {...}
}
```

**2. Doctrine Compliance System**
Factions can publish doctrine documents. The game recognizes:
- When actions match doctrine patterns
- Small efficiency buffs for consistent doctrine adherence
- This encourages writing real operational docs that Claude can read

**3. Event Log Depth**
Subscription tiers unlock more history. This isn't just retention—it's **training data** for pattern recognition:
- Freelance (free): 200 events (enough to see recent activity)
- Operator: 10,000 events (enough to spot weekly patterns)
- Command: 100,000 events (enough to build predictive models)

**4. Automation Philosophy: Go Nuts**
Automation IS the game. We don't limit how many scripts you write—we limit how fast anyone can act:

- **Server rate limits**: 1 action per 30 seconds per account (everyone equal)
- **Daily action quotas**: Scales with tier (Freelance: 200, Operator: 500, Command: 1000)
- **High-impact confirmations**: Some actions require manual confirmation regardless

**What this means:**
- Write as many Claude-assisted scripts as you want
- Run cron jobs, build dashboards, deploy monitoring
- Your automation competes on *quality*, not *quantity of slots*
- A clever Freelance player with one good script beats a Command player with bad scripts

The limit is on *actions executed*, not *automations written*. This is more honest and fits the core thesis: the game rewards operator excellence, and automation is how operators scale.

### The Meta-Game IS Using Claude Well
The skill ceiling is:
- Teaching Claude your faction's strategy
- Building prompts that generate good analysis
- Creating agents that execute reliably
- Developing playbooks that Claude can follow

This creates a new kind of gaming content:
- Players share their best prompts
- Factions publish "Claude briefing templates"
- Meta discussions about "how to make Claude a better Quartermaster"

---

## Part 7: Combat (Lightweight, Consequential)

### Design Goal
Combat should be an outcome of logistics success, not a replacement for it.

### Combat Situations
1. **Convoy Interception**: Raider vs Escort
2. **Zone Raid**: Attacker vs Zone Defense
3. **Zone Flip**: Faction vs Faction when zone collapses

### Resolution System
Combat is resolved in one calculation, not a minigame:

```
outcome = weighted_roll(
  attacker_strength,
  defender_strength,
  attacker_intel_bonus,
  defender_intel_bonus,
  terrain_modifier,
  supply_state_modifier
)
```

Results:
- **Decisive Victory**: Full objective achieved, minimal losses
- **Costly Victory**: Objective achieved, significant losses
- **Stalemate**: Neither side achieves objective
- **Defeat**: Objective failed, losses taken

### Combat Units
Players don't have "armies"—they have:
- **Escort units**: Protect convoys
- **Raider units**: Intercept enemy logistics
- **Garrison**: Zone defense (faction-level)

### Acquiring Units

**Escorts and Raiders** are hired from Hubs:
```
burnrate hire escort --count 2 --at Hub.Central
> Hired 2 Escort units for 500 cr
> Maintenance: 10 cr/tick while deployed
> Units stationed at Hub.Central
```

**Unit Economics:**
- **Purchase cost**: One-time fee to hire (scales with strength)
- **Maintenance**: Ongoing cr/tick while the unit exists
- **Deployment**: Attach to convoys (escorts) or assign to routes (raiders)
- **Attrition**: Units can be destroyed in combat, requiring replacement

**Garrison** is different—it's a faction infrastructure upgrade:
- Factions invest in garrison levels per zone they control
- Garrison strength is funded by the zone's SU burn (already happening)
- Higher garrison = better defense against raids
- No individual units to manage; it's an abstraction

### Unit Stats
- **Strength**: Combat power (determines engagement outcomes)
- **Speed**: Affects interception range for raiders
- **Maintenance**: Ongoing cr/tick cost

### Why This Works
- Combat matters but doesn't dominate
- Logistics determine who can *afford* combat
- Intel determines who *wins* combat
- The best generals lose if they can't feed their troops

---

## Part 8: Factions

### Faction Structure
Factions are player-created organizations with:
- **Treasury**: Shared credits and resources
- **Controlled Zones**: Territory that burns their supply
- **Doctrine Files**: Published strategy documents
- **Roles**: Leadership positions (emergent, not hard-coded)

### Creating a Faction
Requires:
- 3+ founding members
- Initial treasury deposit
- Control of at least 1 zone
- Published founding doctrine (even if simple)

### Faction Ranks (Enforced Permissions)
Unlike roles (which are informal), **ranks** determine what actions a member can take:

| Rank | Treasury | Contracts | Doctrine | Members | Diplomacy |
|------|----------|-----------|----------|---------|-----------|
| **Founder** | Full | Full | Full | Full | Full |
| **Officer** | Withdraw up to daily limit | Post faction contracts | Edit | Invite, kick members | Propose |
| **Member** | Deposit only | Accept contracts | View | — | — |

**Founder** (1 per faction):
- Cannot be kicked
- Can transfer founder status to an Officer
- Full control over everything

**Officers** (unlimited):
- Promoted by Founder or other Officers
- Treasury withdrawal capped at configurable daily limit (prevents single-actor embezzlement)
- Can post contracts using faction funds
- Can edit doctrine files
- Can invite new members, kick Members (not Officers)
- Can propose alliances/wars (Founder must approve)

**Members** (unlimited, up to faction cap of 50):
- Can deposit to treasury
- Can accept faction contracts
- Can view doctrine
- Cannot withdraw, cannot kick, cannot change settings

### Faction Roles (Informal, Suggested)
These are coordination conventions, not system-enforced:
- **Commander**: Strategic direction, offensive planning
- **Quartermaster**: Supply targets, procurement
- **Intel Chief**: Surveillance, threat assessment
- **Logistics Lead**: Convoy scheduling, route planning
- **Market Op**: Trading, price stabilization
- **Raider Captain**: Interdiction operations

### Faction Progression
Factions can unlock:
- Market depth upgrades (better liquidity in their zones)
- Relay networks (passive intel coverage)
- Route fortification (reduced risk on key routes)
- Production efficiency (better conversion ratios)
- Garrison upgrades (zone defense buffs)

These unlocks require sustained territory control + resource investment.

### Cross-Faction Dynamics
- **Alliances**: Can be declared, enable shared intel
- **Trade Agreements**: Reduced fees between allied faction members
- **Non-Aggression Pacts**: Honored by reputation, not mechanics
- **War Declarations**: Enable special offensive operations

### The Social Contract
Factions that coordinate well dominate. This means:
- Regular briefings (Claude can help draft these)
- Shared doctrine documents
- Coverage schedules for intel
- Duty rosters for supply runs

The game doesn't force this—it rewards it naturally.

---

## Part 9: Contract System

### Purpose
Contracts create "infinite jobs" and enable coordination between strangers.

### Contract Types

**Haul Contracts**
```
HAUL 100 rations from Hub.Central to Front.Kessel
DEADLINE: 50 ticks
REWARD: 500 cr + 10 faction rep
BONUS: +200 cr if delivered in <30 ticks
```

**Produce Contracts**
```
PRODUCE 200 SU at Factory.North
DEADLINE: 100 ticks
REWARD: 1000 cr
```

**Scout Contracts**
```
MAINTAIN signal on Junction.4 → Front.Kessel for 200 ticks
REWARD: 50 cr/tick of coverage
```

**Escort Contracts**
```
ESCORT convoy #1234 from Factory.North to Front.Kessel
REWARD: 300 cr + combat bonus if engaged
```

### Contract Sources
- **Faction-posted**: Leadership creates needs
- **Player-posted**: Anyone can post, pays from own funds
- **System-generated**: Emergent from supply burn deficits

### Contract Board
Each zone has a contract board showing available work. This creates a "gig economy" where:
- New players can find useful work immediately
- Factions can outsource to neutral haulers
- Specialists can build reputations

---

## Part 10: New Player Experience

### The First 10 Minutes

**Spawn**: New players appear in a Hub with:
- 500 starting credits
- 1 Courier license (can send small shipments)
- Tutorial flag enabled

**Tutorial Sequence** (guided by Claude):
1. `burnrate view` — "Here's what you're looking at..."
2. Check local market prices
3. Buy a small cargo of goods
4. Ship it to an adjacent zone where prices are higher
5. Sell for profit
6. Receive first payout

**Immediate Wins**:
- Made credits on first trade
- Understands basic loop
- Sees the contract board
- Gets invited to join starter faction

### Starter Zones
The 3-4 Hubs are **starter zones** with:
- No PvP interdiction (safe routes between Hubs)
- Active contract boards with easy Haul jobs
- Friendly faction recruiters (NPCs or players)
- Lower stakes (cheaper goods, shorter distances)

### Graduation Path
After completing ~20 contracts or earning ~5000 cr:
- Player can access Front routes
- Gets Freight license (medium shipments)
- Can join factions operating in dangerous territory
- Tutorial flag disabled

### Why This Works
- Immediate success (profitable in 5 minutes)
- Clear progression path
- Protected while learning
- Natural faction absorption
- Doesn't feel like a "tutorial prison"

---

## Part 11: Progression Systems

### Personal Progression

**Licenses** (Capacity Unlocks)
- Courier → Freight → Convoy operator
- Each tier unlocks larger shipment sizes
- Earned through credits + reputation

**Reputation** (Access Unlocks)
- Global reputation: Opens better contracts
- Faction reputation: Opens faction privileges
- Zone reputation: Reduced fees, priority in queues

**Operational Capabilities**
- Market order limits (concurrent open orders)
- Contract limits (concurrent active contracts)
- Intel access (how much historical data you see)
- Agent slots (for Operator/Command tiers)

### Key Principle: No Stat Inflation
A day-1 player's courier arrives just as fast as a veteran's courier. Veterans have:
- More capacity (can move more at once)
- Better access (can go more places)
- More leverage (automation, contracts, tools)

But not:
- More damage
- Faster ships
- Magical bonuses

### Faction Progression

**Territory Unlocks**
More zones controlled → more upgrade capacity

**Infrastructure Upgrades**
- Market depth (liquidity in controlled zones)
- Relay network (passive intel coverage)
- Route fortification (reduced base risk)
- Production bonuses (Factory efficiency)
- Garrison strength (zone defense)

**Legacy (Cross-Season)**
Factions keep:
- Reputation history
- Legacy titles (achievements)
- Faction identity/branding

But lose:
- Territory
- Resources
- Infrastructure upgrades

---

## Part 12: Economy Design

### Markets
Every zone has a local market with:
- Order book (bids and asks)
- Recent trade history
- Supply/demand indicators

### Price Discovery
Prices emerge from:
- Local production (supply)
- Local consumption (SU burn = demand)
- Trade flow (arbitrage equilibrates)
- Disruption (route cuts = local spikes)
- Speculation (players anticipating offensives)

### Player Profit Opportunities

**Arbitrage**: Buy low in surplus zones, sell high in deficit zones
**Production**: Convert T0→T1→T2 and sell processed goods
**Contract Hauling**: Get paid to move other people's cargo
**Market Making**: Provide liquidity, profit from spread
**Speculation**: Anticipate war movements, position ahead

### The War-Economy Loop
Every major offensive creates predictable market effects:
1. Faction announces (or leaks) offensive target
2. SU demand spikes near target zone
3. Fuel demand spikes along supply routes
4. Players who anticipated this profit
5. Players who got caught off-guard scramble

This creates a **forecasting metagame** where good analysis pays.

### Currency
- **Credits**: The base currency for all transactions
- **CHARTER**: Premium token (bought or traded, see Monetization)
- Resources are tradeable commodities, not currencies

### Anti-Manipulation Rules
- Order size limits (can't corner a market with one order)
- Price band limits (orders must be within X% of recent trades)
- Wash trade detection (can't trade with yourself)
- Market maker incentives (provide liquidity, get rebates)

---

## Part 13: Season Structure

### Season Length
**6 weeks** (with discussion about 4-week alternative for faster iteration)

### Season Rhythm
- **Week 1**: Land grab, establishing positions
- **Week 2-3**: Economic development, building supply chains
- **Week 4-5**: Major offensives, faction warfare
- **Week 6**: Final push, dramatic conclusions

### Season Reset
What resets:
- All territory (starts neutral)
- All zone upgrades
- All inventories and credits
- Market state

What persists:
- Player accounts and licenses
- Faction identity and legacy titles
- Personal reputation (at reduced rate)
- Premium status and CHARTER holdings

### Scoring Categories
Multiple victory conditions prevent monoculture:

| Category | Measurement | Playstyle Rewarded |
|----------|-------------|-------------------|
| Territory | Zone-hours controlled | Logistics excellence |
| Supply | SU delivered to contested zones | Hauler dedication |
| Interdiction | Cargo value destroyed | Raider effectiveness |
| Market Stability | Price volatility reduction | Market maker skill |
| Intel Dominance | Coverage hours × accuracy | Scout networks |

### End-of-Season
- Final standings published
- Legacy titles awarded
- "Hall of Fame" moments captured
- 48-hour intermission before next season

---

## Part 14: Monetization (Refined)

### CHARTER Token
Tradeable premium currency:
- Bought with real money from game operator
- Sold between players on global market
- Redeemed for Premium time, cosmetics, convenience

### Redemption Options
- 30 days Operator license
- 30 days Command license
- Action quota boost (+100 actions/day for 7 days)
- Cosmetic title/insignia
- Faction Ops Suite credit

### Tier Comparison

| Feature | Freelance | Operator | Command |
|---------|-----------|----------|---------|
| Full gameplay | Yes | Yes | Yes |
| Event history | 200 | 10,000 | 100,000 |
| Daily action quota | 200 | 500 | 1000 |
| Concurrent contracts | 3 | 10 | 25 |
| Market orders | 5 | 20 | 50 |
| Saved doctrines | 3 | 20 | Unlimited |
| Data export rate | 1/min | 10/min | 60/min |
| Faction tools | No | Basic | Full |

*Note: Action rate limit (1 per 30 sec) applies to everyone equally. Quotas determine total daily capacity.*

### The Grinder Path
Freelance players can:
- Play the full game
- Earn credits through gameplay
- Buy CHARTER from other players
- Use CHARTER to unlock Operator

This creates the healthy PLEX/Bond dynamic where:
- Whales fund the game
- Grinders earn their way
- Everyone can compete

### What Paid NEVER Provides
- Combat advantages
- Faster travel
- More cargo capacity
- Interception immunity
- Any "win more" mechanics

---

## Part 15: The Drama Engine

### What Creates Memorable Moments

**1. Betrayal Mechanics**
- Faction treasuries can be embezzled
- Alliance intel can be leaked
- Double agents are possible

**2. Comeback Stories**
- Collapsed factions can rebuild
- Underdog supply runs can flip territory
- Last-minute offensive saves

**3. Economic Warfare**
- Market manipulation campaigns
- Fuel embargo operations
- Supply starve strategies

**4. Intelligence Coups**
- Cracking enemy convoy schedules
- Discovering offensive plans early
- Counter-intel operations

**5. Legendary Operations**
The game should make it possible to do things like:
- "The Kessel Run" (massive coordinated convoy through enemy territory)
- "Operation Starvation" (cutting all routes to enemy Stronghold)
- "The Fuel Crisis of Week 4" (market manipulation event)

### How We Enable This
- Rich event logging (everything is recorded)
- After-action reports (Claude can generate summaries)
- Season narratives (memorable moments highlighted)
- Hall of Fame for dramatic plays

---

## Part 16: Visual Design (Terminal Aesthetics)

### Design Principles
- Clean, readable text
- Strategic use of ASCII art
- Sparklines for trends
- Unicode box drawing for tables
- Color for status (green/yellow/red)

### Example: World View
```
╔════════════════════════════════════════════════════════════════╗
║  BURNRATE  │  Tick 4,521  │  Season 1 Week 3  │  Freelance    ║
╠════════════════════════════════════════════════════════════════╣
║  BALANCE: 12,450 cr  │  SHIPMENTS: 3 active  │  CONTRACTS: 2  ║
╠════════════════════════════════════════════════════════════════╣
║  ALERTS                                                        ║
║  ⚠ Front.Kessel supply STRAINED (62%) - 4.2h until critical   ║
║  ⚠ Fuel prices spiking at Hub.Central (+23%)                  ║
║  ✓ Convoy #892 arrived at Factory.North                       ║
╠════════════════════════════════════════════════════════════════╣
║  LOCATION: Hub.Central                                         ║
║  Supply: ████████████████████ 100%  SUPPLIED                  ║
║  Market: rations 12↑  fuel 48↑↑  parts 35→  metal 28↓         ║
║  Routes: →Factory.North (safe)  →Junction.4 (moderate)        ║
║          →Front.Kessel (dangerous)                             ║
╚════════════════════════════════════════════════════════════════╝
```

### Example: Route Risk Heatmap
```
Route Risk Assessment (last 20 ticks)
─────────────────────────────────────────────────────
Hub.Central → Factory.North    ░░░░░░░░░░  5%   SAFE
Factory.North → Junction.4     ▒▒▒▒░░░░░░  18%  MODERATE
Junction.4 → Front.Kessel      ▓▓▓▓▓▓▒▒░░  45%  DANGEROUS
Hub.East → Front.Kessel        ████████▓▓  78%  AVOID

Legend: ░ <10% ▒ 10-30% ▓ 30-50% █ >50%
```

### Example: Price Trend
```
Fuel @ Hub.Central (50 ticks)
Price: 48 cr  │  Δ24h: +23%  │  Volatility: HIGH

   52 ┤              ╭─╮
   48 ┤         ╭───╯  ╰──  ← now
   44 ┤    ╭───╯
   40 ┼───╯
      └───────────────────
       -50            now
```

---

## Part 17: Technical Architecture (Principles)

### Design for Scale
Even with <500 players initially, build for:
- Stateless API servers (horizontal scaling)
- Event-sourced game state (replayability, analytics)
- Shardable world (region-based if needed)
- Read replicas for heavy queries

### API Design
REST + WebSocket hybrid:
- REST for actions (`POST /act`, `GET /state`)
- WebSocket for real-time events (price ticks, alerts)
- Rate limiting built into protocol

### Data Model (High-Level)
```
World
├── Zones[]
│   ├── type, position, owner, supply_level
│   ├── market (order_book, trade_history)
│   └── production (capacity, orders)
├── Routes[]
│   ├── from_zone, to_zone
│   ├── distance, capacity, base_risk
│   └── active_shipments[]
├── Factions[]
│   ├── treasury, controlled_zones[]
│   ├── doctrine_hash, upgrades
│   └── members[]
└── Players[]
    ├── account, credits, reputation
    ├── licenses, inventory
    └── agents[]
```

### Event Sourcing
All game state changes are events:
- `ShipmentCreated`, `ShipmentArrived`, `ShipmentIntercepted`
- `TradeExecuted`, `OrderPlaced`, `OrderCancelled`
- `ZoneSupplied`, `ZoneCollapsed`, `ZoneFlipped`
- `CombatResolved`, `IntelGathered`

This enables:
- Complete history replay
- Analytics and pattern detection
- "What happened" reconstruction
- Cheating detection

### Clock and Ticks
- Server authoritative tick clock
- 1 tick = 10 minutes (configurable)
- All game events are tick-stamped
- Players can query "current tick" and schedule future actions

---

## Part 18: Design Decisions (Resolved)

### 1. Claude Model Access
**Decision:** Accept model disparity. Part of player optimization is choosing their model (quality vs. rate limits tradeoff). This is another dimension of the operator meta.

### 2. Mobile/Async Access
**Decision:** API-first architecture. Mobile interface later. Season 1 is Claude Code desktop only.

### 3. Real-Time vs Turn-Based
**Decision:** Real-time with ticks (1 tick = 10 minutes). Creates urgency without being twitchy.

### 4. Faction Size Limits
**Decision:** Hard cap at 50 members per faction.

### 5. Cross-Season Persistence
**Decision:** Persist reputation, reset gameplay. New players can compete each season. Legacy is bragging rights, not power.

---

## Part 19: MVP Scope

### Week 1-2: Core Loop
- World state API (zones, routes, basic resources)
- Movement system (shipments transit zones)
- Basic market (bid/ask, trade execution)
- Supply burn mechanic
- Simple combat resolution
- `burnrate view`, `burnrate ship`, `burnrate events`

### Week 3-4: Social Systems
- Factions (create, join, treasury)
- Contracts (Haul, Produce, Scout, Escort)
- Intel system (SCAN, signal decay)
- Reputation tracking

### Week 5-6: Polish and Balance
- New player tutorial
- Subscription tiers (Freelance/Operator/Command) and CHARTER
- Agent registration system
- Doctrine compliance system
- Season scoring

### Week 7-8: Beta Testing
- Closed beta with 50-100 players
- Balance adjustments
- Bug fixes
- Performance optimization

### Season 1 Launch: Week 9+
- Public launch, capped at 500 players
- Full season (6 weeks)
- Post-season analysis and iteration

---

## Summary

BURNRATE is a game about **operational excellence** played through **Claude Code**.

The core insight: in a world where everyone has access to an AI assistant, the game becomes about **who uses that assistant best**. Players who learn to work with Claude—asking better questions, building better prompts, creating better agents—gain real competitive advantage.

The supply burn mechanic ensures logistics is never optional. The intel system creates fog of war that rewards information gathering. The faction system enables coordination at scale. The economy creates prediction games around war movements.

And because everything happens through Claude Code, the game naturally produces documentation, analysis, and tooling that players want to share and improve.

This is the first game designed for the AI-assisted era.

**The front doesn't feed itself.**
