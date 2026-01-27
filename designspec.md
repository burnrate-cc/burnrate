## Logistics War MMO: game design spec (Claude Code-native)

### Elevator pitch

A persistent world war where territory is won by **sustaining supply**.  
Players don’t win by grinding stats—they win by building **better logistics, forecasting, intel networks, and faction ops** inside Claude Code.

The “fun” is: every advantage is an operator advantage.

----------

# 1) The core loop (what players do every day)

### 60-second loop (solo)

1.  `world.view()` → see shortages, prices, threats, opportunities
    
2.  Consult local playbooks (`/doctrine/*.md`)
    
3.  `world.act(...)` → move goods / run recon / place orders / escort convoy
    
4.  `world.events()` → observe outcomes
    
5.  Update playbooks or tooling
    

### 10-minute loop (squad)

-   Scout route risk
    
-   Organize a convoy
    
-   Escort it
    
-   Deliver to a contested zone
    
-   Win an objective by keeping it fed
    

### Weekly loop (faction leadership)

-   Set doctrine and procurement targets
    
-   Allocate budgets
    
-   Decide what fronts to hold vs abandon
    
-   Run scheduled operations
    
-   Counter enemy interdiction patterns
    

----------

# 2) The world model

### Map

-   World is a graph of **zones** connected by **routes**
    
-   Routes have properties:
    
    -   distance (time to travel)
        
    -   capacity (max flow)
        
    -   risk (piracy probability)
        
    -   chokepoint multiplier (better ambush odds)
        

### Zone types

1.  **City / Hub**
    
    -   strong market liquidity
        
    -   safe-ish
        
    -   good intel coverage
        
2.  **Factory Zone**
    
    -   converts inputs → outputs
        
    -   high strategic value
        
3.  **Resource Zone**
    
    -   produces raw resources hourly
        
4.  **Frontier / Contested**
    
    -   best rewards
        
    -   highest risk
        
5.  **Fortress / Control Point**
    
    -   determines territorial ownership
        

----------

# 3) The single mechanic that makes the whole game work

## Control requires supply burn

Every controlled zone consumes **Supply Units (SU)** per hour to remain stable.

-   If supply is sustained → zone buffs stack (production, defense, intel, market depth)
    
-   If supply drops → zone becomes unstable → easier to raid → can flip ownership
    

**This makes logistics non-optional.**  
The best fighters still lose if they can’t feed the front.

----------

# 4) Resources and production (simple, deep)

### Resource tiers

**T0 (raw):**

-   ore, fuel, grain, fiber
    

**T1 (processed):**

-   metal, chemicals, rations, textiles
    

**T2 (strategic):**

-   ammo, medkits, parts, comms gear
    

**Supply Units (SU)**  
A derived “frontline consumable” that bundles several tiers:

-   SU = rations + fuel + parts (example recipe)
    

### Why SU is genius

-   It’s a universal war currency
    
-   Forces multi-commodity logistics
    
-   Creates constant market demand
    
-   Generates endless forecasting rabbit holes
    

----------

# 5) The economy (where the “market forecasting” meta comes from)

### Markets exist per zone

-   Different local prices based on:
    
    -   local supply/demand
        
    -   route disruption
        
    -   faction activity
        
    -   production capacity
        

### Players profit via:

-   arbitrage
    
-   contract hauling
    
-   producing SU during shortages
    
-   speculation before offensives
    

### Key: War moves prices

Every major offensive creates predictable shocks:

-   fuel spikes on key routes
    
-   SU spikes near contested zones
    
-   parts spike when sabotage increases losses
    

This is where player forecasting tools become “the game.”

----------

# 6) Logistics: shipments, convoys, and risk

### Shipment primitives

A “shipment” is a package of goods moving zone-to-zone.

**Modes:**

1.  **Courier (small, stealthy)**
    
    -   low capacity
        
    -   hard to intercept
        
2.  **Freight (medium)**
    
    -   balanced
        
3.  **Convoy (large)**
    
    -   highest capacity
        
    -   highest visibility
        
    -   requires escort for safety
        

### Interdiction

Enemy players can disrupt logistics by:

-   route ambush (chance-based with modifiers)
    
-   sabotage in contested zones
    
-   market manipulation (starve SU)
    
-   intel denial (hide movements)
    

### Escort mechanics (non-twitch, operator-friendly)

Escorting is about **preparedness** not reflex:

-   escort strength reduces interception probability
    
-   escort can “counter-ambush” on some routes
    
-   escort choice is a tradeoff between speed/capacity/safety
    

----------

# 7) Combat (keep it lightweight)

You want combat as a **logistics outcome modifier**, not the primary game.

Combat should be:

-   deterministic-ish
    
-   short resolution
    
-   based on matchup, readiness, intel advantage
    

Example:

-   an ambush triggers a resolution roll influenced by:
    
    -   attacker recon quality (fresh intel)
        
    -   defender escort power
        
    -   route chokepoint rating
        
    -   weather/event modifiers (optional)
        

Combat events become logs players analyze and optimize against.

----------

# 8) Intel: the second pillar of advantage

### Fog of war

Players don’t see the world, they infer it.

Intel is produced via:

-   `SCAN` actions
    
-   faction “watchtower” upgrades
    
-   trade volume signals (market telemetry)
    
-   event analysis (pattern recognition)
    

Intel decays with time.  
Good factions run “coverage schedules.”

### Intel outputs

-   route risk heatmaps
    
-   convoy sightings
    
-   supply burn estimates
    
-   enemy stockpile inference
    

Intel is the reason people build scouting scripts + reports.

----------

# 9) Factions: make them feel like operating companies

Factions should have:

-   **doctrine files**
    
-   **procurement targets**
    
-   **contracts**
    
-   **leadership roles**
    
-   **war room dashboards**
    

### Faction roles (emergent, not hard-coded)

-   Quartermaster: sets SU targets, handles procurement
    
-   Intel Chief: route surveillance + alerts
    
-   Logistics Lead: convoy schedules + escort plans
    
-   Market Operator: stabilizes prices, counter-manipulation
    
-   Raider Captain: disruption ops
    
-   Front Commander: chooses offensives/defensive holds
    

Each role is naturally supported by CLI + docs.

----------

# 10) The “contract system” (the MMO glue)

To make it massively multiplayer, you need public work.

### Contracts

Faction (or players) can post contracts:

-   Haul X goods from A → B by time T
    
-   Scout route R 3 times/day
    
-   Produce SU in zone Z until stockpile threshold
    
-   Escort convoy ID 1234
    

Contracts pay in:

-   credits
    
-   faction rep
    
-   access to upgrades/perks
    

Contracts are what create “infinite jobs” for thousands of players.

----------

# 11) Progression (no grind stats)

Progression should be:

-   reputation unlocks
    
-   capability unlocks
    
-   operational leverage
    
-   not raw power inflation
    

### Personal progression examples

-   higher cargo capacity licenses
    
-   access to better routes
    
-   ability to run “larger contracts”
    
-   reduced transaction fees in friendly markets
    
-   improved recon range/accuracy
    

### Faction progression examples

-   market depth upgrades
    
-   watchtowers (intel)
    
-   fortified routes
    
-   production efficiency
    

----------

# 12) Automation: allowed, competitive, bounded

You want players deploying crons and systems.  
So formalize it.

### Automation rules

-   Players can register an **Automation Profile**
    
    -   defines what actions it can submit
        
    -   enforces rate limits
        
    -   has daily quota caps
        

Example automation types:

-   market maker bot (places orders within bands)
    
-   scout scheduler (SCAN routes on interval)
    
-   stockpile maintainer (buy inputs, craft SU)
    
-   convoy dispatcher (small courier runs)
    

### Hard limits (so automation doesn’t ruin the game)

-   1 action per N seconds enforced server-side
    
-   daily act quota
    
-   high-impact actions require manual confirmation token:
    
    -   sabotage
        
    -   large convoy launch
        
    -   declaring offensive objective
        
    -   transferring faction treasury
        

This keeps “automation as advantage” without turning into a spam contest.

----------

# 13) The “Claude Code-native” experience layer (your differentiator)

Make the game intentionally produce artifacts players want to iterate on:

### Standard generated files

-   `ops/weekly_plan.md`
    
-   `intel/route_report_<date>.md`
    
-   `markets/forecast_<zone>.md`
    
-   `doctrine/convoy_rules.md`
    
-   `doctrine/raider_response.md`
    
-   `dashboards/price_alerts.json`
    

### In-game mechanic that rewards good documentation

Introduce “Doctrine Compliance” buffs:

-   factions can publish a doctrine version hash
    
-   members following doctrine thresholds get small efficiency bonuses
    
-   encourages real operational discipline
    

Not “roleplay,” but real measurable advantage.

----------

# 14) Win condition + seasons

### Season structure

-   6 weeks long
    
-   world resets (territory + markets)
    
-   player reputation persists lightly (prestige)
    
-   faction “legacy titles” persist
    

### Winning

Multiple scoring categories to avoid monoculture:

-   Territory-hours controlled (with supply compliance)
    
-   SU delivered to contested zones
    
-   Interdiction value destroyed
    
-   Market stabilization index (anti-volatility)
    
-   Intel dominance (coverage + accuracy)
    

This keeps multiple playstyles viable.

----------

---
## APPENDIX: Monetization

### Monetization goals

1.  **Let whales fund the game without buying power**
    
2.  **Let grinders earn premium by playing**
    
3.  **Make paid tiers feel like “more fun / more leverage / more tooling”** without ruining free players
    

This uses two pillars:

-   **(A) A tradeable in-game token** (PLEX/Bond-style)
    
-   **(B) 1–2 subscription tiers** that mainly unlock _ops tooling_, _automation capacity within caps_, and _history/analytics_
    

> Reference patterns: OSRS Bonds are tradable and redeemable for membership.  
> EVE supports buying/selling PLEX globally in a pooled market.

----------

# 1) Monetization Pillar A: The tradeable token (“CHARTER”)

### What CHARTER is

A **single item** that can be:

-   **bought for real money** from you
    
-   **sold in-game** on a unified market
    
-   **redeemed** for premium time and a small set of non-power services
    

**Key property:** it’s identical whether bought or earned.

### How grinders “earn it”

Grinders don’t mint CHARTER. They earn in-game currency/resources and **buy CHARTER from other players** on the market (who originally bought it with real money). This is exactly the PLEX/Bond dynamic.

### Redemption uses (keep it tight)

CHARTER can be redeemed for:

1.  **30 days Premium time**
    
2.  **30 days Premium+ time** _(optional if you do 2 paid tiers)_
    
3.  **Faction Ops Suite credit** _(ex: 7 days)_
    
4.  **Cosmetic / status unlocks** _(titles, insignias)_
    
5.  **Automation Slot** _(time-limited)_ — more on this below
    

### Critical rule

**Never let CHARTER buy combat outcomes.**  
No damage boosts, no raid immunity, no “win rolls.”

CHARTER buys _time and tooling_.

----------

# 2) Monetization Pillar B: Subscription tiers (“Ops License”)

You want subscriptions to feel like:

-   “I can play the _real_ meta”
    
-   “I can run a tighter operation”
    
-   “I can do deeper analysis”
    
-   “I can automate more safely”
    

Not:

-   “I beat you because I paid”
    

## Tier 0: Free

Free players must be _fully able to compete and matter_.  
They can:

-   join factions
    
-   run convoys
    
-   raid
    
-   trade
    
-   scout
    
-   hold territory
    
-   access contracts
    
-   earn enough to buy CHARTER in-game (eventually)
    

Free limitations should mainly be around **tooling depth**, not gameplay access:

-   shorter event history
    
-   fewer saved reports
    
-   fewer automation actions/day
    
-   fewer concurrent contracts
    

## Tier 1: Premium (serious player)

Premium is “operator mode.”

Unlocks that increase fun without breaking fairness:

-   **Extended event retention** (your own + your zone)
    
-   **More automation quota** (strictly rate-limited, capped daily)
    
-   **More concurrent contracts**
    
-   **More saved doctrines/templates**
    
-   **Better data export rate limits** (more frequent polling)
    
-   **Faction contribution dashboards** _(personal view)_
    

## Tier 2: Premium+ (power user / leader)

Premium+ is “war room mode.”

Unlocks:

-   **Even longer history + analytics windows**
    
-   **More automation slots** _(still bounded by action rate + daily quota)_
    
-   **Advanced planning objects** (convoy plans, procurement plans)
    
-   **Faction-level tooling access** _(if authorized by faction role)_
    
-   **More alerting hooks** (price shocks, route risk spikes)
    

Again: these improve execution quality, not raw power.

----------

# 3) How this integrates into the Logistics War gameplay

## The reason monetization fits this game

Your game’s “skill” is:

-   forecasting
    
-   coordination
    
-   supply chain discipline
    
-   intel coverage
    
-   operational rigor
    

So the paid value should be:

-   more history
    
-   more automation capacity
    
-   better planning primitives
    
-   better monitoring and reporting
    

That’s “more fun” for serious players **without making free players irrelevant**.

----------

# 4) Automation (paid advantage that stays fair)

Automation is the most addictive meta — and the easiest to ruin the game with.

### Base rule: server enforces fairness

-   **hard per-account action rate limit**
    
-   **hard daily act quota**
    
-   **cooldowns by action type**
    
-   **manual confirmation for high-impact actions**
    

### Automation Slots

Treat automation as “registered bots” that the server recognizes as bounded.

Example:

-   Free: **0 automation slots** (manual only) or 1 tiny slot
    
-   Premium: **1 automation slot**
    
-   Premium+: **3 automation slots**
    
-   CHARTER redemption: **+1 temporary automation slot (7 days)**
    

### Allowed automation types (safe)

-   scout scheduler (SCAN routes on interval)
    
-   market maker within strict bands
    
-   stockpile maintainer (keep SU above threshold)
    
-   courier dispatcher (small safe shipments)
    

### Disallowed automation types

-   spammy raid scanning + chain attacks
    
-   high-frequency trading loops
    
-   anything that can create “APM warfare”
    

This design makes automation a **strategy contest**, not a spam contest.

----------

# 5) “More fun” benefits that don’t break free players

Here are benefits that feel powerful but don’t invalidate free:

## A) History depth and analytics

-   Free: last 200 events
    
-   Premium: last 10,000 events
    
-   Premium+: last 100,000 events
    

This drives rabbit holes:

-   convoy loss models
    
-   interdiction pattern detection
    
-   supply burn forecasting
    

Free players still see what’s happening; paid players can _analyze better_.

## B) Planning primitives

Premium tiers unlock richer “ops objects”:

-   convoy plan objects (route, timing, escort doctrine)
    
-   procurement plans (SU targets by zone)
    
-   faction contract templates
    

These don’t give power; they give clarity.

## C) Reporting templates & storage

Premium unlocks more “first-class” report generation and saving:

-   route heatmaps (text summaries)
    
-   weekly operations review
    
-   market thesis docs
    
-   scouting brief templates
    

(Players already want to write these `.md` docs—paid just makes it easier to manage and reuse.)

## D) Convenience limits that affect throughput, not outcomes

-   concurrent market orders
    
-   concurrent contracts
    
-   saved loadouts/doctrines
    
-   notification hooks
    

----------

# 6) The token market design (important details)

To keep CHARTER liquid and healthy:

### A) Unified CHARTER market

No “dead zone pricing.” Keep it globally pooled (in the style of EVE’s move toward global PLEX liquidity).

### B) Strong sinks (demand drivers)

Beyond premium time, add 2–3 non-power sinks:

-   **Automation slot rental** (temporary)
    
-   **Faction Ops Suite credit** (time-limited)
    
-   **Cosmetic prestige** (titles / insignias)
    

Sinks prevent CHARTER from becoming “only for whales” or “only for endgame.”

### C) Soft price stability controls (optional)

Don’t over-engineer this early, but you can:

-   run periodic CHARTER sales (increase supply)
    
-   run token sinks during wars (increase demand)
    
-   avoid letting it become a speculative asset with no sinks
    

----------

# 7) Faction Ops Suite (optional, but high leverage)

Even if you don’t sell it separately at first, **design for it**:

Faction-level tooling that can be funded by:

-   a monthly fee
    
-   or **CHARTER redemption**
    
-   or pooled faction treasury
    

What it adds:

-   procurement dashboard
    
-   contract automation
    
-   faction audit logs
    
-   shared intel aggregation
    
-   doctrine versioning + compliance tracking
    

This is “SaaS for guild leadership,” and it fits the operator fantasy perfectly.

----------

# 8) Clear “no pay-to-win” rules (publish these)

To keep the game respected:

Paid systems **must never** provide:

-   better raid success odds
    
-   faster travel speed
    
-   more cargo per shipment (beyond small convenience caps)
    
-   direct combat buffs
    
-   immunity, stealth, or “no-loss” features
    

Paid systems **can** provide:

-   deeper history
    
-   more automation slots within strict quotas
    
-   planning tooling
    
-   reporting & dashboards
    
-   convenience limits (contracts/orders)
    
-   cosmetics/status
    

----------

# 9) MVP scope including monetization (ship this)

**Week 1 monetization MVP**

-   CHARTER purchasable
    
-   global CHARTER market
    
-   redeem for Premium (30 days)
    
-   Premium unlocks: history + 1 automation slot + more saved doctrines
    

**Week 3**

-   Premium+ tier
    
-   CHARTER redeem for Premium+
    
-   temporary automation slot redemption
    
-   basic faction tooling
    

That’s enough to create:

-   whale demand (buy CHARTER)
    
-   grinder path (earn in-game → buy CHARTER)
    
-   serious players paying to go deeper on meta
