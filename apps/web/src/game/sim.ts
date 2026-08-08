/**
 * The seeded price walk that drives S7.
 *
 * PURE. No React, no clock, no Math.random. `step` is a function of its
 * arguments and nothing else, which is the whole point: the out-of-range
 * moment has to be reachable on demand and repeatable on stage, and neither
 * is true of a walk that reads Date.now() or the platform RNG.
 *
 * "Price" here is always expressed as a bin id, because bins are what the
 * range math in lib/range/bins.ts already understands. priceFromBinId only
 * gets called at the edges, to hand the Chart primitive a number it can plot.
 */

import { isInRange, priceFromBinId } from '../lib/range/bins'
import type { Pool } from '../types/domain'

export interface SimState {
  /** Advances every step, so a SimState is fully self-describing. */
  seed: number
  activeBinId: number
  elapsedSeconds: number
  feesEarnedUsd: number
  /** Stored positive. The screen renders the minus, per CLAUDE.md rule 2. */
  damageUsd: number
  /** Recent prices for the chart. Capped, see HISTORY_CAP. */
  history: Array<number>

  // ---- what S8 reports on ------------------------------------------------
  /**
   * Ticks spent in range, and ticks total.
   *
   * Two counters rather than one percentage, because a percentage cannot be
   * accumulated without carrying its own denominator anyway, and because
   * SCREEN-DETAIL.md 11 calls time in range "the real score": the number the
   * roadmap leaderboard ranks on deserves to be stored as what it is measured
   * from rather than as a rounded display value.
   */
  ticksInRange: number
  totalTicks: number
  /** How many times the position was recentred. `recordRebalance` owns this. */
  rebalances: number
  /** The longest unbroken in-range streak, in simulated seconds. */
  bestStreakSeconds: number
  /** The streak currently running. Resets to 0 on any out-of-range tick. */
  streakSeconds: number
}

/**
 * Numerical Recipes' constants for a 32 bit LCG. Well known, well tested,
 * good enough for a demo terrain and nowhere near a security boundary. Rolling
 * a bespoke generator here would be new code doing an old job worse.
 */
const LCG_A = 1_664_525
const LCG_C = 1_013_904_223
const LCG_M = 2 ** 32

function lcgNext(seed: number): number {
  return (LCG_A * seed + LCG_C) % LCG_M
}

/**
 * What one rebalance costs the position, as a fraction of the deposit.
 *
 * Roughly half the position changes hands to re-centre it, at LFJ's common
 * 0.3% Liquidity Book swap fee, so 0.15%. Gas is left out because on Monad it
 * is cents and the estimate would be the least reliable part of the number.
 * A floor, not a quote, and the same reasoning S6 states out loud next to its
 * own swap estimate.
 */
const REBALANCE_COST_FRACTION = 0.0015

/**
 * One sim tick of wall-clock game time. ONE HOUR PER TICK.
 *
 * The screen ticks every 500ms (ARCHITECTURE.md, setInterval not rAF, because
 * the runner's animation is CSS and a per-frame JS loop would burn battery to
 * redraw nothing). A demo that advanced sim time at wall-clock speed would
 * never reach anything but "0m 03s", so a tick has always been worth more than
 * half a second.
 *
 * IT WAS 60, AND 60 BROKE THE HEADLINE NUMBER. At a minute per tick, a three
 * minute run is six simulated hours, and six hours of an 18% APR on the default
 * $100 deposit earns $0.0105. `InRange` renders SCORE with two decimals, so the
 * number the entire product exists to demonstrate read "+$0.00" for the first
 * 73 seconds and "+$0.01" for the rest of the pitch, and S8 then printed NET as
 * "$0.00" in the largest glyph on the last screen. Peer judges vote on what
 * visibly worked; the proof-of-value counter never moved.
 *
 * The fix is this constant and NOT `FEE_APR`. The arithmetic was never wrong:
 * 18% on $100 for six hours really is a cent, and inflating the rate to make
 * the screen livelier is exactly the invented number rule 1 forbids. What was
 * wrong was the time scale. At an hour per tick a three minute run is about
 * fifteen simulated days, SCORE reads roughly +$0.74, and `duration()` already
 * renders days.
 *
 * It also repairs the rebalance ratio for free. `REBALANCE_COST_FRACTION`
 * charges $0.15 per rescue, which was fourteen times a whole session's fee
 * income and made every rebalance look like a catastrophe. Against $0.74 it is
 * about a fifth of what the run earned, which is the honest trade PRD.md 8.5
 * wants a player to feel.
 *
 * `NOISE_HORIZON_SECONDS` below is deliberately NOT this number, so the walk's
 * feel is untouched by this change. That separation was already documented
 * there and it is the reason this is a one-constant edit.
 */
export const STEP_SECONDS = 3_600

const SECONDS_PER_YEAR = 365 * 86_400

/**
 * `pool.realizedVol24h` is nullable (zPool: "null when history is short").
 * The name says "24h" but the committed fixture (data/pools.fixture.json)
 * carries values from 0.38 to 2.1, which are annualized standard deviations
 * ESTIMATED FROM a trailing 24h window, not a 24h return itself: nobody's
 * price wanders 210% in a day. 0.6 sits mid-pack against those four pools and
 * is used both here and in the range math (PRD.md 8.3 also names no
 * fallback), so one pool going quiet does not mean two different "unknown
 * volatility" numbers on the same screen.
 */
export const FALLBACK_REALIZED_VOL = 0.6

/**
 * How much simulated price-moving time one 500ms tick represents, for the
 * PURPOSE OF SCALING NOISE ONLY. This is deliberately a different number from
 * STEP_SECONDS below: STEP_SECONDS paces the on-screen clock (fast, so a demo
 * reaches "3h 12m"), while this paces the WALK (chosen so a mid-vol pool
 * moves a legible bin or so per tick instead of every draw rounding to zero,
 * which is what a true 60-second slice of an annualized vol would do). Ratio
 * bookkeeping and ratio noise-feel are two different products of the same
 * cheap number and this repo is honest that they were tuned separately rather
 * than derived from one "real" tick length that does not exist for a demo.
 */
const NOISE_HORIZON_SECONDS = 900

/**
 * Judgement calls, both named so they are one line to retune:
 *
 * FEE_APR is the illustrative yield paid while in range. DAMAGE_APR is the
 * illustrative cost of sitting out of range, deliberately higher than the fee
 * rate: impermanent loss compounds faster than a single fee tier recovers it,
 * which is the entire honesty point of DAMAGE existing at all (PRD.md 8.4.3).
 * Neither number claims to be a real yield. It is a demo fixture animating a
 * number, not a forecast, per CLAUDE.md rule 1.
 */
const FEE_APR = 0.18
const DAMAGE_APR = 0.35

/** 30 samples is plenty for a 240px chart. An uncapped array on a screen that
 * ticks for the length of a demo is a leak with a friendly face. */
const HISTORY_CAP = 30

/**
 * Deterministic per-pool seed, so two players opening the same pool see the
 * same opening moves without either of them touching Math.random. A cheap
 * string hash, not a cryptographic one: nothing here has to resist an
 * attacker, it only has to differ pool to pool.
 */
function seedFromAddress(address: string): number {
  let hash = 0
  for (let i = 0; i < address.length; i += 1) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0
  }
  return hash
}

/**
 * Two identical opening prices so Chart (which needs 2+ points) renders on
 * the very first frame instead of waiting for the first tick.
 *
 * `lowerBinId`, `upperBinId`, and `amount` are unused here and kept in the
 * signature anyway: `createSim` and `step` are meant to be interchangeable at
 * every call site, and a shape that drops arguments only the first call
 * happens not to need is a shape that breaks the moment the opening state
 * ever needs them too.
 */
export function createSim(
  pool: Pool,
  _lowerBinId: number,
  _upperBinId: number,
  _amount: number,
): SimState {
  const price = priceFromBinId(pool.activeBinId, pool.binStep)
  return {
    seed: seedFromAddress(pool.pairAddress),
    activeBinId: pool.activeBinId,
    elapsedSeconds: 0,
    feesEarnedUsd: 0,
    damageUsd: 0,
    history: [price, price],
    ticksInRange: 0,
    totalTicks: 0,
    rebalances: 0,
    bestStreakSeconds: 0,
    streakSeconds: 0,
  }
}

/**
 * One tick. The walk moves in BIN space, not price space, because a bin is
 * the unit `isInRange` understands and rounding a bin delta once here is
 * cheaper than rounding a price back to a bin at every call site.
 */
export function step(
  state: SimState,
  pool: Pool,
  lowerBinId: number,
  upperBinId: number,
  amount: number,
): SimState {
  const seed = lcgNext(state.seed)
  // [0, 1) from the LCG, recentred to [-1, 1). A uniform walk, not a Gaussian
  // one: this is a terrain generator for a mini-game, not a pricing model,
  // and a Box-Muller transform here would be precision spent on an audience
  // that cannot tell the difference from four metres away.
  const draw = (seed / LCG_M) * 2 - 1

  const vol = pool.realizedVol24h ?? FALLBACK_REALIZED_VOL
  const stepVol = vol * Math.sqrt(NOISE_HORIZON_SECONDS / SECONDS_PER_YEAR)
  const logReturn = draw * stepVol

  // Converting a log return to a bin count needs the SAME per-bin width the
  // range math used to place lowerBinId/upperBinId, or the walk and the range
  // disagree about what a bin is worth. binWidthFraction is not imported here
  // on purpose: Math.log(1 + binStep / 10_000) is the identical expression
  // priceFromBinId already commits to, so this reuses that contract instead
  // of introducing a second name for one number.
  const perBinLogWidth = Math.log(1 + pool.binStep / 10_000)
  const activeBinId = state.activeBinId + Math.round(logReturn / perBinLogWidth)

  const inRange = isInRange(activeBinId, lowerBinId, upperBinId)
  const stepFraction = STEP_SECONDS / SECONDS_PER_YEAR

  // Fees earned and damage taken are mutually exclusive by construction: the
  // product's entire lesson is that a position earns OR bleeds depending on
  // one boolean, never both in the same tick.
  const feesEarnedUsd =
    state.feesEarnedUsd + (inRange ? amount * FEE_APR * stepFraction : 0)
  const damageUsd =
    state.damageUsd + (inRange ? 0 : amount * DAMAGE_APR * stepFraction)

  const history = [
    ...state.history,
    priceFromBinId(activeBinId, pool.binStep),
  ].slice(-HISTORY_CAP)

  // The streak breaks on the tick that leaves the range, not on the one after
  // it, so a run that ends out of range still reports the length it actually
  // survived rather than that length plus one tick of bleeding.
  const streakSeconds = inRange ? state.streakSeconds + STEP_SECONDS : 0

  return {
    seed,
    activeBinId,
    elapsedSeconds: state.elapsedSeconds + STEP_SECONDS,
    feesEarnedUsd,
    damageUsd,
    history,
    ticksInRange: state.ticksInRange + (inRange ? 1 : 0),
    totalTicks: state.totalTicks + 1,
    rebalances: state.rebalances,
    bestStreakSeconds: Math.max(state.bestStreakSeconds, streakSeconds),
    streakSeconds,
  }
}

/**
 * The position was recentred. Counts it, and nothing else.
 *
 * Moving the range is not this module's job: the range is derived from the
 * pool and the width choice by the screen that owns it (InRange), and a sim
 * that also moved it would be a second source of truth for where the player's
 * money is. This is a counter for the one line S8 prints, kept here because
 * the rest of the run summary is here and a count that lived somewhere else
 * would be the one number in the summary that could disagree with the others.
 */
export function recordRebalance(state: SimState, amountUsd: number): SimState {
  return {
    ...state,
    rebalances: state.rebalances + 1,
    // A rebalance is never free, and this is the most important honesty point
    // in the product (PRD.md 8.5 point 2). It withdraws at the current ratio,
    // swaps, and redeposits, which crystallises impermanent loss and pays a
    // swap fee. Counting the press without charging for it would make the
    // rescue look free, which is worse than the old bug it replaced: the old
    // one moved nothing, this one would teach a beginner that churning out of
    // trouble costs nothing. In a choppy market that is how autopilot loses
    // money faster than fees earn it, and the game has to be able to show it.
    damageUsd: state.damageUsd + amountUsd * REBALANCE_COST_FRACTION,
  }
}

/** What S8 reports. Derived, never stored: one place computes the percentage. */
export interface RunSummary {
  feesEarnedUsd: number
  damageUsd: number
  netUsd: number
  /** 0 to 100. 0 when the run never ticked, which is a real state, not a NaN. */
  timeInRangePct: number
  rebalances: number
  bestStreakSeconds: number
  elapsedSeconds: number
}

export function summarize(state: SimState): RunSummary {
  return {
    feesEarnedUsd: state.feesEarnedUsd,
    damageUsd: state.damageUsd,
    netUsd: state.feesEarnedUsd - state.damageUsd,
    timeInRangePct:
      state.totalTicks === 0
        ? 0
        : (state.ticksInRange / state.totalTicks) * 100,
    rebalances: state.rebalances,
    bestStreakSeconds: state.bestStreakSeconds,
    elapsedSeconds: state.elapsedSeconds,
  }
}

/**
 * The demo control. BUILD-PLAN.md 0.3: the out-of-range moment is the one
 * screenshot the product is selling, so it cannot depend on the market
 * cooperating for three minutes on stage. `nudge` shoves the active bin
 * `bins` places in `direction`, no RNG, no history update: it is a manual
 * override of the walk, not a tick of it, so the next real `step()` picks up
 * the price series from wherever this left the bin.
 */
export function nudge(
  state: SimState,
  direction: 1 | -1,
  bins: number,
): SimState {
  return { ...state, activeBinId: state.activeBinId + direction * bins }
}
