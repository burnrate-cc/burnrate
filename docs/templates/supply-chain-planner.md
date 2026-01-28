# Supply Chain Planner Template

End-to-end logistics planning from extraction to delivery.

## Usage

```
Plan a supply chain to deliver [cargo] to [destination]:

1. Identify what I need to deliver
2. Trace back to raw materials
3. Map extraction → production → shipping
4. Calculate total cost, time, and risk
5. Generate execution checklist
```

## Template

```markdown
# Supply Chain Plan: [DESCRIPTION]
**Generated**: Tick [X] | **Target Completion**: Tick [X]

## Objective
- **Deliver**: [X] [resource/SU] to [destination zone]
- **Purpose**: [contract fulfillment / zone supply / trade]
- **Deadline**: Tick [X] ([X] ticks remaining)

## Current State
| Resource | Have | Need | Gap |
|----------|------|------|-----|
| [resource] | [X] | [X] | [X] |
| credits | [X] | [X] | [X] |

## Phase 1: Procurement

### Option A: Extract & Produce
| Step | Location | Action | Output | Ticks |
|------|----------|--------|--------|-------|
| 1 | [Field] | Extract | [X] raw | [X] |
| 2 | [Factory] | Produce | [X] T1 | [X] |
| 3 | [Factory] | Produce | [X] T2 | [X] |

**Subtotal**: [X] ticks, [X] credits

### Option B: Buy from Market
| Resource | Qty | Est. Price | Total | Location |
|----------|-----|------------|-------|----------|
| [resource] | [X] | [X]/unit | [X] | [zone] |

**Subtotal**: [X] credits (but saves [X] ticks)

**Recommendation**: [Option A/B because...]

## Phase 2: Transport

### Route Analysis
| Route | Distance | Risk | Shipment Type | Escort? |
|-------|----------|------|---------------|---------|
| [path 1] | [X] ticks | [X%] | [type] | [Y/N] |
| [path 2] | [X] ticks | [X%] | [type] | [Y/N] |

**Selected Route**: [path] because [reason]

### Shipping Cost
- License required: [courier/freight/convoy]
- Escort unit: [if needed]
- Total transit time: [X] ticks

## Phase 3: Delivery
- [ ] Arrive at [destination]
- [ ] Unload cargo / Deposit SU / Complete contract

## Total Plan

| Metric | Value |
|--------|-------|
| Total ticks | [X] |
| Total credits | [X] |
| Risk level | [low/medium/high] |
| Deadline buffer | [X] ticks |

## Execution Checklist

### Tick [X]: Start
- [ ] Verify inventory
- [ ] Check route intel freshness
- [ ] Confirm no blockers

### Tick [X]: Procurement
- [ ] Travel to [Field/Factory/Market]
- [ ] [Extract/Produce/Buy] resources

### Tick [X]: Ship
- [ ] Load cargo
- [ ] Assign escort (if needed)
- [ ] Launch shipment via [route]

### Tick [X]: Complete
- [ ] Verify delivery
- [ ] Collect payment (if contract)
- [ ] Update records

## Contingencies
- **If shipment intercepted**: [backup plan]
- **If deadline at risk**: [acceleration options]
- **If market prices spike**: [alternative procurement]
```

## Improvements to Consider

- Multi-shipment batching
- Parallel procurement paths
- Dynamic re-routing based on intel updates
- Integration with contract discovery (find contracts along your route)
- Faction coordination for large operations
