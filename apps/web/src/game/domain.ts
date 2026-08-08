/**
 * What slice of price the field shows.
 *
 * PURE, and separate from the drawing because it is the one decision on S7
 * that is easy to get subtly wrong and impossible to see in a screenshot until
 * it is very wrong.
 *
 * The naive rule, "fit the price AND both range edges", breaks exactly when
 * the screen matters most. A range is a few percent wide. Price that has run
 * ten percent past an edge forces a domain five times the range, the earning
 * band collapses to a sliver, and the price line flattens into a horizontal
 * rule. The player watching the money shot sees nothing move.
 *
 * So: the price series is always fully visible, that is not negotiable, and
 * the range edges are included only while they fit inside a bounded window.
 * When they do not, an edge falls off the top or bottom of the field. Losing
 * one edge is the correct trade, because once price is far outside the range
 * the distant edge is no longer the thing the player is trying to read.
 */

/**
 * How much taller than the range itself the field is allowed to get.
 *
 * 2.2 leaves visible headroom above and below the band in the normal case,
 * which is what makes approaching an edge legible, while capping how far the
 * band can be squeezed when price runs. Tuned by eye at 480x320 against the
 * fixture pools.
 */
const MAX_SPAN_MULTIPLE = 2.2

/** Breathing room so the line never runs along the very edge of the box. */
const PAD_FRACTION = 0.08

export function yDomain(
  series: ReadonlyArray<number>,
  lowerPrice: number,
  upperPrice: number,
): { low: number; high: number } {
  const seriesLow = Math.min(...series)
  const seriesHigh = Math.max(...series)

  let low = Math.min(seriesLow, lowerPrice)
  let high = Math.max(seriesHigh, upperPrice)

  const maxSpan = (upperPrice - lowerPrice) * MAX_SPAN_MULTIPLE
  if (maxSpan > 0 && high - low > maxSpan) {
    const centre = (seriesLow + seriesHigh) / 2
    low = centre - maxSpan / 2
    high = centre + maxSpan / 2

    // The price series wins every tie. A window that clipped the line would
    // be showing the player a chart of something other than what they hold.
    low = Math.min(low, seriesLow)
    high = Math.max(high, seriesHigh)
  }

  // A flat series has zero span and would divide by zero downstream.
  const span = high - low || Math.abs(high) * 0.01 || 1
  const pad = span * PAD_FRACTION

  return { low: low - pad, high: high + pad }
}
