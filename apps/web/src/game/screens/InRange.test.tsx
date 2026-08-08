// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { press, renderScreen, tick } from '../../test/harness'
import { InRange } from './InRange'
import type { Pool } from '../../types/domain'

/**
 * A narrow range on purpose. SELECT walks 4 bins per press (InRange.tsx,
 * NUDGE_BINS_PER_PRESS), so a handful of presses has to be enough to clear
 * whatever range this pool's volatility produces, or test 7 below turns into
 * a timeout instead of an assertion.
 */
const POOL: Pool = {
  pairAddress: '0x1111111111111111111111111111111111111111',
  tokenX: {
    address: '0x1111111111111111111111111111111111111111',
    symbol: 'CHOG',
    decimals: 18,
  },
  tokenY: {
    address: '0x2222222222222222222222222222222222222222',
    symbol: 'USDC',
    decimals: 6,
  },
  binStep: 25,
  activeBinId: 8_388_608,
  tvlUsd: 100_000,
  volume24hUsd: 20_000,
  createdAt: 0,
  createdAtIsExact: true,
  lpConcentration: 0.1,
  realizedVol24h: 0.4,
}

function renderInRange(overrides: Partial<Parameters<typeof InRange>[0]> = {}) {
  const onWithdraw = vi.fn()
  const onRebalance = vi.fn()
  const onBack = vi.fn()

  const utils = renderScreen(
    <InRange
      pool={POOL}
      amount={100}
      width="wide"
      manualRange={null}
      autopilot
      characterId="molandak"
      onWithdraw={onWithdraw}
      onRebalance={onRebalance}
      onBack={onBack}
      {...overrides}
    />,
  )

  return { ...utils, onWithdraw, onRebalance, onBack }
}

describe('SCORE and DAMAGE, CLAUDE.md rule 2', () => {
  it('render on the same row at the same type role, and DAMAGE renders at zero', () => {
    const { container } = renderInRange()

    const score = container.querySelector('[class*="text-value"]')
    expect(score).toBeTruthy()

    // Both stats use the shared "text-value" role class. Asserting the class
    // rather than a snapshot is the point: DAMAGE must never be a smaller or
    // dimmer type role than SCORE, whatever the numbers happen to be.
    const values = [...container.querySelectorAll('[class*="text-value"]')]
    expect(values.length).toBeGreaterThanOrEqual(2)

    // DAMAGE starts at $0.00 and must still be on screen, not hidden until a
    // loss exists.
    expect(container.textContent).toContain('-$0.00')
  })

  it('renders DAMAGE in the loss tone even at zero', () => {
    // Equal weight is size AND meaning. DAMAGE cannot be `signed`, because a
    // positive-stored zero would come out as a green +$0.00, and dropping
    // `signed` to fix the glyph silently drops the loss colour with it. That
    // leaves a number the same size as SCORE and the same colour as a label,
    // which is the rule half-kept and the easiest thing to regress.
    const { container } = renderInRange()
    const damage = [
      ...container.querySelectorAll('[class*="text-value"]'),
    ].find((el) => el.textContent.startsWith('-$'))
    expect(damage?.className).toContain('text-loss')
  })
})

describe('the range is stated, not implied', () => {
  it('shows the low edge, the high edge, and the current price', () => {
    // The wireframe draws a bracket labelled "your range", which is fine on
    // paper and useless on a screen: a player cannot tell whether they are
    // near an edge without knowing what the edges ARE.
    const { getByText, container } = renderInRange()

    expect(getByText(/^Range$/i)).toBeInTheDocument()
    expect(getByText(/^Now$/i)).toBeInTheDocument()

    // Three prices, all tabular so a ticking value never shifts the row.
    const tabular = [...container.querySelectorAll('.tabular-nums')]
    expect(tabular.length).toBeGreaterThanOrEqual(3)
  })
})

describe('the face says what the numbers say', () => {
  it('is happy only in the safe middle', () => {
    // Price opens on the active bin, which is dead centre of the range.
    const { getByRole } = renderInRange()
    expect(getByRole('img', { name: /happy/ })).toBeInTheDocument()
  })

  it('stops being happy well before the warning fires', () => {
    // The bug this pins: `happy` used to be what a reduced-motion preference
    // substituted for `run`, so the Monanimal could sit there smiling while
    // price was a bin from walking off the edge. Happiness now means the
    // middle, and it ends at 0.7 proximity while `calm` runs down to 0.4, so
    // the face turns before NAD-SENSE does rather than at the same instant.
    const { queryByRole } = renderInRange()

    press('SELECT', 'SELECT', 'SELECT')

    expect(queryByRole('img', { name: /happy/ })).not.toBeInTheDocument()
  })

  it('is alert once price is near an edge, and still in range', () => {
    const { getByRole, queryByText } = renderInRange()

    press('SELECT', 'SELECT', 'SELECT', 'SELECT', 'SELECT')

    expect(getByRole('img', { name: /alert/ })).toBeInTheDocument()
    expect(queryByText(/OUT OF RANGE/)).not.toBeInTheDocument()
  })
})

describe('the out-of-range moment', () => {
  it('SELECT drives the screen out of range, and the sprite sits', () => {
    const { getByText, getByRole } = renderInRange()

    press(
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
    )

    expect(
      getByText(/OUT OF RANGE\. you stopped earning\./),
    ).toBeInTheDocument()
    expect(getByRole('img', { name: /sit/ })).toBeInTheDocument()
  })

  it('leaves SCORE unchanged while the clock keeps advancing', async () => {
    // `await`, not `return promise` inside try/finally: a returned promise
    // evaluates, then `finally` runs and restores real timers, and only then
    // does `.then` fire. The assertion would run outside the fake-timer window
    // it was written to prove something about.
    vi.useFakeTimers()
    try {
      const { getByText, container } = renderInRange()

      press(
        'SELECT',
        'SELECT',
        'SELECT',
        'SELECT',
        'SELECT',
        'SELECT',
        'SELECT',
        'SELECT',
      )
      expect(
        getByText(/OUT OF RANGE\. you stopped earning\./),
      ).toBeInTheDocument()

      const scoreBefore = container.querySelector(
        '[class*="text-value"]',
      )?.textContent

      // Ten ticks of the 500ms interval. In range this would visibly move.
      await tick(5000, vi)

      const scoreAfter = container.querySelector(
        '[class*="text-value"]',
      )?.textContent
      expect(scoreAfter).toBe(scoreBefore)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the instruments on screen while the alarm is up', () => {
    // The alarm panel used to REPLACE the status strip, which meant the one
    // moment a player most needs to know whether autopilot is even on, and how
    // long they have been out, was the one moment the screen stopped saying.
    // The alarm takes the space. It does not take the instruments.
    const { getByText } = renderInRange()

    press(
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
    )

    expect(getByText(/OUT OF RANGE/)).toBeInTheDocument()
    expect(getByText(/AUTOPILOT ON/i)).toBeInTheDocument()
    expect(getByText(/^B Withdraw$/i)).toBeInTheDocument()
    expect(getByText(/^A Recentre, costs a swap$/i)).toBeInTheDocument()
  })

  it('A calls onRebalance when out of range, and does not when in range', () => {
    const { onRebalance } = renderInRange()

    press('A')
    expect(onRebalance).not.toHaveBeenCalled()

    press(
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
    )
    press('A')
    expect(onRebalance).toHaveBeenCalledTimes(1)
  })
})

describe('withdraw', () => {
  it('B calls onWithdraw with a summary object', () => {
    const { onWithdraw } = renderInRange()
    press('B')
    expect(onWithdraw).toHaveBeenCalledTimes(1)

    // Real fields off RunSummary, not a placeholder: S8 reads these
    // directly, so a shape mismatch here would only ever show up as a wrong
    // number on the results screen rather than as a failing test.
    const summary = onWithdraw.mock.calls[0][0]
    expect(summary).toHaveProperty('timeInRangePct')
    expect(summary).toHaveProperty('netUsd')
  })

  it('A while out of range increments the rebalance count the withdrawn summary reports', () => {
    const { onWithdraw } = renderInRange()

    press(
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
      'SELECT',
    )
    press('A') // rebalance, out of range
    press('B') // withdraw

    const summary = onWithdraw.mock.calls[0][0]
    expect(summary.rebalances).toBe(1)
  })
})

/** The "Range" row's two prices, concatenated with no separator between the
 * label, the low price, "to", and the high price (textContent has no
 * whitespace between sibling elements). Parsed rather than asserted as a
 * literal string, since the exact figures depend on the pool's volatility
 * fixture and the bin maths, and this is a screen test, not a bins.ts test. */
function rangeRowText(getByText: (matcher: RegExp) => HTMLElement) {
  return getByText(/^Range$/i).parentElement?.textContent ?? ''
}

function driveOutOfRange() {
  press(
    'SELECT',
    'SELECT',
    'SELECT',
    'SELECT',
    'SELECT',
    'SELECT',
    'SELECT',
    'SELECT',
  )
}

describe('a manual rebalance actually moves the range', () => {
  // This is the exact bug: before the fix, A while out of range incremented
  // sim.rebalances and called onRebalance(), but the range's edges were still
  // `range.lowerBinId`/`upperBinId` from deposit time, so this test's first
  // assertion failed (rangeAfter === rangeBefore) against the old code.
  it('A while out of range changes the rendered low and high price', () => {
    const { getByText } = renderInRange()

    driveOutOfRange()
    const rangeBefore = rangeRowText(getByText)

    press('A')
    const rangeAfter = rangeRowText(getByText)

    expect(rangeAfter).not.toBe(rangeBefore)
  })

  it('returns the screen to calm on the very next render', () => {
    const { getByText, queryByText } = renderInRange()

    driveOutOfRange()
    expect(getByText(/OUT OF RANGE/)).toBeInTheDocument()

    press('A')

    expect(queryByText(/OUT OF RANGE/)).not.toBeInTheDocument()
    expect(getByText(/^In range$/i)).toBeInTheDocument()
  })

  it('increments the rebalance counter by exactly one for a single press', () => {
    const { onWithdraw } = renderInRange()

    driveOutOfRange()
    press('A')
    press('B')

    expect(onWithdraw.mock.calls[0][0].rebalances).toBe(1)
  })

  it('A while in range changes neither the range nor the counter', () => {
    const { getByText, onWithdraw } = renderInRange()

    const rangeBefore = rangeRowText(getByText)
    press('A')
    const rangeAfter = rangeRowText(getByText)
    expect(rangeAfter).toBe(rangeBefore)

    press('B')
    expect(onWithdraw.mock.calls[0][0].rebalances).toBe(0)
  })

  it('keeps the same plan shape (width) across a rebalance', () => {
    // The shape is bin step, bins below, and bins above (plan.ts). This
    // screen has no direct hook into RangePlan, so the shape is checked
    // through its effect: the low-to-high SPREAD, which is a pure function
    // of the shape and not of where it is anchored, must be unchanged even
    // though the low and high PRICES themselves moved.
    const { getByText } = renderInRange()

    const spreadOf = (text: string) => {
      const match = text.match(/Range([\d.]+)to([\d.]+)/)
      if (!match) throw new Error('range row did not match')
      return Number(match[2]) / Number(match[1])
    }

    const spreadBefore = spreadOf(rangeRowText(getByText))
    driveOutOfRange()
    press('A')
    const spreadAfter = spreadOf(rangeRowText(getByText))

    expect(spreadAfter).toBeCloseTo(spreadBefore, 2)
  })
})

describe('a manual range from S6 reaches this screen', () => {
  it('funds the asymmetric edges the player drew, not the symmetric WIDE/TIGHT suggestion', () => {
    // POOL.activeBinId is REFERENCE_BIN_ID, so the opening price is exactly
    // 1. planAsymmetric(-2, 20, ...) draws a lower edge 10x closer than the
    // upper edge, so the funded range should be lopsided the same way, not
    // the roughly symmetric spread the WIDE plan alone would produce.
    const { getByText } = renderInRange({
      manualRange: { lowerPct: -2, upperPct: 20 },
    })

    const match = rangeRowText(getByText).match(/Range([\d.]+)to([\d.]+)/)
    expect(match).toBeTruthy()
    const [, lowStr, highStr] = match!
    const low = Number(lowStr)
    const high = Number(highStr)

    expect(high - 1).toBeGreaterThan(5 * (1 - low))
  })
})

describe('missing data, Gate 2.4', () => {
  it('renders the defined panel, not a spinner, and B goes back', () => {
    const { getByText, onBack, queryByRole } = renderInRange({
      pool: undefined,
    })

    expect(getByText(/Position not found/i)).toBeInTheDocument()
    expect(queryByRole('progressbar')).not.toBeInTheDocument()

    press('B')
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
