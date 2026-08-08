import { describe, expect, it } from 'vitest'
import { FALLBACK_BIN_STEPS, REFERENCE_BIN_ID } from '../../config/thresholds'
import {
  binIdFromPrice,
  binIdsForPlan,
  binsForWidth,
  depositSplit,
  edgeProximity,
  isInRange,
  planAsymmetric,
  planRange,
  priceFromBinId,
  rangeState,
  widthFromBins,
} from './bins'

describe('price and bin id are exact inverses', () => {
  it('is 1.0 at the reference bin, for every bin step', () => {
    for (const step of FALLBACK_BIN_STEPS) {
      expect(priceFromBinId(REFERENCE_BIN_ID, step)).toBe(1)
    }
  })

  it('moves up by exactly the bin step per bin', () => {
    // A 25bps bin is 0.25% of price. If this drifts, every range in the
    // product is silently the wrong width.
    expect(priceFromBinId(REFERENCE_BIN_ID + 1, 25)).toBeCloseTo(1.0025, 10)
    expect(priceFromBinId(REFERENCE_BIN_ID + 1, 100)).toBeCloseTo(1.01, 10)
    expect(priceFromBinId(REFERENCE_BIN_ID - 1, 25)).toBeCloseTo(1 / 1.0025, 10)
  })

  it('round trips through binIdFromPrice', () => {
    for (const step of FALLBACK_BIN_STEPS) {
      for (const offset of [-500, -37, 0, 1, 42, 900]) {
        const id = REFERENCE_BIN_ID + offset
        expect(binIdFromPrice(priceFromBinId(id, step), step)).toBeCloseTo(
          id,
          6,
        )
      }
    }
  })

  it('rejects a non-positive price rather than returning NaN', () => {
    // NaN here would propagate into a bin id and then into a transaction.
    expect(() => binIdFromPrice(0, 25)).toThrow(RangeError)
    expect(() => binIdFromPrice(-1, 25)).toThrow(RangeError)
  })

  it('compounds, it does not multiply', () => {
    // The classic error: treating 100 bins at 25bps as 25% rather than 28.4%.
    const compounded = priceFromBinId(REFERENCE_BIN_ID + 100, 25)
    expect(compounded).toBeCloseTo(Math.pow(1.0025, 100), 10)
    expect(compounded).toBeGreaterThan(1.25)
  })
})

describe('bins needed for a width', () => {
  it('needs more bins at a finer step', () => {
    expect(binsForWidth(10, 1)).toBeGreaterThan(binsForWidth(10, 25))
    expect(binsForWidth(10, 25)).toBeGreaterThan(binsForWidth(10, 100))
  })

  it('is always odd, because the active bin is in the middle', () => {
    for (const step of FALLBACK_BIN_STEPS) {
      for (const width of [1, 5, 10, 20, 50]) {
        expect(binsForWidth(width, step) % 2, `${width}% at ${step}bps`).toBe(1)
      }
    }
  })

  it('confirms the number from CLAUDE.md rule 4', () => {
    // "A 25bps step across +/-20% is roughly 160 bins." That claim is why the
    // control is coupled, so it is worth pinning.
    const bins = binsForWidth(20, 25)
    expect(bins).toBeGreaterThan(140)
    expect(bins).toBeLessThan(160)
  })
})

describe('planRange, the coupled control', () => {
  it('picks the finest step that fits the transaction cap', () => {
    // Finest is right: a smaller bin concentrates liquidity, which is the
    // entire reason to use Liquidity Book rather than a constant product pool.
    const plan = planRange(2, FALLBACK_BIN_STEPS)
    expect(plan.totalBins).toBeLessThanOrEqual(50)
    expect(plan.clamped).toBe(false)

    const finer = FALLBACK_BIN_STEPS.filter((s) => s < plan.binStep)
    for (const step of finer) {
      expect(
        binsForWidth(2, step),
        `${step} should not have fit`,
      ).toBeGreaterThan(50)
    }
  })

  it('never returns more bins than one transaction can carry', () => {
    for (const width of [0.5, 1, 2, 5, 10, 20, 50, 200]) {
      const plan = planRange(width, FALLBACK_BIN_STEPS)
      expect(plan.totalBins, `${width}%`).toBeLessThanOrEqual(50)
    }
  })

  it('clamps rather than reverting when nothing fits', () => {
    // A UI that lets a user ask for something that reverts is a UI that
    // produces a failed transaction on stage.
    const plan = planRange(500, FALLBACK_BIN_STEPS)
    expect(plan.clamped).toBe(true)
    expect(plan.achievedWidthPct).toBeLessThan(500)
    expect(plan.binStep).toBe(Math.max(...FALLBACK_BIN_STEPS))
  })

  it('reports the width actually achieved, not the one requested', () => {
    const plan = planRange(2, FALLBACK_BIN_STEPS)
    expect(plan.achievedWidthPct).toBeCloseTo(
      widthFromBins(plan.binsBelow, plan.binStep),
      10,
    )
    expect(plan.achievedWidthPct).toBeGreaterThanOrEqual(2)
  })

  it('works with a reduced preset list, for our own deployment', () => {
    // SMART-CONTRACTS.md 12.3 item 3: on a factory we deploy, only the presets
    // we registered exist. This must not assume 25 is present.
    const plan = planRange(5, [100])
    expect(plan.binStep).toBe(100)
    expect(plan.totalBins).toBeLessThanOrEqual(50)
  })

  it('throws on an empty preset list rather than guessing one', () => {
    expect(() => planRange(5, [])).toThrow(RangeError)
  })

  it('rejects a non-positive width', () => {
    expect(() => planRange(0, FALLBACK_BIN_STEPS)).toThrow(RangeError)
    expect(() => planRange(-5, FALLBACK_BIN_STEPS)).toThrow(RangeError)
  })

  it('is symmetric around the active bin', () => {
    const plan = planRange(3, FALLBACK_BIN_STEPS)
    expect(plan.binsBelow).toBe(plan.binsAbove)
  })
})

describe('deltaIds are relative to the active bin at execution time', () => {
  it('centres on whatever active bin it is given', () => {
    // PRD.md 8.4.5: the zap-in swap moves the price, so the active id must be
    // re-read after the swap. Using the pre-swap id places liquidity in the
    // wrong bins, silently, and the position looks fine until it does not earn.
    const plan = planRange(2, FALLBACK_BIN_STEPS)

    const before = binIdsForPlan(plan, 8_388_600)
    const after = binIdsForPlan(plan, 8_388_640)

    expect(after.lowerBinId - before.lowerBinId).toBe(40)
    expect(after.upperBinId - before.upperBinId).toBe(40)
    // The deltas themselves never change. Only the anchor does.
    expect(after.deltaIds).toEqual(before.deltaIds)
  })

  it('produces one delta per bin, centred on zero', () => {
    const plan = planRange(2, FALLBACK_BIN_STEPS)
    const { deltaIds } = binIdsForPlan(plan, REFERENCE_BIN_ID)

    expect(deltaIds).toHaveLength(plan.totalBins)
    expect(deltaIds).toContain(0)
    expect(Math.min(...deltaIds)).toBe(-plan.binsBelow)
    expect(Math.max(...deltaIds)).toBe(plan.binsAbove)
  })
})

describe('in range', () => {
  it('includes both edges', () => {
    // Off by one here is the difference between earning and not earning at the
    // exact moment the demo is about.
    expect(isInRange(100, 100, 120)).toBe(true)
    expect(isInRange(120, 100, 120)).toBe(true)
    expect(isInRange(99, 100, 120)).toBe(false)
    expect(isInRange(121, 100, 120)).toBe(false)
  })
})

describe('edgeProximity drives the entire live screen', () => {
  it('is 1.0 dead centre', () => {
    expect(edgeProximity(110, 100, 120)).toBe(1)
  })

  it('is 0 at either edge', () => {
    expect(edgeProximity(100, 100, 120)).toBe(0)
    expect(edgeProximity(120, 100, 120)).toBe(0)
  })

  it('is 0 when out of range, never negative', () => {
    expect(edgeProximity(80, 100, 120)).toBe(0)
    expect(edgeProximity(200, 100, 120)).toBe(0)
  })

  it('falls monotonically from the centre outward', () => {
    let previous = Infinity
    for (let id = 110; id <= 120; id += 1) {
      const p = edgeProximity(id, 100, 120)
      expect(p).toBeLessThanOrEqual(previous)
      previous = p
    }
  })

  it('never exceeds 1 on a degenerate single-bin range', () => {
    expect(edgeProximity(100, 100, 100)).toBe(0)
  })
})

describe('rangeState', () => {
  it('maps the ERD thresholds exactly', () => {
    expect(rangeState(110, 100, 120)).toBe('calm')
    expect(rangeState(80, 100, 120)).toBe('out')
  })

  it('enters NAD-SENSE between 0.15 and 0.4', () => {
    const lower = 0
    const upper = 100
    // proximity = nearest / 50
    expect(rangeState(15, lower, upper)).toBe('nad-sense') // 0.30
    expect(rangeState(21, lower, upper)).toBe('calm') // 0.42
    expect(rangeState(7, lower, upper)).toBe('critical') // 0.14
  })

  it('covers every proximity with exactly one state', () => {
    for (let id = 0; id <= 100; id += 1) {
      expect(['calm', 'nad-sense', 'critical']).toContain(
        rangeState(id, 0, 100),
      )
    }
  })
})

describe('deposit split, the gate before confirm', () => {
  it('is roughly half and half for a symmetric range', () => {
    // Bins below the active bin hold only the quote token and bins above hold
    // only the base token, so a range is never funded with one asset.
    const plan = planRange(2, FALLBACK_BIN_STEPS)
    const split = depositSplit(plan)
    expect(split.baseFraction).toBeCloseTo(0.5, 1)
    expect(split.baseFraction + split.quoteFraction).toBeCloseTo(1, 10)
  })

  it('never returns a fraction outside 0 to 1', () => {
    for (const width of [0.5, 2, 10, 50, 500]) {
      const split = depositSplit(planRange(width, FALLBACK_BIN_STEPS))
      expect(split.baseFraction).toBeGreaterThan(0)
      expect(split.baseFraction).toBeLessThan(1)
      expect(split.quoteFraction).toBeGreaterThan(0)
      expect(split.quoteFraction).toBeLessThan(1)
    }
  })
})

describe('the manual range, where the two edges are set apart', () => {
  it('reaches each edge the player asked for, at the finest step that fits', () => {
    const plan = planAsymmetric(-5, 10, FALLBACK_BIN_STEPS)
    expect(plan.clamped).toBe(false)
    // Each side must at least COVER what was asked for, never fall short of
    // it: a range that stops before the price the screen printed is the one
    // failure a player would discover with real money.
    expect(widthFromBins(plan.binsBelow, plan.binStep)).toBeGreaterThanOrEqual(
      5,
    )
    expect(widthFromBins(plan.binsAbove, plan.binStep)).toBeGreaterThanOrEqual(
      10,
    )
  })

  it('keeps the shape the player drew, not just the size', () => {
    const plan = planAsymmetric(-2, 20, FALLBACK_BIN_STEPS)
    expect(plan.binsAbove).toBeGreaterThan(plan.binsBelow)
  })

  it('still fits one transaction when the span is absurd, and says it clamped', () => {
    const plan = planAsymmetric(-90, 400, FALLBACK_BIN_STEPS)
    expect(plan.clamped).toBe(true)
    expect(plan.totalBins).toBeLessThanOrEqual(50)
    // Both sides survive a clamp. A range that collapses to one side is a
    // resting limit order, which is a different position than the one the
    // player was drawing.
    expect(plan.binsBelow).toBeGreaterThan(0)
    expect(plan.binsAbove).toBeGreaterThan(0)
  })

  it('refuses a range that does not straddle the current price', () => {
    expect(() => planAsymmetric(5, 10, FALLBACK_BIN_STEPS)).toThrow(RangeError)
    expect(() => planAsymmetric(-5, -1, FALLBACK_BIN_STEPS)).toThrow(RangeError)
  })

  it('splits the deposit unevenly when the range is uneven', () => {
    // The whole reason S6 shows a split: a range skewed above spot is mostly
    // the token the player does not hold yet. PRD.md 8.4 point 2.
    const split = depositSplit(planAsymmetric(-2, 20, FALLBACK_BIN_STEPS))
    expect(split.baseFraction).toBeGreaterThan(0.6)
  })
})
