# Scouting Report Template

Generate a structured intel report for a zone or route.

## Usage

```
Use this scouting report template for [zone/route name]:

1. Gather intel using burnrate_intel_target
2. Get zone details using burnrate_view
3. Check routes using burnrate_routes

Then format as a scouting report.
```

## Template

```markdown
# Scouting Report: [TARGET NAME]
**Generated**: Tick [X] | **Intel Age**: [X] ticks | **Freshness**: [fresh/stale/expired]

## Summary
[One sentence assessment: safe/caution/dangerous]

## Zone Status
- **Type**: [hub/field/factory/junction/front/stronghold]
- **Controller**: [faction name or "Neutral"]
- **Supply Level**: [X] SU
- **Burn Rate**: [X] SU/tick
- **Ticks Until Collapse**: [X or "Stable"]

## Threat Assessment
| Threat | Level | Details |
|--------|-------|---------|
| Raiders | [none/low/medium/high] | [count if known] |
| Hostile Factions | [none/low/medium/high] | [names if known] |
| Route Interdiction | [none/low/medium/high] | [affected routes] |

## Opportunities
- [ ] [Opportunity 1]
- [ ] [Opportunity 2]

## Recommendations
1. [Action 1]
2. [Action 2]

## Intel Gaps
- [What we don't know and should scan for]
```

## Improvements to Consider

- Track intel over time to spot trends
- Cross-reference with faction intel
- Add economic data (market prices, production capacity)
- Automate freshness warnings
