# BURNRATE Roadmap

Future features and enhancements under consideration.

---

## Gameplay Mechanics

### Front Efficiency
Supply mastery should translate to battlefield leverage. Well-supplied zones grant:
- **Defensive strength** - Harder to capture
- **Raid resistance** - Shipments through friendly territory are safer
- **Capture speed** - Low-supply zones fall faster

This creates second-order outcomes from logistics without adding a separate combat minigame.

### Medkits Combat Bonus
Currently medkits are tradeable but have no mechanical use. Options:
- Combat modifier when zones have medkit stockpiles
- Unit healing/repair between engagements
- Stacks with front efficiency bonuses

### Doctrines
Faction-owned strategy documents stored in-game:
- Shared markdown documents visible to faction members
- Version history and audit trail
- Templates for common doctrine types (logistics, defense, expansion)

---

## Onboarding

### Tutorial Contract Chain
A guided "golden path" that teaches the core loop in 15-20 minutes:
1. Extract raw resources at a Field
2. Travel to a Factory
3. Produce processed goods
4. Ship cargo to a destination
5. Supply a collapsing zone before it falls

Special tutorial contracts appear for new players with step-by-step guidance.

### Starter Templates
Seed the template ecosystem with basic examples:
- Scouting report template
- Route risk model
- Production calculator
- Supply chain planner

These are intentionally simple—meant to be copied and improved.

---

## Community & Templates

### Template Marketplace
Community-contributed tools and prompts:
- **Browse**: All players can see titles, authors, descriptions, ratings
- **Import**: Paid tiers get one-click import and auto-sync
- **Publish**: Paid tiers can publish and earn reputation
- **Featured**: Command tier gets featured placement

### Template Discovery
- New template notifications for subscribed categories
- "Most used this week" leaderboard
- Author reputation and follower counts
- Usage analytics for publishers

---

## Faction Tools (Paid Features)

### Basic (Operator)
- Faction analytics dashboard
- Member activity tracking
- Territory visualization

### Advanced (Command)
- Full audit logs (who did what, when)
- Scheduled reports (daily/weekly summaries)
- Role-based permissions beyond founder/officer/member
- Shared dashboards with custom widgets

### Coordination
Factions need to discuss strategy. Options:
- In-game faction chat (infrastructure heavy)
- Discord/Slack integration (webhooks for events)
- Shared document storage (doctrine system)

---

## Market Enhancements

### Conditional Orders (Operator)
- "Buy X if price drops below Y"
- "Sell X if I have more than Y in inventory"
- Stop-loss and take-profit orders

### Time-Weighted Orders (Command)
- Spread large orders over time to avoid market impact
- "Buy 1000 ore over the next 50 ticks"
- Iceberg orders (show small quantity, execute large)

### Market Analytics
- Price history charts
- Volume trends
- Arbitrage opportunity alerts
- Estimated order fill times

---

## Monetization (Future)

### P2P Currency Trading
Allow players to trade credits for real money:
- Player-to-player marketplace
- Platform takes transaction fee
- Requires payment processing infrastructure
- Regulatory considerations (money transmission)

**Status**: Future consideration, not v1 priority.

---

## Technical Debt

### Performance
- Tick processing optimization for large player counts
- Database indexing review
- Caching layer for frequently-read data

### Infrastructure
- Horizontal scaling for API servers
- Database replication/failover
- Monitoring and alerting

---

## Not Planned

Things we've considered and decided against:

- **Action limit pay-to-win**: Paid tiers shouldn't give dramatically more actions
- **Hiding template code**: Gate convenience (import/sync), not access
- **Separate combat minigame**: Front efficiency provides battlefield outcomes through logistics

---

*Last updated: January 2026*
