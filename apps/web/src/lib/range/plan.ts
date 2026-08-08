/**
 * The one place a width CHOICE becomes a bin plan.
 *
 * CLAUDE.md rule 4 says bin step and range width are one coupled control, and
 * this function is that coupling. It lived inside InRange.tsx while S7 was the
 * only screen that needed it. S6 now picks the width and S7 plays it, so the
 * same two screens would have computed the same range from the same inputs in
 * two places: the exact shape of bug where a player is shown one range on the
 * setup screen and funded into a different one.
 */

import { availableBinSteps } from '../../game/fixtures'
import { FALLBACK_REALIZED_VOL } from '../../game/sim'
import { binIdsForPlan, planAsymmetric, planRange } from './bins'
import type { ManualRange, RangeWidth } from '../../state/session'
import type { Pool } from '../../types/domain'
import type { RangePlan } from './bins'

/**
 * PRD.md 8.3: k = 2.5 survives longer and earns slower (WIDE), k = 1.0 is
 * TIGHT. The formula, `k * realized_volatility * sqrt(horizon)`, is shipped as
 * written, but PRD.md never names a `horizon`. This picks one day (expressed
 * in years, because `realizedVol24h` is annualized, see sim.ts): a session on
 * stage lasts a few sim-hours, not sim-days, so sizing the range for roughly a
 * day of expected drift is the shortest horizon that still produces two
 * visibly different ranges instead of two numbers that both clamp to the
 * transaction's bin cap. Open question, not this file's to resolve, but
 * resolved here so the screens render something.
 */
const WIDTH_K: Record<RangeWidth, number> = { wide: 2.5, tight: 1.0 }
const HORIZON_YEARS = 1 / 365

export interface PlannedRange {
  plan: RangePlan
  lowerBinId: number
  upperBinId: number
  deltaIds: Array<number>
  /** The half-width that was ASKED for, before the bin cap had its say. */
  requestedWidthPct: number
}

/**
 * The one entry point every screen uses.
 *
 * WIDE/TIGHT is the base and the manual range is an EDIT ON TOP of it, never
 * a parallel mode: the player picks a width, sees the two prices it produced,
 * and may then move either edge. So a manual range, when present, wins, and
 * `setWidth` clears it (session.ts) because picking the width again is the
 * player saying "start over from the suggestion".
 *
 * S6 and S7 both call THIS rather than either branch, which is the same
 * reason planForWidth exists at all: the range drawn on the setup screen and
 * the range funded on the live screen are one computation or they are a bug.
 */
export function planForSession(
  pool: Pool,
  width: RangeWidth,
  manual: ManualRange | null,
): PlannedRange {
  return manual ? planForOffsets(pool, manual) : planForWidth(pool, width)
}

/** A manual range's two edges, as percentages away from the current price. */
export function planForOffsets(pool: Pool, manual: ManualRange): PlannedRange {
  const plan = planAsymmetric(
    manual.lowerPct,
    manual.upperPct,
    availableBinSteps(),
  )

  return {
    plan,
    ...binIdsForPlan(plan, pool.activeBinId),
    // What was ASKED for, same meaning as the WIDE/TIGHT path: the mean of
    // the two half widths the player drew, before the bin cap had its say.
    requestedWidthPct: (-manual.lowerPct + manual.upperPct) / 2,
  }
}

export function planForWidth(pool: Pool, width: RangeWidth): PlannedRange {
  const vol = pool.realizedVol24h ?? FALLBACK_REALIZED_VOL
  const requestedWidthPct =
    WIDTH_K[width] * vol * Math.sqrt(HORIZON_YEARS) * 100
  const plan = planRange(requestedWidthPct, availableBinSteps())

  return {
    plan,
    ...binIdsForPlan(plan, pool.activeBinId),
    requestedWidthPct,
  }
}
