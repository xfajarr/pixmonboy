/**
 * What the player has chosen so far, and nothing else.
 *
 * This store holds CHOICES, never data. Pools, scores, and positions are
 * derived from fixtures today and from the chain in Phase 3, and caching either
 * one here would create a second version of the truth that drifts. ERD.md
 * section 3.
 *
 * Everything is defaulted, so any screen can be opened directly at its URL and
 * still render. That is not a convenience: it is how nine screens get built and
 * looked at without playing four screens of preamble each time.
 */

import { create } from 'zustand'
import type { RunSummary } from '../game/sim'
import type { Difficulty } from '../types/domain'

/** WIDE survives longer and earns slower. PRD.md 8.3, k = 2.5 vs k = 1.0. */
export type RangeWidth = 'wide' | 'tight'

/**
 * A hand moved range, as offsets from the price at the moment it was set.
 *
 * Percentages, not prices. A console has no keyboard, so the player never
 * types a price; they move an edge by a percentage and the screen prints the
 * price that lands on. Storing the offset also survives the active bin moving
 * between S6 and S7, which PRD.md 8.4 point 5 warns about: a stored PRICE
 * would silently mean a different range by the time it was funded.
 */
export interface ManualRange {
  /** Below the price, so always negative. */
  lowerPct: number
  /** Above the price, so always positive. */
  upperPct: number
}

export interface SessionState {
  /**
   * The memory card in the slot, as an address. Null before S1 inserts one.
   *
   * A CHOICE in the same sense `diskId` is: it is the account the player
   * signed in as, not data about that account. Phase 3 fills it from Privy's
   * embedded wallet and S1 does not change. INTEGRATIONS.md section 5.
   */
  cardAddress: string | null
  diskId: number | null
  difficulty: Difficulty
  /** A modifier on HARD, never a fourth tier. The honeypot check stays on. */
  godMode: boolean

  /** The pool being inspected or played. Null before S5 picks one. */
  pairAddress: string | null

  // ---- what S6 is composing ----------------------------------------------
  /** Quote-token units the player is putting in. */
  amount: number
  width: RangeWidth
  /**
   * Null until the player edits an edge by hand. PRD.md 8.2: manual range is
   * behind a toggle and is never the default path, and null IS that default.
   */
  manualRange: ManualRange | null
  autopilot: boolean

  /**
   * Quote-token balance the player is spending from.
   *
   * A CHOICE-shaped stand-in for a wallet read, which is the one exception to
   * "choices only" and is marked as such: S6 cannot offer MAX or refuse an
   * over-deposit without a ceiling, and there is no chain to ask until Phase 3.
   * Phase 3 replaces this field with the balance read, and S6 does not change.
   */
  balance: number

  // ---- what S7 leaves behind for S8 --------------------------------------
  /**
   * The finished run. Null until one ends.
   *
   * This IS derived data in a store that holds choices, and it is here anyway
   * because the alternative is worse: S8 would have to re-run the simulation
   * to report on it, and a seeded walk replayed at a different tick count
   * produces different numbers from the ones the player just watched. The
   * summary is a RECORD of something that already happened, not a cache of
   * something that can be recomputed. ERD.md section 3.
   */
  lastRun: RunSummary | null

  insertCard: (cardAddress: string) => void
  clearCard: () => void
  /**
   * Set by an eject so S1 does not auto-insert the still-connected wallet that
   * survives a Privy logout. `LiveCard` reads it; a fresh login resets it.
   */
  ejected: boolean
  resetEjected: () => void
  chooseDifficulty: (difficulty: Difficulty, godMode?: boolean) => void
  choosePool: (pairAddress: string) => void
  setAmount: (amount: number) => void
  setWidth: (width: RangeWidth) => void
  setManualRange: (manual: ManualRange | null) => void
  setAutopilot: (on: boolean) => void
  openDisk: (diskId: number) => void
  finishRun: (summary: RunSummary) => void
}

export const useSession = create<SessionState>((set) => ({
  cardAddress: null,
  diskId: null,
  difficulty: 'easy',
  godMode: false,
  pairAddress: null,
  amount: 100,
  width: 'wide',
  manualRange: null,
  autopilot: true,
  balance: 250,
  lastRun: null,
  ejected: false,

  insertCard: (cardAddress) => set({ cardAddress }),
  // Ejecting the card drops every account-bound choice with it, so a fresh
  // card starts from S1 and not from halfway through the previous player's
  // run. The disk survives on chain; only this session forgets it. `ejected`
  // is set here so S1 knows not to auto-insert the wallet that is still
  // connected on Privy's side.
  clearCard: () =>
    set({
      cardAddress: null,
      diskId: null,
      difficulty: 'easy',
      godMode: false,
      pairAddress: null,
      amount: 100,
      width: 'wide',
      manualRange: null,
      autopilot: true,
      balance: 250,
      lastRun: null,
      ejected: true,
    }),
  // A deliberate login or connect is the player asking to come back, which is
  // the opposite of an eject, so the guard comes down.
  resetEjected: () => set({ ejected: false }),
  chooseDifficulty: (difficulty, godMode = false) =>
    // GOD MODE is only reachable from HARD, so it cannot survive a downgrade.
    set({ difficulty, godMode: difficulty === 'hard' ? godMode : false }),
  choosePool: (pairAddress) => set({ pairAddress }),
  // Clamped to the balance here rather than in S6, so no screen can put the
  // player into a deposit they cannot fund by taking a different route in.
  setAmount: (amount) =>
    set((s) => ({ amount: Math.min(Math.max(0, amount), s.balance) })),
  // Picking a width again is the player asking for the suggestion back, so it
  // drops any hand moved edges. The manual range is an edit ON TOP of a
  // width, never a second mode running beside it. plan.ts says the same.
  setWidth: (width) => set({ width, manualRange: null }),
  setManualRange: (manualRange) => set({ manualRange }),
  setAutopilot: (autopilot) => set({ autopilot }),
  openDisk: (diskId) => set({ diskId }),
  finishRun: (lastRun) => set({ lastRun }),
}))
