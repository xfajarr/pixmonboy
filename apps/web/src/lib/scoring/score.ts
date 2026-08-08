/**
 * SAFETY and HEAT.
 *
 * PURE. Given a pool snapshot and a profile it returns two scores and their
 * terms. No network, no React, no clock, which is what makes it testable and
 * what makes the formula defensible when a judge asks.
 *
 * Two rules govern this file:
 *
 *   1. NO PREDICTION. CLAUDE.md rule 1. These are filters over observable
 *      state. Nothing here forecasts a price, and nothing here should ever be
 *      described as doing so.
 *   2. THE PROFILE IS AN ARGUMENT, never an import. SMART-CONTRACTS.md 12.3
 *      item 2: mainnet pools hold hundreds of thousands and a pool we seed
 *      ourselves holds hundreds, so hardcoded thresholds make every pool on
 *      our own testnet score zero and the tracker look broken.
 */

import type { ScoringProfile } from '../../config/thresholds'
import type { MomentumEntry, Pool, PoolScore } from '../../types/domain'

const clamp100 = (n: number): number =>
  Math.max(0, Math.min(100, Math.round(n)))

/**
 * Log-scaled, because the difference between $10k and $100k matters far more
 * than the difference between $2m and $2.1m. Linear scaling would make every
 * pool below the largest one look identical.
 */
export function liquidityDepthScore(
  tvlUsd: number,
  profile: ScoringProfile,
): number {
  const { depthFloorUsd: floor, depthCeilingUsd: ceiling } = profile
  if (tvlUsd <= floor) return 0
  if (tvlUsd >= ceiling) return 100
  return clamp100((Math.log(tvlUsd / floor) / Math.log(ceiling / floor)) * 100)
}

/** Saturating. A pool that is old enough is old enough. */
export function poolAgeScore(
  ageSeconds: number,
  profile: ScoringProfile,
): number {
  if (ageSeconds <= 0) return 0
  return clamp100((ageSeconds / profile.ageSaturationSeconds) * 100)
}

/** A lookup, not a curve. The quote asset is either trusted or it is not. */
export function quoteQualityScore(
  quoteSymbol: string,
  profile: ScoringProfile,
): number {
  if (profile.strongQuotes.includes(quoteSymbol)) return 100
  if (profile.midQuotes.includes(quoteSymbol)) return 60
  return 20
}

/**
 * Concentration inverted: less concentrated is safer.
 *
 * `null` means we could not read it cheaply, which ERD.md warns is likely on
 * Monad. Returning null here rather than a zero is deliberate: an unknown must
 * never look like a bad score, because a bad score removes a pool from the
 * game.
 */
export function lpConcentrationScore(
  concentration: number | null,
): number | null {
  if (concentration === null) return null
  return clamp100((1 - concentration) * 100)
}

/** Annualised volatility mapped across the profile's span. */
export function realizedVolScore(
  vol: number | null,
  profile: ScoringProfile,
): number {
  if (vol === null) return 50
  const { volFloor: floor, volCeiling: ceiling } = profile
  if (vol <= floor) return 0
  if (vol >= ceiling) return 100
  return clamp100(((vol - floor) / (ceiling - floor)) * 100)
}

/**
 * Turnover is BANDED, not monotonic, and that is the whole insight.
 *
 * Too little volume and there are no fees to earn. Too much and the price is
 * running, which breaks the range and costs more in impermanent loss than the
 * fees pay. The peak is a band, so a monotonic score would rank the most
 * dangerous pool in the list as the best one.
 */
export function turnoverScore(
  volume24hUsd: number | null,
  tvlUsd: number,
  profile: ScoringProfile,
): number {
  // Unknown volume scores neutral, exactly as unknown volatility does above.
  // Zero would read as "this pool is dead", which is a claim, and 100 would
  // read as "this pool is perfect", which is a worse one.
  if (volume24hUsd === null) return 50
  if (tvlUsd <= 0) return 0

  const turnover = volume24hUsd / tvlUsd
  const { turnoverIdealLow: low, turnoverIdealHigh: high } = profile
  const { turnoverDeadAbove: dead } = profile

  if (turnover >= low && turnover <= high) return 100
  if (turnover < low) return clamp100((turnover / low) * 100)
  if (turnover >= dead) return 0
  return clamp100(((dead - turnover) / (dead - high)) * 100)
}

/**
 * Momentum degrades to neutral, never to zero.
 *
 * A missing scrape must not read as "nobody is talking about this token".
 * Zero would be a claim we cannot support, which is rule 1 again.
 */
export function momentumScore(
  entry: MomentumEntry | undefined,
  snapshotAgeSeconds: number,
  profile: ScoringProfile,
): { score: number; degraded: boolean } {
  if (!entry) return { score: profile.momentumNeutral, degraded: true }
  if (snapshotAgeSeconds > profile.momentumStaleAfterSeconds) {
    return { score: profile.momentumNeutral, degraded: true }
  }
  return { score: clamp100(entry.score), degraded: false }
}

export interface ScoreInput {
  pool: Pool
  momentum?: MomentumEntry
  momentumAgeSeconds: number
  honeypotClean: boolean
  nowSeconds: number
}

/**
 * SAFETY = 0.35 depth + 0.25 age + 0.20 quote + 0.20 (100 - concentration)
 * HEAT   = 0.45 vol   + 0.30 turnover + 0.25 momentum
 *
 * When concentration is unreadable its weight is redistributed across the
 * other three SAFETY terms proportionally, so the score stays on 0 to 100 and
 * a missing input does not quietly become a penalty. ERD.md section 3.
 */
export function scorePool(
  input: ScoreInput,
  profile: ScoringProfile,
): PoolScore {
  const { pool } = input

  const depth = liquidityDepthScore(pool.tvlUsd, profile)
  // `createdAt` is the birthday or a proven bound before it, so this is always
  // a valid age and always understates rather than flatters. Time enters here
  // and nowhere else, which is what the "no hidden clock" test pins.
  const age = poolAgeScore(input.nowSeconds - pool.createdAt, profile)
  const quote = quoteQualityScore(pool.tokenY.symbol, profile)
  const concentration = lpConcentrationScore(pool.lpConcentration)

  const w = profile.safetyWeights
  let safety: number
  if (concentration === null) {
    const remaining = w.liquidityDepth + w.poolAge + w.quoteQuality
    safety =
      (depth * w.liquidityDepth + age * w.poolAge + quote * w.quoteQuality) /
      remaining
  } else {
    safety =
      depth * w.liquidityDepth +
      age * w.poolAge +
      quote * w.quoteQuality +
      concentration * w.lpConcentration
  }

  const vol = realizedVolScore(pool.realizedVol24h, profile)
  const turnover = turnoverScore(pool.volume24hUsd, pool.tvlUsd, profile)
  const momentum = momentumScore(
    input.momentum,
    input.momentumAgeSeconds,
    profile,
  )

  const h = profile.heatWeights
  const heat =
    vol * h.realizedVol + turnover * h.turnover + momentum.score * h.momentum

  return {
    pairAddress: pool.pairAddress,
    safety: clamp100(safety),
    heat: clamp100(heat),
    liquidityDepth: depth,
    poolAge: age,
    quoteQuality: quote,
    // Surfaced as neutral when unreadable, and the redistribution above means
    // it did not contribute to SAFETY either way.
    lpConcentrationScore: concentration ?? 50,
    realizedVol: vol,
    turnover,
    momentum: momentum.score,
    honeypotClean: input.honeypotClean,
    momentumDegraded: momentum.degraded,
  }
}
