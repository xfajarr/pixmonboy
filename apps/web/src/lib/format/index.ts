/**
 * Numbers, as a beginner reads them.
 *
 * PURE. Intl does the arithmetic; this file only fixes the locale so the
 * server render and the client render produce the same string. A number that
 * hydrates differently than it rendered is a flash of wrong money on the one
 * screen that must never look wrong.
 *
 * The Value primitive owns SIGNED numbers, colour, and tabular alignment. These
 * are for the strings around them: labels, axis ticks, and prices.
 */

const LOCALE = 'en-US'

const USD = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const USD_COMPACT = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 0,
})

/** `$412.00`. For amounts a user typed or will hold. */
export function usd(amount: number): string {
  return USD.format(amount)
}

/** `$412K`. For pool-sized numbers, which never need the cents. */
export function compactUsd(amount: number): string {
  return USD_COMPACT.format(amount)
}

/** `18.2%`. Takes a percentage, not a fraction. */
export function pct(percentage: number, decimals = 1): string {
  return `${percentage.toFixed(decimals)}%`
}

/**
 * `0.0412`. Four significant figures, trailing zeros dropped.
 *
 * A pair price can be 0.00004123 or 4123, and a fixed decimal count is
 * unreadable at one end and wrong at the other.
 */
export function price(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(Number(value.toPrecision(4)))
}

/**
 * `3h 12m`, `12m 04s`, `41d`.
 *
 * Two units, never three. Anything more is a stopwatch, and this is a label.
 */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const days = Math.floor(s / 86_400)
  const hours = Math.floor((s % 86_400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)

  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${minutes}m ${String(s % 60).padStart(2, '0')}s`
}

/**
 * `41 days`, and below one day it falls through to hours.
 *
 * Flooring straight to days printed "0 days" for anything under 24 hours, which
 * would be pedantic anywhere else and was actively misleading in the one place
 * this is used: S4 renders the live difficulty gates, and HARD's `minAgeSeconds`
 * is six hours. The screen whose entire job is proving the filter is real was
 * printing a row that said the filter was nothing, on the tier a presenter picks
 * to reach GOD MODE. The gate does reject younger pools; only the readout lied.
 *
 * Still called `ageInDays` because days is what it says for every value a
 * beginner will actually see on a pool. The sub-day branch exists for gate
 * thresholds, not for pools.
 */
export function ageInDays(seconds: number): string {
  const s = Math.max(0, seconds)
  const days = Math.floor(s / 86_400)
  if (days > 0) return days === 1 ? '1 day' : `${days} days`

  const hours = Math.floor(s / 3_600)
  if (hours > 0) return hours === 1 ? '1 hour' : `${hours} hours`

  const minutes = Math.floor(s / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}
