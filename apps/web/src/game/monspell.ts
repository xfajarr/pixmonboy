/**
 * MONSPELL's pure logic.
 *
 * PURE. No React, no clock, no Math.random. A round is decided by a start
 * price, an end price, and the player's call — three values in, one outcome
 * out. The clock lives in the screen, exactly as it does in S7's sim: the
 * screen owns time, this module owns the judgement, and a test can decide a
 * round without ever touching a timer.
 *
 * THE CALL
 *
 * A player predicts MON will be HIGHER or LOWER in ten seconds. The call is
 * made BEFORE the window opens, which is the whole point of the game and the
 * reason it takes a direction and not a target: predicting a number is a
 * different, much harder ask, and would punish the player for being right
 * about direction but off by a cent.
 */

export type MonspellCall = 'up' | 'down'

export type MonspellOutcome = 'win' | 'lose' | 'draw'

export interface RoundInput {
  call: MonspellCall
  startUsd: number
  endUsd: number
}

/**
 * Decide a round. Ties are draws, not wins: a price that did not move in ten
 * seconds is nobody's fault, and crediting the player for guessing it would
 * teach the screen to reward a coin flip. `0.000001` is the display floor —
 * the price moves by more than this whenever it moves at all — so "equal" and
 * "within display noise" are the same thing, and the compare is a delta test
 * rather than a float equality that could never be true.
 */
export function decideRound({ call, startUsd, endUsd }: RoundInput): MonspellOutcome {
  const delta = endUsd - startUsd
  if (Math.abs(delta) < 0.000_001) return 'draw'
  const movedUp = delta > 0
  return movedUp === (call === 'up') ? 'win' : 'lose'
}

export interface RoundResult {
  outcome: MonspellOutcome
  /** How far the price moved, as a signed display value. */
  deltaUsd: number
  startUsd: number
  endUsd: number
}

/** The display summary of a decided round. One struct, drawn by the screen. */
export function summarizeRound(input: RoundInput): RoundResult {
  return {
    outcome: decideRound(input),
    deltaUsd: input.endUsd - input.startUsd,
    startUsd: input.startUsd,
    endUsd: input.endUsd,
  }
}

/**
 * A streak is wins in a row. It survives draws (a draw is not a loss) and it
 * survives only that: the first loss resets it. The screen draws the number
 * so the demo has something to cheer; the reset rule is the only part worth
 * testing.
 */
export function nextStreak(streak: number, outcome: MonspellOutcome): number {
  if (outcome === 'win') return streak + 1
  if (outcome === 'draw') return streak
  return 0
}

/**
 * One frame of the Monanimal's price movement.
 *
 * PURE. The character's screen position does not jump from sample to sample
 * (the live poll ticks once a second); it glides toward the latest sample,
 * and this is how far one animation frame should take it. `current` moves a
 * fraction of the remaining distance each frame, which is fast when far away
 * and gentle when close, so the arrival never overshoots and never waits.
 *
 * The factor is deliberately kept low: the whole point is a smooth climb and
 * fall against a price that only ticks once a second, not a sprite that snaps
 * to each new reading. 0.1 at 120fps arrives at a new sample in about 12
 * frames, which reads as movement, not as lag.
 */
export function approachPriceY(
  current: number,
  target: number,
  factor = 0.1,
): number {
  return current + (target - current) * factor
}

/**
 * The fixed price window a round is drawn in.
 *
 * Frozen at the moment the round opens, centred on the opening price and wide
 * enough to contain the jail line. Keeping it fixed is the whole point: the
 * jail line must not slide as the price moves, or the character could never
 * visually escape it. While picking (no round) the screen centres the window
 * on the live price instead, which is the same function fed a live centre.
 */
export function roundWindow(
  centreUsd: number,
  margin: number,
): { low: number; high: number } {
  return {
    low: centreUsd * (1 - margin),
    high: centreUsd * (1 + margin),
  }
}

/**
 * Half-width of the round window, as a fraction of the centre price.
 *
 * ±0.05%, deliberately tight. MON's real moves are small (tenths of a percent
 * at most over ten seconds), and a ±0.5% window would squash them into a few
 * pixels of the 168px field. This window is the "zoom": it magnifies the real
 * movement so the Monanimal visibly climbs and falls without inventing price
 * data. The jail line (the entry price) sits at the exact middle of it.
 */
export const WINDOW_HALF = 0.0005
