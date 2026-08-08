import { describe, expect, it } from 'vitest'
import { yForPrice } from './MonspellChart'

describe('yForPrice, the monster height', () => {
  const win = { low: 0.020, high: 0.021 }

  it('maps a higher price to a higher position (smaller y)', () => {
    const lowPrice = yForPrice(0.020, win) // bottom of the window
    const highPrice = yForPrice(0.021, win) // top of the window
    expect(highPrice).toBeLessThan(lowPrice)
  })

  it('maps the top of the window above the bottom of the window', () => {
    const bottom = yForPrice(win.low, win)
    const top = yForPrice(win.high, win)
    expect(top).toBeLessThan(bottom)
    // Both edges stay inside the field: the mapping is centred on the
    // window midpoint, not pushed past either edge.
    expect(top).toBeGreaterThanOrEqual(0)
    expect(bottom).toBeLessThanOrEqual(168)
  })

  it('with a FIXED window, two different prices sit at two different heights', () => {
    // This is the bug that made the monster appear frozen: if the window
    // re-centres on the current price each tick, every price maps back to the
    // middle and the character never moves. A fixed window must NOT.
    const a = yForPrice(0.0204, win)
    const b = yForPrice(0.0206, win)
    expect(a).not.toBe(b)
  })

  it('maps the midpoint of the window to the field middle', () => {
    const mid = (win.low + win.high) / 2
    expect(yForPrice(mid, win)).toBeCloseTo(84, 1)
  })
})
