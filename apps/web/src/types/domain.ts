/**
 * Every shape in ERD.md, as TypeScript and as a Zod schema.
 *
 * This file is the contract between the three lanes. Lane A renders these
 * shapes from fixtures today; Lane B fills them from chain later. Neither
 * waits for the other, and a fixture that drifts from its type fails the test
 * suite rather than producing a screen that works on fake data and breaks on
 * real data.
 *
 * SMART-CONTRACTS.md 12.3: nothing here may assume a chain, an address, or a
 * token's decimals. The chain decision must stay a config edit.
 */

import { z } from 'zod'

/** 0x-prefixed, 20 bytes. Not checksummed here; viem does that at the edge. */
export const zAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'not a 20 byte hex address')

/** A 0 to 100 score. Every scoring output is one of these. */
export const zScore = z.number().int().min(0).max(100)

/** Seconds since epoch. Never milliseconds, so it matches chain timestamps. */
export const zTimestamp = z.number().int().nonnegative()

/**
 * Amounts cross the wire as decimal strings, never as JS numbers.
 * A pool with 18 decimals overflows Number.MAX_SAFE_INTEGER at 9.007 tokens.
 */
export const zAmount = z
  .string()
  .regex(/^\d+$/, 'not an unsigned integer string')

// ---------------------------------------------------------------------------
// TOKEN
// ---------------------------------------------------------------------------

/**
 * `decimals` is carried, never assumed. Mainnet USDC is 6; a mock token we
 * deploy ourselves is 18. Code that hardcodes either breaks on the other path,
 * and it breaks as wrong numbers on screen rather than as an error.
 */
export const zToken = z.object({
  address: zAddress,
  symbol: z.string().min(1).max(16),
  decimals: z.number().int().min(0).max(36),
})
export type Token = z.infer<typeof zToken>

// ---------------------------------------------------------------------------
// POOL
// ---------------------------------------------------------------------------

export const zPool = z.object({
  pairAddress: zAddress,
  tokenX: zToken,
  tokenY: zToken,
  /** Basis points per bin. 25 means each bin is 0.25% wide. */
  binStep: z.number().int().positive(),
  activeBinId: z.number().int().positive(),
  tvlUsd: z.number().nonnegative(),
  /**
   * Null when it cannot be read. On Monad's public RPC `eth_getLogs` is capped
   * at a 100 block range, about forty seconds, and twenty four hours is 216,000
   * blocks. Extrapolating forty seconds into a day would be an invented number,
   * so the field admits it does not know. Scoring treats null the way it
   * already treats unknown volatility: neutral, neither rewarded nor punished.
   */
  volume24hUsd: z.number().nonnegative().nullable(),
  /**
   * When the pool was born, or PROVABLY BEFORE IT.
   *
   * Always a real timestamp, so `now - createdAt` is always a valid age and
   * time only ever enters scoring through the `nowSeconds` argument. When the
   * exact birthday is unreadable this holds the oldest block whose state the
   * RPC still serves and at which the pool already had bytecode: the pool is
   * at least that old, so every comparison is conservative in the safe
   * direction rather than optimistic.
   */
  createdAt: zTimestamp,
  /**
   * Whether `createdAt` is the true birthday or a proven upper bound on it.
   *
   * False means "at least this old, possibly much older". A screen must say
   * "over 9 days" rather than "9 days", and a gate must not brand the pool
   * too-new on the strength of a bound it knows is understated.
   */
  createdAtIsExact: z.boolean(),
  /** Top-10 LP share of supply, 0 to 1. Null when it cannot be read cheaply. */
  lpConcentration: z.number().min(0).max(1).nullable(),
  /** Standard deviation of log returns over 24h. Null when history is short. */
  realizedVol24h: z.number().nonnegative().nullable(),
})
export type Pool = z.infer<typeof zPool>

// ---------------------------------------------------------------------------
// POOL SCORE
// ---------------------------------------------------------------------------

/**
 * Every field is derived and pure, computed by lib/scoring from a Pool plus a
 * MomentumEntry. Nothing here is fetched, which is what makes it testable and
 * what makes the formula defensible to a judge.
 */
export const zPoolScore = z.object({
  pairAddress: zAddress,
  safety: zScore,
  heat: zScore,
  // SAFETY terms
  liquidityDepth: zScore,
  poolAge: zScore,
  quoteQuality: zScore,
  lpConcentrationScore: zScore,
  // HEAT terms
  realizedVol: zScore,
  turnover: zScore,
  momentum: zScore,
  /** False excludes the pool entirely. Fail closed, INTEGRATIONS.md 8.3. */
  honeypotClean: z.boolean(),
  /** True when momentum fell back to a neutral 50. Shown in the UI. */
  momentumDegraded: z.boolean(),
})
export type PoolScore = z.infer<typeof zPoolScore>

// ---------------------------------------------------------------------------
// DIFFICULTY AND GATES
// ---------------------------------------------------------------------------

export const zDifficulty = z.enum(['easy', 'normal', 'hard'])
export type Difficulty = z.infer<typeof zDifficulty>

/**
 * Gates run BEFORE scores and are absolute. A pool that fails a gate is never
 * shown, whatever it scores. PRD.md section 7.
 */
export const zGateSet = z.object({
  minTvlUsd: z.number().nonnegative(),
  minAgeSeconds: z.number().int().nonnegative(),
  allowedQuoteSymbols: z.array(z.string()),
  /** Never false, including in GOD MODE. CLAUDE.md rule 6. */
  honeypotCheck: z.literal(true),
  minSafety: zScore,
  minHeat: zScore,
  maxHeat: zScore,
})
export type GateSet = z.infer<typeof zGateSet>

// ---------------------------------------------------------------------------
// SAVE DISK
// ---------------------------------------------------------------------------

/** Mirrors DiskRegistry.Disk. See SMART-CONTRACTS.md section 4. */
export const zSaveDisk = z.object({
  diskId: z.number().int().nonnegative(),
  owner: zAddress,
  /** bytes12 onchain, so at most 12 characters. */
  name: z.string().min(1).max(12),
  difficulty: zDifficulty,
  godMode: z.boolean(),
  createdAt: zTimestamp,
  runs: z.number().int().nonnegative(),
  /** Score and damage always travel together. CLAUDE.md rule 2. */
  bestScore: z.number().nonnegative(),
  bestDamage: z.number().nonnegative(),
  /** False until the signature path exists. SMART-CONTRACTS.md 3.3. */
  attested: z.boolean(),
})
export type SaveDisk = z.infer<typeof zSaveDisk>

// ---------------------------------------------------------------------------
// POSITION
// ---------------------------------------------------------------------------

export const zPosition = z.object({
  positionId: z.string().min(1),
  diskId: z.number().int().nonnegative(),
  pairAddress: zAddress,
  lowerBinId: z.number().int().positive(),
  upperBinId: z.number().int().positive(),
  depositedX: zAmount,
  depositedY: zAmount,
  openedAt: zTimestamp,
  autopilotEnabled: z.boolean(),
})
export type Position = z.infer<typeof zPosition>

/**
 * Read live from Liquidity Book, never stored. ERD.md section 3: caching
 * anything derivable from chain state creates a second version of the truth
 * that will drift and will be wrong on stage.
 */
export const zPositionLive = z.object({
  positionId: z.string().min(1),
  activeBinId: z.number().int().positive(),
  currentValueUsd: z.number().nonnegative(),
  feesEarnedUsd: z.number().nonnegative(),
  /** Negative is a loss. Displayed at the same weight as fees. Rule 2. */
  netVsHoldUsd: z.number(),
})
export type PositionLive = z.infer<typeof zPositionLive>

// ---------------------------------------------------------------------------
// SESSION RESULT
// ---------------------------------------------------------------------------

export const zSessionResult = z.object({
  positionId: z.string().min(1),
  feesEarnedUsd: z.number().nonnegative(),
  /** Stored positive, rendered with a minus. Never hidden. */
  damageUsd: z.number().nonnegative(),
  secondsInRange: z.number().int().nonnegative(),
  secondsTotal: z.number().int().positive(),
})
export type SessionResult = z.infer<typeof zSessionResult>

// ---------------------------------------------------------------------------
// REBALANCE EVENT
// ---------------------------------------------------------------------------

/**
 * Every autopilot skip is recorded and shown. "Autopilot did not fire, the swap
 * would have cost more than the fees it recovered" is a better product than a
 * silent no-op, and it is the sentence that proves the net-benefit check exists.
 */
export const zRebalanceEvent = z.object({
  positionId: z.string().min(1),
  firedAt: zTimestamp,
  executed: z.boolean(),
  skipReason: z
    .enum(['cooldown', 'within-hysteresis', 'net-benefit-negative', 'none'])
    .default('none'),
  estimatedNetBenefitUsd: z.number(),
})
export type RebalanceEvent = z.infer<typeof zRebalanceEvent>

// ---------------------------------------------------------------------------
// MOMENTUM
// ---------------------------------------------------------------------------

export const zMomentumEntry = z.object({
  symbol: z.string().min(1),
  score: zScore,
  mentions: z.number().int().nonnegative(),
  velocity: z.number(),
})

export const zMomentumSnapshot = z.object({
  computedAt: z.string().datetime(),
  windowHours: z.number().positive(),
  entries: z.array(zMomentumEntry),
})
export type MomentumSnapshot = z.infer<typeof zMomentumSnapshot>
export type MomentumEntry = z.infer<typeof zMomentumEntry>

// ---------------------------------------------------------------------------
// FIXTURE ENVELOPES
// ---------------------------------------------------------------------------

export const zPoolsFixture = z.object({
  /** Which path this fixture describes. SMART-CONTRACTS.md section 12. */
  profile: z.enum(['mainnet', 'self-testnet']),
  capturedAt: z.string().datetime(),
  pools: z.array(zPool).min(1),
})
export type PoolsFixture = z.infer<typeof zPoolsFixture>
