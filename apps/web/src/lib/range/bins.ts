/**
 * Liquidity Book bin maths.
 *
 * PURE. No network, no React, no clock. This is the module where an error
 * loses real money and stays invisible until it does, which is why it is the
 * one place in the frontend held to TDD.
 *
 * Identical on both chain paths. SMART-CONTRACTS.md 12.1: mainnet LFJ and a
 * joe-v2 we deploy ourselves run the same code, so this file does not care
 * which one was chosen.
 */

import { MAX_BINS_PER_TX, REFERENCE_BIN_ID } from '../../config/thresholds'

/**
 * price(id) = (1 + binStep / 10_000) ^ (id - 2^23)
 *
 * 2^23 is the reference id, where price is exactly 1. Implemented once, here,
 * and never inlined at a call site. A sign error in this expression is
 * invisible on screen and expensive in a position.
 */
export function priceFromBinId(binId: number, binStep: number): number {
  return Math.pow(1 + binStep / 10_000, binId - REFERENCE_BIN_ID)
}

/**
 * The same price, in the units a person actually says out loud.
 *
 * `priceFromBinId` above is a RAW ratio: token Y base units per one base unit
 * of token X. That is Liquidity Book's own definition and it is the right thing
 * for maths, but it is never the right thing for a screen. For an 18-decimal
 * token quoted against a 6-decimal stable, the two differ by 10^12:
 *
 *   raw      0.000000000002
 *   what a person means            2
 *
 * Three screens rendered the raw figure for a while and printed prices like
 * `2e-12` next to a dollar sign. Nothing threw, nothing failed a test, and the
 * number was wrong by twelve orders of magnitude — the exact failure mode the
 * seeding script warns about in `contracts/script/SeedPools.s.sol`, arriving
 * from the other direction.
 *
 * Kept as a SEPARATE function rather than folded into `priceFromBinId`, because
 * the raw ratio is what the bin maths is defined in and quietly rescaling it
 * would break every caller that is correctly working in bin space. A caller
 * picks one on purpose: raw for arithmetic, this for anything a person reads.
 */
export function poolPriceFromBinId(
  binId: number,
  binStep: number,
  decimalsX: number,
  decimalsY: number,
): number {
  return priceFromBinId(binId, binStep) * 10 ** (decimalsX - decimalsY)
}

/**
 * The inverse. Returns a real number; callers decide how to round, because
 * rounding toward or away from the active bin is a product decision rather
 * than a maths one.
 */
export function binIdFromPrice(price: number, binStep: number): number {
  if (price <= 0) throw new RangeError('price must be positive')
  return REFERENCE_BIN_ID + Math.log(price) / Math.log(1 + binStep / 10_000)
}

/** Each bin spans this fraction of price. A 25bps step is 0.0025. */
export function binWidthFraction(binStep: number): number {
  return binStep / 10_000
}

/**
 * How many bins a +/- `widthPct` range needs at this bin step.
 *
 * Counts both sides plus the active bin, which is the number that actually
 * has to fit in one transaction.
 */
export function binsForWidth(widthPct: number, binStep: number): number {
  const halfSpan = Math.log(1 + widthPct / 100)
  const perBin = Math.log(1 + binStep / 10_000)
  return Math.ceil(halfSpan / perBin) * 2 + 1
}

export interface RangePlan {
  binStep: number
  /** Bins below the active bin. Hold only the quote token. */
  binsBelow: number
  /** Bins above the active bin. Hold only the base token. */
  binsAbove: number
  totalBins: number
  /** What the user actually gets, which may differ from what they asked for. */
  achievedWidthPct: number
  /** True when the requested width did not fit and was clamped. */
  clamped: boolean
}

/**
 * THE COUPLED CONTROL. CLAUDE.md rule 4.
 *
 * Bin step and range width are never two raw controls. A 25bps step across
 * +/-20% is roughly 160 bins, which does not fit in one transaction, and a UI
 * that lets a user ask for it is a UI that produces a revert.
 *
 * So the user asks for a WIDTH, and this picks the finest bin step from the
 * available presets that fits the transaction cap. Finest is the right default
 * because a smaller bin concentrates liquidity, which is the entire reason to
 * use Liquidity Book instead of a constant product pool.
 *
 * If no preset fits, the width is clamped and `clamped` says so, so the screen
 * can show what the user is really getting rather than silently lying.
 */
export function planRange(
  widthPct: number,
  availableBinSteps: ReadonlyArray<number>,
  maxBins: number = MAX_BINS_PER_TX,
): RangePlan {
  if (widthPct <= 0) throw new RangeError('width must be positive')
  if (availableBinSteps.length === 0) {
    throw new RangeError('no bin step presets available')
  }

  const steps = [...availableBinSteps].sort((a, b) => a - b)

  for (const binStep of steps) {
    const total = binsForWidth(widthPct, binStep)
    if (total <= maxBins) {
      const perSide = (total - 1) / 2
      return {
        binStep,
        binsBelow: perSide,
        binsAbove: perSide,
        totalBins: total,
        achievedWidthPct: widthFromBins(perSide, binStep),
        clamped: false,
      }
    }
  }

  // Nothing fits. Take the coarsest step and clamp the width to the cap.
  const binStep = steps[steps.length - 1]
  const perSide = Math.floor((maxBins - 1) / 2)
  return {
    binStep,
    binsBelow: perSide,
    binsAbove: perSide,
    totalBins: perSide * 2 + 1,
    achievedWidthPct: widthFromBins(perSide, binStep),
    clamped: true,
  }
}

/**
 * THE MANUAL RANGE'S PLAN. PRD.md 8.2, the advanced path.
 *
 * planRange() asks one question, "how wide, both ways", and always answers
 * symmetrically. A manual range names its two edges independently, so the bin
 * step has to fit the WHOLE span rather than one half of it, and the two sides
 * are counted separately.
 *
 * Everything else is deliberately identical: same transaction cap, same
 * finest-step-that-fits rule, same `clamped` honesty. The coupled control of
 * CLAUDE.md rule 4 still holds, because the caller still never picks a bin
 * step; it names two prices and this answers with the step they fit in.
 *
 * The range must straddle the current price. A one sided range is a resting
 * limit order, which is a real Liquidity Book position and a different game:
 * "in range" stops being a live state when you start out of range by
 * construction. Rejected here rather than half supported.
 */
export function planAsymmetric(
  lowerPct: number,
  upperPct: number,
  availableBinSteps: ReadonlyArray<number>,
  maxBins: number = MAX_BINS_PER_TX,
): RangePlan {
  if (lowerPct >= 0) throw new RangeError('lower edge must be below the price')
  if (upperPct <= 0) throw new RangeError('upper edge must be above the price')
  if (availableBinSteps.length === 0) {
    throw new RangeError('no bin step presets available')
  }

  const steps = [...availableBinSteps].sort((a, b) => a - b)
  const belowSpan = -Math.log(1 + lowerPct / 100)
  const aboveSpan = Math.log(1 + upperPct / 100)

  for (const binStep of steps) {
    const perBin = Math.log(1 + binStep / 10_000)
    const binsBelow = Math.ceil(belowSpan / perBin)
    const binsAbove = Math.ceil(aboveSpan / perBin)
    if (binsBelow + binsAbove + 1 <= maxBins) {
      return asymmetricPlan(binStep, binsBelow, binsAbove, false)
    }
  }

  // Nothing fits. Coarsest step, and both sides shrink in proportion so the
  // shape the player drew survives the clamp even though its size does not.
  const binStep = steps[steps.length - 1]
  const room = maxBins - 1
  const binsBelow = Math.max(
    1,
    Math.min(
      room - 1,
      Math.floor((room * belowSpan) / (belowSpan + aboveSpan)),
    ),
  )
  return asymmetricPlan(binStep, binsBelow, room - binsBelow, true)
}

function asymmetricPlan(
  binStep: number,
  binsBelow: number,
  binsAbove: number,
  clamped: boolean,
): RangePlan {
  return {
    binStep,
    binsBelow,
    binsAbove,
    totalBins: binsBelow + binsAbove + 1,
    // One number for a two sided shape, so it is the MEAN of the two half
    // widths. Screens that care about the edges read the bin ids instead;
    // this field exists for the symmetric case and stays honest here by
    // being an average rather than pretending one side speaks for both.
    achievedWidthPct:
      (widthFromBins(binsBelow, binStep) + widthFromBins(binsAbove, binStep)) /
      2,
    clamped,
  }
}

/** The percentage width `perSide` bins reach at this step. */
export function widthFromBins(perSide: number, binStep: number): number {
  return (Math.pow(1 + binStep / 10_000, perSide) - 1) * 100
}

/** Bin ids for a plan, relative to the active bin at EXECUTION time. */
export function binIdsForPlan(
  plan: RangePlan,
  activeBinId: number,
): { lowerBinId: number; upperBinId: number; deltaIds: Array<number> } {
  const deltaIds: Array<number> = []
  for (let d = -plan.binsBelow; d <= plan.binsAbove; d += 1) deltaIds.push(d)

  return {
    lowerBinId: activeBinId - plan.binsBelow,
    upperBinId: activeBinId + plan.binsAbove,
    deltaIds,
  }
}

/** ERD.md section 4. Drives every state on the live screen. */
export function isInRange(
  activeBinId: number,
  lowerBinId: number,
  upperBinId: number,
): boolean {
  return activeBinId >= lowerBinId && activeBinId <= upperBinId
}

/**
 * 1.0 at the centre of the range, 0.0 at either edge, 0 when out.
 *
 * ONE number drives the mini-game difficulty, the warning state, the audio,
 * and the character animation. That single coupling is what makes the game a
 * visualisation rather than a decoration.
 */
export function edgeProximity(
  activeBinId: number,
  lowerBinId: number,
  upperBinId: number,
): number {
  if (!isInRange(activeBinId, lowerBinId, upperBinId)) return 0

  const half = (upperBinId - lowerBinId) / 2
  if (half <= 0) return 0

  const nearest = Math.min(activeBinId - lowerBinId, upperBinId - activeBinId)
  return Math.min(1, nearest / half)
}

export type RangeState = 'calm' | 'nad-sense' | 'critical' | 'out'

/** The thresholds are ERD.md section 4 and they are the product, not a detail. */
export function rangeState(
  activeBinId: number,
  lowerBinId: number,
  upperBinId: number,
): RangeState {
  if (!isInRange(activeBinId, lowerBinId, upperBinId)) return 'out'

  const proximity = edgeProximity(activeBinId, lowerBinId, upperBinId)
  if (proximity > 0.4) return 'calm'
  if (proximity >= 0.15) return 'nad-sense'
  return 'critical'
}

/**
 * The deposit split, and why zap-in is core scope rather than polish.
 *
 * Bins BELOW the active bin hold only the quote token. Bins ABOVE hold only
 * the base token. The active bin holds both. So a range can never be funded
 * with one asset, and the user has to be shown the split before they confirm.
 *
 * Returns the fraction of value that must end up as the base token.
 * PRD.md 8.4.2, and skipping the display of this is how a user who typed
 * 100 USDC ends up confused about what they hold.
 */
export function depositSplit(plan: RangePlan): {
  baseFraction: number
  quoteFraction: number
} {
  // Uniform distribution across bins, which is what the game offers.
  // The active bin is split evenly between the two sides.
  const total = plan.totalBins
  const base = plan.binsAbove + 0.5
  return {
    baseFraction: base / total,
    quoteFraction: (total - base) / total,
  }
}
