/**
 * Gates run BEFORE scores and are absolute.
 *
 * A pool that fails a gate is never shown, whatever it scores. That ordering
 * is the product: the difficulty tier is a promise about what you will be
 * allowed to touch, and a score is only a description of what is left.
 */

import type { GateSet, Pool, PoolScore } from '../../types/domain'

export type GateFailure =
  | 'tvl-too-low'
  | 'too-new'
  | 'quote-not-allowed'
  | 'honeypot'
  | 'safety-too-low'
  | 'heat-too-low'
  | 'heat-too-high'

/** A check we could not run, as opposed to one that failed. */
export type GateUnverified = 'age'

export interface GateResult {
  passed: boolean
  failures: Array<GateFailure>
  /**
   * Checks that could not be evaluated, which is NOT the same as failing them.
   *
   * A pool whose exact birthday is unreadable must not be branded "too new":
   * that would reject pools that are in fact old enough, and a filter that
   * lies in the strict direction is still a filter that lies. It also must not
   * silently pass as if verified. So it lands here and the screen says so.
   */
  unverified: Array<GateUnverified>
}

/**
 * Every failure is collected, not just the first.
 *
 * A screen that says "this pool is too new" when it is also a honeypot has
 * told the user the least useful true thing. The tracker shows all of them.
 */
export function evaluateGates(
  pool: Pool,
  score: PoolScore,
  gates: GateSet,
  nowSeconds: number,
): GateResult {
  const failures: Array<GateFailure> = []
  const unverified: Array<GateUnverified> = []

  if (pool.tvlUsd < gates.minTvlUsd) failures.push('tvl-too-low')

  // Three outcomes, not two. `createdAt` is the birthday or a proven bound
  // before it, so passing this comparison is always real evidence. Failing it
  // means one of two different things, and they must not be conflated: an
  // exact birthday that is genuinely too recent is a FAILURE, while a bound
  // that merely cannot reach back far enough is UNVERIFIED. Branding the
  // second one too-new would reject pools that are in fact old enough, and a
  // filter that lies in the strict direction is still a filter that lies.
  if (nowSeconds - pool.createdAt < gates.minAgeSeconds) {
    if (pool.createdAtIsExact) failures.push('too-new')
    else unverified.push('age')
  }

  if (!gates.allowedQuoteSymbols.includes(pool.tokenY.symbol)) {
    failures.push('quote-not-allowed')
  }

  // CLAUDE.md rule 6. Never disabled, including in GOD MODE. It is not
  // conditional on gates.honeypotCheck being true because that field cannot
  // be false; the type is `literal(true)`.
  if (!score.honeypotClean) failures.push('honeypot')

  if (score.safety < gates.minSafety) failures.push('safety-too-low')
  if (score.heat < gates.minHeat) failures.push('heat-too-low')
  if (score.heat > gates.maxHeat) failures.push('heat-too-high')

  return { passed: failures.length === 0, failures, unverified }
}

/** Copy for a check that could not be run. Never phrased as a verdict. */
export const UNVERIFIED_COPY: Record<GateUnverified, string> = {
  age: 'Age not verifiable this far back. Older than the window, not younger',
}

/** Copy for each failure. Plain, specific, never scolding. */
export const GATE_COPY: Record<GateFailure, string> = {
  'tvl-too-low': 'Not enough liquidity for this difficulty',
  'too-new': 'Too new. Nobody knows how it behaves yet',
  'quote-not-allowed': 'Paired against a token this tier does not allow',
  honeypot: 'Could not simulate a sell. You may not be able to get out',
  'safety-too-low': 'Safety below this difficulty floor',
  'heat-too-low': 'Too quiet. There are no fees to earn here',
  'heat-too-high': 'Too hot for this difficulty. The range would break fast',
}
