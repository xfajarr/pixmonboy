import { describe, expect, it } from 'vitest'
import { nextPin, panFor, riskBand, scoreToPosition } from './map'
import type { MapPin } from './map'

describe('scoreToPosition', () => {
  it('maps SAFETY straight to X', () => {
    expect(scoreToPosition({ safety: 0, heat: 50 }).leftPct).toBe(0)
    expect(scoreToPosition({ safety: 78, heat: 50 }).leftPct).toBe(78)
    expect(scoreToPosition({ safety: 100, heat: 50 }).leftPct).toBe(100)
  })

  it('inverts HEAT for screen space, so more heat sits nearer the top', () => {
    // CSS `top` grows downward. HEAT is specified to grow upward
    // (SCREEN-DETAIL.md 8), so the highest HEAT pin needs the SMALLEST top.
    const hot = scoreToPosition({ safety: 50, heat: 100 })
    const cold = scoreToPosition({ safety: 50, heat: 0 })
    expect(hot.topPct).toBe(0)
    expect(cold.topPct).toBe(100)
    expect(hot.topPct).toBeLessThan(cold.topPct)
  })

  it('clamps to the box even if a score is somehow out of range', () => {
    expect(scoreToPosition({ safety: -5, heat: 50 }).leftPct).toBe(0)
    expect(scoreToPosition({ safety: 105, heat: 50 }).leftPct).toBe(100)
  })
})

describe('nextPin', () => {
  // Each pin varies exactly one axis from the centre, so a directional press
  // has one unambiguous winner instead of two axes fighting over who is
  // "nearest" in a straight line.
  const pins: Array<MapPin> = [
    { safety: 50, heat: 50 }, // 0: centre, the starting cursor
    { safety: 70, heat: 50 }, // 1: nearest to the right
    { safety: 95, heat: 50 }, // 2: further right, should lose to 1
    { safety: 20, heat: 50 }, // 3: nearest to the left
    { safety: 50, heat: 80 }, // 4: nearest above
    { safety: 50, heat: 20 }, // 5: nearest below
  ]

  it('moves to the nearest pin strictly beyond the current one on the pressed axis', () => {
    expect(nextPin(pins, 0, 'RIGHT')).toBe(1)
    expect(nextPin(pins, 0, 'LEFT')).toBe(3)
    expect(nextPin(pins, 0, 'UP')).toBe(4)
    expect(nextPin(pins, 0, 'DOWN')).toBe(5)
  })

  it('never wraps: with nothing further in that direction, the cursor stays put', () => {
    // Pin 2 is the rightmost pin on the map.
    expect(nextPin(pins, 2, 'RIGHT')).toBe(2)
  })

  it('picks the closer of two candidates on the same side, not the further one', () => {
    // Both 1 and 2 are to the right of pin 0. Pin 1 is closer.
    const from0 = nextPin(pins, 0, 'RIGHT')
    expect(from0).toBe(1)
    expect(from0).not.toBe(2)
  })

  it('ignores pins level with or behind the current one on that axis', () => {
    // Pin 3 (safety 20) pressing RIGHT must not select pin 0 (safety 50) by
    // accident just because it is close in HEAT; every pin with safety > 20
    // is a valid candidate and the nearest of them wins.
    expect(nextPin(pins, 3, 'RIGHT')).toBe(0)
  })

  it('stays put when the pin list is empty or the index is out of range', () => {
    expect(nextPin([], 0, 'RIGHT')).toBe(0)
    expect(nextPin(pins, 99, 'RIGHT')).toBe(99)
  })
})

describe('riskBand', () => {
  it('draws its boundaries at the tier safety floors, not at round numbers', () => {
    // 70 is EASY's floor and 30 is HARD's. A pool is coloured by which tiers
    // would even consider it, which is why the numbers are these and not 33
    // and 66.
    expect(riskBand(70)).toBe('green')
    expect(riskBand(69)).toBe('amber')
    expect(riskBand(30)).toBe('amber')
    expect(riskBand(29)).toBe('red')
  })

  it('covers the whole 0 to 100 range with no gap', () => {
    for (let s = 0; s <= 100; s++) {
      expect(['green', 'amber', 'red']).toContain(riskBand(s))
    }
  })
})

describe('panFor', () => {
  it('does not pan at all when the whole map is already visible', () => {
    expect(panFor(0, 1)).toBe(0)
    expect(panFor(50, 1)).toBe(0)
    expect(panFor(100, 1)).toBe(0)
  })

  it('centres the cursor when it is far enough from every edge', () => {
    // At 2x the window is half the map, so centring a pin at 50 needs the map
    // pulled back by 25 of its own units: 50/2 - 50.
    expect(panFor(50, 2)).toBe(-25)
  })

  it('stops at the edges rather than panning past them', () => {
    // A pin on the left coast cannot be centred without showing a strip of
    // nothing, and a rectangle of nothing reads as the map having broken.
    expect(panFor(0, 2)).toBe(0)
    expect(panFor(100, 2)).toBe(-50)
    expect(panFor(100, 3)).toBeCloseTo(-100 / 1.5, 5)
  })

  it('never returns a pan that exposes the void, at any zoom or position', () => {
    for (const zoom of [1, 2, 3]) {
      for (let pct = 0; pct <= 100; pct += 5) {
        const pan = panFor(pct, zoom)
        expect(pan).toBeLessThanOrEqual(0)
        expect(zoom * (100 + pan)).toBeGreaterThanOrEqual(100 - 1e-9)
      }
    }
  })
})
