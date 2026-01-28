# Route Risk Model Template

Evaluate shipping route safety before committing cargo.

## Usage

```
Analyze route risk for shipping from [origin] to [destination]:

1. Get routes using burnrate_routes
2. Gather intel on each leg using burnrate_intel_target for routes
3. Check zone controllers along the path
4. Calculate risk score and recommend shipment type
```

## Template

```markdown
# Route Risk Analysis: [ORIGIN] → [DESTINATION]
**Generated**: Tick [X]

## Route Overview
| Leg | From | To | Distance | Base Risk | Intel Age |
|-----|------|-----|----------|-----------|-----------|
| 1 | [Zone A] | [Zone B] | [X] | [X%] | [X ticks] |
| 2 | [Zone B] | [Zone C] | [X] | [X%] | [X ticks] |

**Total Distance**: [X] ticks
**Cumulative Base Risk**: [X%]

## Risk Factors

### Positive (Risk Reduction)
- [ ] Friendly territory throughout
- [ ] Recent intel (< 10 ticks)
- [ ] No known raider activity
- [ ] Escort available

### Negative (Risk Increase)
- [ ] Passes through contested zones
- [ ] Stale/expired intel
- [ ] Known raider positions
- [ ] Chokepoint route (high interdiction chance)
- [ ] High-value cargo (attracts attention)

## Risk Score

| Factor | Weight | Score |
|--------|--------|-------|
| Base route risk | 1.0x | [X] |
| Intel freshness | [modifier] | [X] |
| Territory control | [modifier] | [X] |
| Chokepoint rating | [modifier] | [X] |
| **Total** | | **[X]** |

## Recommendation

**Risk Level**: [LOW / MEDIUM / HIGH / EXTREME]

| Risk Level | Recommended Action |
|------------|-------------------|
| LOW | Courier shipment, no escort needed |
| MEDIUM | Freight with escort recommended |
| HIGH | Convoy only, escort required |
| EXTREME | Do not ship, wait for better intel or clear raiders |

## Alternative Routes
1. [Alternative path with risk comparison]
2. [Alternative path with risk comparison]
```

## Improvements to Consider

- Build historical risk database
- Track raider patrol patterns
- Factor in time-of-day/tick patterns
- Automate route comparison across all paths
