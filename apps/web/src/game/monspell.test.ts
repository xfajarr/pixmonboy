import { describe, expect, it } from 'vitest'
import {
  approachPriceY,
  decideRound,
  nextStreak,
  roundWindow,
  summarizeRound,
  WINDOW_HALF,
} from './monspell'

describe('decideRound', () => {
  it.each([
    ['up', 1.0, 1.01, 'win'],
    ['up', 1.0, 0.99, 'lose'],
    ['down', 1.0, 0.99, 'win'],
    ['down', 1.0, 1.01, 'lose'],
  ] as const)('call %s from %s to %s is a %s', (call, startUsd, endUsd, outcome) => {
    expect(decideRound({ call, startUsd, endUsd })).toBe(outcome)
  })

  it('a price that did not move is a draw, not a win or a loss', () => {
    expect(decideRound({ call: 'up', startUsd: 0.0207, endUsd: 0.0207 })).toBe(
      'draw',
    )
  })

  it('treats movement smaller than display noise as a draw', () => {
    // The price is displayed to 5 places. A delta of 0.0000004 is invisible
    // on the screen and must not decide the round.
    expect(
      decideRound({ call: 'up', startUsd: 0.0207000, endUsd: 0.0207004 }),
    ).toBe('draw')
  })
})

describe('summarizeRound', () => {
  it('reports the signed delta and both prices', () => {
    const result = summarizeRound({ call: 'up', startUsd: 1, endUsd: 1.05 })
    expect(result.outcome).toBe('win')
    expect(result.startUsd).toBe(1)
    expect(result.endUsd).toBe(1.05)
    // 1.05 - 1 is 0.050000000000000044 in binary floating point, which is
    // correct but would make a toEqual fail on a number nobody will read.
    expect(result.deltaUsd).toBeCloseTo(0.05, 12)
  })
})

describe('nextStreak', () => {
  it('grows on a win', () => {
    expect(nextStreak(2, 'win')).toBe(3)
  })

  it('survives a draw, because a draw is not a loss', () => {
    expect(nextStreak(2, 'draw')).toBe(2)
  })

  it('resets to zero on a loss', () => {
    expect(nextStreak(2, 'lose')).toBe(0)
  })
})

describe('approachPriceY', () => {
  it('moves a tenth of the remaining distance each frame', () => {
    expect(approachPriceY(100, 200, 0.1)).toBe(110)
  })

  it('moves down too, so the character falls when price falls', () => {
    expect(approachPriceY(200, 100, 0.1)).toBe(190)
  })

  it('converges but never overshoots', () => {
    let y = 100
    for (let i = 0; i < 1000; i += 1) y = approachPriceY(y, 200, 0.1)
    expect(y).toBeCloseTo(200, 6)
    expect(y).toBeLessThan(200)
  })
})

describe('roundWindow', () => {
  it('centres on the opening price and contains the jail line', () => {
    const window = roundWindow(1, WINDOW_HALF)
    expect(window.low).toBeCloseTo(0.9995, 6)
    expect(window.high).toBeCloseTo(1.0005, 6)
    // The jail line IS the entry price, which sits at the window centre.
    expect(1).toBeGreaterThan(window.low)
    expect(1).toBeLessThan(window.high)
  })
})
