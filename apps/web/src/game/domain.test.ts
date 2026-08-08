import { describe, expect, it } from 'vitest'
import { yDomain } from './domain'

const LOW = 100
const HIGH = 110

describe('the visible slice of price', () => {
  it('shows both edges and the whole series while price is inside', () => {
    const { low, high } = yDomain([102, 105, 107], LOW, HIGH)

    expect(low).toBeLessThan(LOW)
    expect(high).toBeGreaterThan(HIGH)
  })

  it('always keeps the whole price series visible', () => {
    // Not negotiable. A window that clipped the line would be a chart of
    // something other than what the player holds.
    for (const series of [
      [90, 95, 99],
      [111, 130, 180],
      [40, 200],
    ]) {
      const { low, high } = yDomain(series, LOW, HIGH)
      expect(low, `${series}`).toBeLessThanOrEqual(Math.min(...series))
      expect(high, `${series}`).toBeGreaterThanOrEqual(Math.max(...series))
    }
  })

  it('drops a distant edge rather than flattening the price line', () => {
    // The regression this file exists for. Fitting both edges plus a price
    // that has run far away forces a domain many times the range, the earning
    // band collapses to a sliver, and the line goes flat at the exact moment
    // the screen matters most.
    const { low, high } = yDomain([180, 190, 200], LOW, HIGH)

    expect(low).toBeGreaterThan(LOW)
    expect(high - low).toBeLessThan((HIGH - LOW) * 8)
  })

  it('never returns a zero or inverted span, even for a flat series', () => {
    // A flat series divides by zero downstream, and a fixture can absolutely
    // open with two identical samples.
    const { low, high } = yDomain([105, 105], LOW, HIGH)
    expect(high).toBeGreaterThan(low)

    const degenerate = yDomain([7, 7], 7, 7)
    expect(degenerate.high).toBeGreaterThan(degenerate.low)
  })
})
