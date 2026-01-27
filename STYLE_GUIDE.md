# BURNRATE: Brand & Style Guide

---

## The Name

### BURNRATE

The game is called **BURNRATE**.

- Typed as: `burnrate` (CLI commands, casual reference)
- Styled as: `BURNRATE` (headers, logos, emphasis)
- Never: "Burn Rate" (two words), "BurnRate" (camelCase), "burn-rate" (hyphenated)

### Why BURNRATE

1. **Core Mechanic**: The game's central rule is that controlled zones *burn* supply. The name is the game.

2. **Developer Resonance**: "Burn rate" is startup vocabulary—how fast you spend runway. Devs already associate it with strategic resource management and survival.

3. **Tone**: Aggressive but not juvenile. Implies attrition, strategy, consequence. No fantasy nonsense, no try-hard military jargon.

4. **CLI-Native**: Lowercase `burnrate` looks like a command. It belongs in a terminal.

---

## Tagline

**Primary:**
> The front doesn't feed itself.

**Alternates:**
> Supply the front. Hold the line.
> Every tick counts.
> Your supply chain is your strategy.
> Logistics wins wars.

**Never use:**
- Anything with "epic" or "awesome"
- Gaming clichés ("Are you ready?", "Join the battle")
- Exclamation points in taglines

---

## Brand Voice

### Principles

**1. Understated Confidence**
We don't hype. We state facts. The game is good; we don't need to convince anyone.

```
✗ "BURNRATE is an INCREDIBLE new game that will BLOW YOUR MIND!"
✓ "BURNRATE is a logistics war game played through Claude Code."
```

**2. Technical Precision**
Use correct terminology. Respect the audience's intelligence. They know what a supply chain is.

```
✗ "Move your stuff from place to place!"
✓ "Route cargo through contested zones."
```

**3. Dry Wit**
Humor is allowed but never forced. One-liners, not jokes. Deadpan, not wacky.

```
✓ "Combat is resolved in one calculation. We respect your time."
✓ "The best generals still lose if they can't feed the front."
✓ "Your convoy was intercepted. Perhaps next time, check the intel."
```

**4. "We Know You're Smart"**
Never explain things that don't need explaining. Trust the reader.

```
✗ "A 'tick' is a unit of time in the game, kind of like a turn!"
✓ "The game runs on ticks. 1 tick = 10 minutes."
```

### Tone by Context

| Context | Tone |
|---------|------|
| Documentation | Clear, technical, minimal |
| Marketing | Confident, intriguing, concise |
| In-game messages | Informative, occasionally dry humor |
| Error messages | Direct, helpful, never condescending |
| Community | Respectful, engaged, never corporate |

---

## Audience

### Who We're Talking To

**Vibe Coders**: Developers who work with AI assistants as a natural part of their flow. They're building things with Claude, shipping code, and want something interesting in their terminal between tasks.

They value:
- Competence (theirs and the game's)
- Cleverness without showing off
- Clean design that respects their attention
- Things that feel "insider" but not exclusionary
- Depth they can explore, not tutorials they must endure

They despise:
- Hype and hyperbole
- Hand-holding and condescension
- Visual clutter
- Anything that feels like it's wasting their time
- Corporate-speak

### The Three Appeals

**1. Terminal Companion**
"Something interesting to do while I stare at my terminal all day."
The game fits into existing workflow. Check supply lines between deploys. Run a convoy during CI. Strategy in the margins.

**2. Claude Mastery**
"Learning to make Claude powerful in-game teaches me to make Claude powerful everywhere."
The metagame is prompt engineering, automation, and AI collaboration. Skills transfer directly to real work.

**3. Status & Connection**
"A way to connect with and impress other Claude users."
Faction leadership, legendary operations, and shared strategies create community and reputation.

---

## Naming Conventions

### Core Terminology

| Concept | Name | Notes |
|---------|------|-------|
| Game time unit | **tick** | 1 tick = 10 minutes. Always lowercase. |
| Universal war resource | **Supply Units (SU)** | Can abbreviate to "SU" after first use |
| Premium token | **CHARTER** | Always caps. Tradeable, redeemable. |
| Competitive period | **Season** | "Season 1", "Season 2", etc. |
| Player organization | **Faction** | Not guild, clan, or corp. |
| AI assistant actions | **Agent** | Your automated routines are "agents" |

### Zone Types

| Type | Name | Description |
|------|------|-------------|
| Safe starting areas | **Hub** | Deep markets, spawn points, protected routes |
| Production centers | **Factory** | Converts raw → processed → strategic goods |
| Resource extraction | **Field** | Produces T0 raw materials |
| Route crossings | **Junction** | Low intrinsic value, high route importance |
| Active warfare zones | **Front** | High value, high risk, requires supply |
| Victory points | **Stronghold** | Determines regional control |

### Resource Tiers

**T0 (Raw)**
- `ore` - metallic extraction
- `fuel` - energy source
- `grain` - agricultural base
- `fiber` - material base

**T1 (Processed)**
- `metal` - structural material
- `chemicals` - industrial compounds
- `rations` - consumable supplies
- `textiles` - manufactured materials

**T2 (Strategic)**
- `ammo` - offensive supplies
- `medkits` - personnel recovery
- `parts` - equipment maintenance
- `comms` - coordination equipment

**Universal**
- `SU` - Supply Units (the war currency)

### Shipment Types

| Type | Capacity | Character |
|------|----------|-----------|
| **Courier** | Small | Fast, stealthy, slips through |
| **Freight** | Medium | Balanced, workhorse |
| **Convoy** | Large | Slow, visible, needs escort |

### Subscription Tiers

| Tier | Name | Identity |
|------|------|----------|
| Free | **Freelance** | Independent operator, scrappy |
| Paid | **Operator** | Professional, serious player |
| Premium | **Command** | Leadership-level, full toolkit |

### Automation

- **Agent**: An automation routine you deploy
- **Agent Slot**: Capacity to run concurrent agents
- Actions agents can perform: `scout`, `trade`, `stockpile`, `dispatch`

### Intel System

| Term | Meaning |
|------|---------|
| **SCAN** | Active intel gathering action |
| **Signal** | Intel coverage quality (0-100%) |
| **Relay** | Intel infrastructure upgrade |
| **Stale** | Intel that's aging out |
| **Dark** | No intel coverage |

### Combat

| Term | Meaning |
|------|---------|
| **Intercept** | Attack on a shipment |
| **Raid** | Attack on a zone |
| **Escort** | Defensive units protecting cargo |
| **Garrison** | Zone defense strength |

### Faction Roles (Suggested, Not Enforced)

- **Commander** - Strategic direction
- **Quartermaster** - Supply management
- **Intel Chief** - Reconnaissance
- **Logistics Lead** - Convoy operations
- **Market Op** - Trading and stabilization
- **Raider Captain** - Interdiction

### Contract Types

- **Haul** - Move cargo A→B
- **Produce** - Manufacture goods at location
- **Scout** - Maintain intel coverage
- **Escort** - Protect a convoy

---

## Visual Language

### Principles

1. **Terminal-Native**: Everything looks like it belongs in a monospace terminal
2. **Information-Dense**: Maximize signal, minimize chrome
3. **Color as Meaning**: Color indicates status, not decoration
4. **Unicode Over ASCII**: Clean box-drawing, not ASCII art
5. **No Emoji**: Too casual. Unicode symbols only.

### Color Semantics

| Color | Meaning | Use |
|-------|---------|-----|
| **Green** | Good / Safe / Supplied | Positive states |
| **Yellow** | Warning / Strained / Moderate | Attention needed |
| **Red** | Critical / Danger / Failed | Urgent action |
| **Cyan** | Info / Neutral / Navigation | System messages |
| **White** | Default text | Content |
| **Dim/Gray** | Secondary / Stale | Less important |

### Box Drawing

Use Unicode box-drawing for structure:
```
╔═══════════════════════════════════════╗
║  SECTION HEADER                       ║
╠═══════════════════════════════════════╣
║  Content here                         ║
╚═══════════════════════════════════════╝
```

Light boxes for subsections:
```
┌───────────────────────────────────────┐
│  Subsection                           │
└───────────────────────────────────────┘
```

### Status Indicators

```
Supply status bars:
████████████████████ 100%  SUPPLIED
████████████░░░░░░░░  62%  STRAINED
████░░░░░░░░░░░░░░░░  23%  CRITICAL
░░░░░░░░░░░░░░░░░░░░   0%  COLLAPSED

Risk visualization:
░ <10%  (safe)
▒ 10-30% (moderate)
▓ 30-50% (dangerous)
█ >50%  (avoid)

Trend arrows:
↑ increasing    ↓ decreasing
↑↑ spiking     ↓↓ crashing
→ stable
```

### Symbols

| Symbol | Meaning |
|--------|---------|
| `◆` | Your assets |
| `◇` | Allied assets |
| `●` | Occupied/Controlled |
| `○` | Neutral/Available |
| `⚠` | Warning/Alert |
| `✓` | Success/Complete |
| `✗` | Failed/Blocked |
| `→` | Route/Flow direction |
| `│` `─` | Connections |

### Example Screens

**Main View:**
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

**Route Intel:**
```
┌─ ROUTE INTEL ─────────────────────────────────────────────────┐
│ Signal: 87% (fresh)  │  Last scan: 3 ticks ago               │
├───────────────────────────────────────────────────────────────┤
│ Hub.Central → Factory.North                                   │
│ Distance: 2 ticks  │  Capacity: HIGH  │  Risk: ░░░░░░░░░░ 5% │
├───────────────────────────────────────────────────────────────┤
│ Hub.Central → Junction.4                                      │
│ Distance: 3 ticks  │  Capacity: MED   │  Risk: ▒▒▒░░░░░░░ 18%│
├───────────────────────────────────────────────────────────────┤
│ Junction.4 → Front.Kessel                                     │
│ Distance: 4 ticks  │  Capacity: LOW   │  Risk: ▓▓▓▓▓▓▒▒░░ 52%│
│ ⚠ Chokepoint: +40% intercept modifier                        │
│ ⚠ Recent activity: 3 intercepts in last 50 ticks             │
└───────────────────────────────────────────────────────────────┘
```

**Price Sparkline:**
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

## CLI Interface

### Command Style

Commands should feel like natural CLI tools:

```bash
# View commands
burnrate view                    # Main dashboard
burnrate view zone Front.Kessel  # Specific zone
burnrate view routes             # Route intel
burnrate view market fuel        # Market data

# Action commands
burnrate ship --from Hub.Central --to Front.Kessel --cargo "rations:50,fuel:20"
burnrate scan Junction.4
burnrate trade buy fuel 100 --limit 45

# Query commands
burnrate status                  # Your status
burnrate events                  # Recent events
burnrate contracts               # Available work
```

### Response Style

Responses should be:
- Immediate confirmation of action
- Relevant context
- Next suggested action (when helpful)

```
> burnrate ship --from Hub.Central --to Front.Kessel --cargo "rations:50"

Shipment #1,247 created
├─ Type: Freight
├─ Route: Hub.Central → Junction.4 → Front.Kessel
├─ ETA: 7 ticks (1h 10m)
├─ Risk: 34% aggregate
└─ Status: In transit

⚠ No escort assigned. Consider: burnrate escort #1,247
```

### Error Messages

Errors should be:
- Clear about what went wrong
- Suggest how to fix it
- Never condescending

```
✗ Cannot create shipment: insufficient cargo at Hub.Central
  You have: rations 32
  Required: rations 50

  Try: burnrate view market rations --zone Hub.Central
```

---

## Marketing Copy

### One-Liner
> BURNRATE is a logistics war game played through Claude Code. The front doesn't feed itself.

### Elevator Pitch (30 seconds)
> BURNRATE is a persistent territory war where supply chains decide everything. Hold zones by feeding them—every tick, they burn Supply Units. When the supply stops, the zone falls.
>
> Play through Claude Code. Your terminal is your war room. The players who learn to work WITH Claude—analyzing intel, drafting doctrine, building automation—win.

### README Description
```markdown
# BURNRATE

A logistics war MMO for Claude Code.

Hold territory by keeping it supplied. Every zone burns Supply Units each tick.
When the supply stops, the zone falls. The best generals still lose if they
can't feed the front.

- **CLI-native**: Your terminal is your war room
- **AI-collaborative**: Claude is your operations advisor
- **Operator advantage**: No grinding, no twitch—just better systems

The front doesn't feed itself.
```

### For Different Contexts

**For Claude Code users:**
> What if using Claude well was the actual game? BURNRATE is a logistics MMO where your prompts, automation scripts, and analytical workflows determine victory. The metagame is making Claude your best quartermaster.

**For strategy gamers:**
> EVE Online's supply chains as the entire game. Hold territory by keeping it fed. Win through forecast models and logistics discipline. Combat resolves in one calculation—we respect your time.

**For terminal enthusiasts:**
> An MMO that lives in your terminal. Check supply lines between deploys. Run convoys during CI builds. Build forecasting scripts that actually matter. BURNRATE turns terminal downtime into strategy time.

---

## Documentation Style

### Structure

1. **Start with what it does**, not what it is
2. **Show, then explain**
3. **One concept per section**
4. **Code examples over prose**

### Example

```markdown
## Shipping Cargo

Move goods between zones with shipments.

### Quick Start

    burnrate ship --from Hub.Central --to Front.Kessel --cargo "rations:50"

### Shipment Types

| Type | Capacity | Speed | Visibility |
|------|----------|-------|------------|
| Courier | 10 units | +50% | Low |
| Freight | 50 units | Normal | Medium |
| Convoy | 200 units | -25% | High |

Specify type with `--type`:

    burnrate ship --type convoy --from Hub.Central --to Front.Kessel --cargo "SU:150"

Convoys are visible. Consider an escort.
```

---

## Don'ts

### Never Say
- "Epic" / "Awesome" / "Amazing"
- "Revolutionary" / "Game-changing"
- "Simple yet powerful"
- "Best-in-class"
- Any gaming clichés
- "Welcome to [X]!" as an opener
- "Let's go!" / "Let's dive in!"

### Never Do
- Use emoji in interface or docs
- Add unnecessary animation or flourish
- Explain concepts that don't need explaining
- Use multiple exclamation points
- Center text (left-align everything)
- Use light theme examples (assume dark terminal)

### Never Design
- Loading spinners without purpose
- Confirmation dialogs for low-stakes actions
- "Are you sure?" for reversible actions
- Tutorials that block gameplay
- Achievement popups that interrupt flow

---

## File Naming

### Player-Facing Files

Doctrine and ops files that players create:
```
/doctrine/convoy_rules.md
/doctrine/raider_response.md
/intel/route_report_2025-01-26.md
/ops/weekly_plan.md
/markets/fuel_forecast.md
/agents/stockpile_keeper.json
```

### System Files

Game-generated files:
```
/burnrate/events.log
/burnrate/state.json
/burnrate/cache/
```

---

## Summary

BURNRATE is confident, technical, and understated. It respects the player's intelligence and time. Every word should feel intentional. Every interface element should earn its pixels.

The brand is the game: no waste, no fluff, pure signal.

The front doesn't feed itself. Neither does good design.
