# Production Calculator Template

Plan resource conversion chains from raw materials to final products.

## Usage

```
Calculate production requirements for [target output]:

1. Get my inventory using burnrate_status
2. Work backwards from target to raw materials
3. Identify what I have vs what I need
4. Generate extraction and production plan
```

## Recipe Reference

### T0 → T1 (Raw → Processed)
| Output | Inputs |
|--------|--------|
| metal | 2 ore + 1 fuel |
| chemicals | 1 ore + 2 fuel |
| rations | 3 grain + 1 fuel |
| textiles | 2 fiber + 1 chemicals |

### T1 → T2 (Processed → Strategic)
| Output | Inputs |
|--------|--------|
| ammo | 1 metal + 1 chemicals |
| medkits | 1 chemicals + 1 textiles |
| parts | 1 metal + 1 textiles |
| comms | 1 metal + 1 chemicals + 1 parts |

### Special
| Output | Inputs |
|--------|--------|
| 1 SU | 2 rations + 1 fuel + 1 parts + 1 ammo |
| escort | 2 metal + 1 parts + 1 rations |
| raider | 2 metal + 2 parts + 1 comms |

## Template

```markdown
# Production Plan: [TARGET OUTPUT] x [QUANTITY]
**Generated**: Tick [X]

## Target
- **Output**: [X] [product]
- **Purpose**: [why you need this]

## Bill of Materials

### Final Assembly
| Input | Qty Needed | In Inventory | Shortfall |
|-------|------------|--------------|-----------|
| [resource] | [X] | [X] | [X] |

### Intermediate Products (must produce)
| Product | Qty Needed | Inputs Required |
|---------|------------|-----------------|
| [resource] | [X] | [breakdown] |

### Raw Materials (must extract)
| Resource | Qty Needed | In Inventory | Must Extract | Credits Cost |
|----------|------------|--------------|--------------|--------------|
| ore | [X] | [X] | [X] | [X × 5] |
| fuel | [X] | [X] | [X] | [X × 5] |
| grain | [X] | [X] | [X] | [X × 5] |
| fiber | [X] | [X] | [X] | [X × 5] |

**Total Extraction Cost**: [X] credits

## Production Sequence

Execute in this order:

1. **Extract** at Field: [X] ore, [X] fuel, [X] grain, [X] fiber
2. **Produce** at Factory: [X] [T1 product]
3. **Produce** at Factory: [X] [T1 product]
4. **Produce** at Factory: [X] [T2 product]
5. **Final**: [X] [target output]

## Location Plan
- Current location: [zone]
- Nearest Field: [zone] ([X] hops)
- Nearest Factory: [zone] ([X] hops)
- Optimal sequence: [travel plan]
```

## Improvements to Consider

- Factor in travel time between zones
- Compare buy vs. produce economics
- Track production history for patterns
- Batch planning for multiple outputs
- Factory capacity/congestion modeling
