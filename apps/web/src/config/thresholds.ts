/**
 * Every tunable constant in the scoring model, in one file.
 *
 * THE RULE: scoring functions take a ScoringProfile as an argument. They never
 * import one. SMART-CONTRACTS.md 12.3 item 2 explains why, and it is the single
 * most expensive thing to get wrong before the chain decision is made:
 *
 *   A pool we seed ourselves on testnet holds a few hundred dollars.
 *   A mainnet pool holds hundreds of thousands.
 *
 * With hardcoded USD thresholds, every pool on our own testnet scores zero
 * SAFETY, the tracker shows an empty list, and the demo looks broken while
 * being perfectly correct. Injecting the profile makes that a one line switch.
 */

import type { Difficulty, GateSet } from '../types/domain'

export interface ScoringProfile {
  /** Which deployment this profile describes. */
  id: 'mainnet' | 'self-testnet'

  /**
   * Liquidity depth is log-scaled between these two. At or below `floor` the
   * term is 0; at or above `ceiling` it is 100.
   */
  depthFloorUsd: number
  depthCeilingUsd: number

  /** Pool age saturates at this many seconds. */
  ageSaturationSeconds: number

  /** Quote tokens we consider high quality, by symbol. */
  strongQuotes: Array<string>
  midQuotes: Array<string>

  /**
   * Turnover is BANDED, not monotonic. Too little volume means no fees; too
   * much means the price is running and the range will break. The peak is a
   * band, not a point.
   */
  turnoverIdealLow: number
  turnoverIdealHigh: number
  turnoverDeadAbove: number

  /** Realized volatility, annualised, mapped 0 to 100 across this span. */
  volFloor: number
  volCeiling: number

  /** SAFETY weights. Must sum to 1. */
  safetyWeights: {
    liquidityDepth: number
    poolAge: number
    quoteQuality: number
    lpConcentration: number
  }

  /** HEAT weights. Must sum to 1. */
  heatWeights: {
    realizedVol: number
    turnover: number
    momentum: number
  }

  /** Used when momentum.json is missing or stale. Neutral, never zero. */
  momentumNeutral: number

  /** Older than this and every momentum score degrades to neutral. */
  momentumStaleAfterSeconds: number
}

/** Real liquidity. The numbers the model was designed around. */
export const mainnetProfile: ScoringProfile = {
  id: 'mainnet',
  // MEASURED, 2026-08-08, against every Liquidity Book pool that actually
  // holds liquidity on Monad mainnet. The previous 25,000 / 5,000,000 was
  // Ethereum-scale and was calibrated against invented fixtures: run against
  // the real chain it scored the single deepest pool in the market at zero.
  //
  // The real distribution, from data/pools.mainnet.json:
  //   $102,670  AUSD/USDC        $2,369  cbBTC/USDC
  //   $ 45,835  WMON/USDC bin 5  $2,047  WMON/USDC bin 100
  //   $  5,794  WMON/USDC bin 10 $1,935  WMON/AUSD
  //   $  4,529  USDT0/USDC       $  699  AUSD/USDT0
  //                              $  538  WMON/USDC bin 25
  //
  // Only the magnitudes move. The weights below are untouched, for the same
  // reason selfTestnetProfile gives: the model is the claim, the scale is not.
  depthFloorUsd: 500,
  depthCeilingUsd: 100_000,
  ageSaturationSeconds: 60 * 60 * 24 * 30,
  strongQuotes: ['USDC', 'USDT0', 'WMON', 'MON'],
  midQuotes: ['WETH', 'WBTC', 'AUSD'],
  turnoverIdealLow: 0.15,
  turnoverIdealHigh: 1.2,
  turnoverDeadAbove: 6,
  volFloor: 0.1,
  volCeiling: 2.5,
  safetyWeights: {
    liquidityDepth: 0.35,
    poolAge: 0.25,
    quoteQuality: 0.2,
    lpConcentration: 0.2,
  },
  heatWeights: { realizedVol: 0.45, turnover: 0.3, momentum: 0.25 },
  momentumNeutral: 50,
  momentumStaleAfterSeconds: 60 * 60 * 72,
}

/**
 * Our own joe-v2 deployment, seeded by hand.
 *
 * Only the magnitudes change. The weights are identical, because the model is
 * the claim we defend to a judge and it must not be quietly different on the
 * chain we actually demo on.
 */
export const selfTestnetProfile: ScoringProfile = {
  ...mainnetProfile,
  id: 'self-testnet',
  depthFloorUsd: 50,
  depthCeilingUsd: 20_000,
  ageSaturationSeconds: 60 * 60 * 6,
}

export const profiles = {
  mainnet: mainnetProfile,
  'self-testnet': selfTestnetProfile,
} as const

/**
 * Gates run BEFORE scores and are absolute. PRD.md section 7.
 *
 * These scale with the profile for the same reason the scores do, except
 * `honeypotCheck`, which is `true` at every tier including GOD MODE.
 */
export function gatesFor(
  difficulty: Difficulty,
  profile: ScoringProfile,
): GateSet {
  const scale = profile.id === 'mainnet' ? 1 : 0.002

  const base = {
    // Gate thresholds recalibrated with the profile above and for the same
    // reason. At 250,000 / 75,000 / 20,000 the tracker showed ZERO pools on
    // EASY and NORMAL, because no pool on Monad is that deep. These three cut
    // the measured market into thirds, so the tier a player picks visibly
    // changes what they are allowed to touch, which is the entire promise.
    easy: {
      minTvlUsd: 40_000,
      minAgeSeconds: 60 * 60 * 24 * 14,
      minSafety: 70,
      minHeat: 0,
      maxHeat: 60,
    },
    normal: {
      minTvlUsd: 4_000,
      minAgeSeconds: 60 * 60 * 24 * 3,
      minSafety: 50,
      minHeat: 0,
      maxHeat: 80,
    },
    hard: {
      minTvlUsd: 500,
      minAgeSeconds: 60 * 60 * 6,
      minSafety: 30,
      minHeat: 0,
      maxHeat: 100,
    },
  }[difficulty]

  return {
    minTvlUsd: base.minTvlUsd * scale,
    minAgeSeconds:
      profile.id === 'mainnet'
        ? base.minAgeSeconds
        : Math.round(base.minAgeSeconds * 0.02),
    allowedQuoteSymbols:
      difficulty === 'easy'
        ? profile.strongQuotes
        : [...profile.strongQuotes, ...profile.midQuotes],
    honeypotCheck: true,
    minSafety: base.minSafety,
    minHeat: base.minHeat,
    maxHeat: base.maxHeat,
  }
}

/**
 * Bin step presets. On mainnet these come from LFJ's factory; on our own
 * deployment only the ones we register exist.
 *
 * lib/range reads the live list when it has one and falls back to this. It
 * never assumes 25 is present. SMART-CONTRACTS.md 12.3 item 3.
 */
export const FALLBACK_BIN_STEPS = [1, 2, 5, 10, 15, 20, 25, 50, 100] as const

/** Liquidity Book's reference bin id, where price equals 1. 2^23. */
export const REFERENCE_BIN_ID = 8_388_608

/**
 * The most bins one addLiquidity transaction can carry.
 *
 * This is why bin step and range width are one coupled control and not two.
 * CLAUDE.md rule 4. Measured on the chosen chain at Gate 1.7, not guessed.
 */
export const MAX_BINS_PER_TX = 50
