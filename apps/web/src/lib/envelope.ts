/**
 * No integration returns a bare value. INTEGRATIONS.md section 1.2.
 *
 * Every value that came from outside this process arrives with how much the
 * user should trust it. Thirty lines that make three things impossible:
 *
 *   1. A screen cannot present stale data as live. Freshness travels WITH the
 *      value; it is not a separate flag someone forgets to pass.
 *   2. A screen cannot have a spinner as its terminal state. There is always a
 *      value to render, even when freshness is 'unavailable'.
 *   3. Honesty is structural. PRD.md section 12 forbids presenting cached data
 *      as live, and doing so here requires deliberately dropping a field.
 */

export type Freshness = 'live' | 'cached' | 'fallback' | 'unavailable'

export interface Envelope<T> {
  data: T
  freshness: Freshness
  /** Epoch ms of the underlying read, not of this wrapper. */
  fetchedAt: number
  /** Shown to the user whenever freshness is not 'live'. */
  note?: string
}

export function live<T>(data: T, fetchedAt = Date.now()): Envelope<T> {
  return { data, freshness: 'live', fetchedAt }
}

export function cached<T>(
  data: T,
  fetchedAt: number,
  note = 'Showing the last good read.',
): Envelope<T> {
  return { data, freshness: 'cached', fetchedAt, note }
}

export function fallback<T>(
  data: T,
  fetchedAt: number,
  note = 'Showing a committed snapshot. Not live.',
): Envelope<T> {
  return { data, freshness: 'fallback', fetchedAt, note }
}

export function unavailable<T>(empty: T, note: string): Envelope<T> {
  return { data: empty, freshness: 'unavailable', fetchedAt: 0, note }
}

/** True when the UI must show a staleness badge. */
export function needsBadge(e: Envelope<unknown>): boolean {
  return e.freshness !== 'live'
}

/** Age in seconds, for the badge text. Zero when there is no real read. */
export function ageSeconds(e: Envelope<unknown>, now = Date.now()): number {
  if (e.fetchedAt === 0) return 0
  return Math.max(0, Math.floor((now - e.fetchedAt) / 1000))
}

/**
 * Transform the value while preserving the trust metadata.
 *
 * This is the reason the envelope is worth having a type for rather than a
 * convention: scoring a cached pool list must produce a cached score list, and
 * it does so without anyone remembering to carry the field.
 */
export function mapEnvelope<TIn, TOut>(
  e: Envelope<TIn>,
  f: (value: TIn) => TOut,
): Envelope<TOut> {
  return { ...e, data: f(e.data) }
}

/**
 * Combine two envelopes. The result is only as trustworthy as the worse input.
 *
 * Used where a screen needs pools AND momentum: if momentum fell back, the
 * combined score is not 'live', and the badge appears without a special case.
 */
const ORDER: Record<Freshness, number> = {
  live: 0,
  cached: 1,
  fallback: 2,
  unavailable: 3,
}

export function combine<TLeft, TRight, TOut>(
  a: Envelope<TLeft>,
  b: Envelope<TRight>,
  f: (left: TLeft, right: TRight) => TOut,
): Envelope<TOut> {
  const worse = ORDER[a.freshness] >= ORDER[b.freshness] ? a : b

  // The combined read is as old as its oldest real input. A zero means there
  // was no read at all, so it is ignored rather than treated as 1970.
  const stamps = [a.fetchedAt, b.fetchedAt].filter((t) => t > 0)

  return {
    data: f(a.data, b.data),
    freshness: worse.freshness,
    fetchedAt: stamps.length > 0 ? Math.min(...stamps) : 0,
    note: worse.note,
  }
}
