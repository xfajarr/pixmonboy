// @vitest-environment jsdom

import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { press, renderScreen } from '../../test/harness'
import { poolPriceFromBinId, widthFromBins } from '../../lib/range/bins'
import { planForOffsets, planForWidth } from '../../lib/range/plan'
import { price } from '../../lib/format'
import { SetRange } from './SetRange'
import type { SetRangeProps } from './SetRange'
import type { ManualRange, RangeWidth } from '../../state/session'
import type { Pool } from '../../types/domain'

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

/**
 * The price the SCREEN prints, with POOL's decimals already applied.
 *
 * The expectations below used the raw `priceFromBinId` and passed for as long
 * as nothing compared them to a rendered string that had been scaled. POOL is
 * an 18-decimal token against a 6-decimal one, so raw and rendered differ by
 * 10^12: the test was asserting `2e-12` while the screen drew `2`. Binding the
 * decimals once here keeps the two definitions from drifting apart again.
 */
const poolPrice = (binId: number, binStep: number) =>
  poolPriceFromBinId(binId, binStep, POOL.tokenX.decimals, POOL.tokenY.decimals)

/**
 * SetRange is purely controlled: amount/width/autopilot come from props and
 * every change goes back out through a callback. In the real app that state
 * lives in state/session.ts. This wrapper stands in for that store, the same
 * way a route would, so a sequence of presses actually accumulates instead
 * of every press starting over from the same prop value.
 */
function renderSetRange(
  overrides: Partial<Omit<SetRangeProps, 'onConfirm' | 'onBack'>> & {
    onConfirm?: () => void
    onBack?: () => void
  } = {},
) {
  const onConfirm = vi.fn()
  const onBack = vi.fn()
  const onChangeAmount = vi.fn()
  const onChangeWidth = vi.fn()
  const onChangeManualRange = vi.fn()
  const onToggleAutopilot = vi.fn()

  const pool = 'pool' in overrides ? overrides.pool : POOL
  const balance = overrides.balance ?? 250
  const initialAmount = overrides.amount ?? 100
  const initialWidth = overrides.width ?? 'wide'
  const initialManualRange = overrides.manualRange ?? null
  const initialAutopilot = overrides.autopilot ?? true

  function Wrapper() {
    const [amount, setAmount] = useState(initialAmount)
    const [width, setWidth] = useState<RangeWidth>(initialWidth)
    const [manualRange, setManualRangeState] = useState<ManualRange | null>(
      initialManualRange,
    )
    const [autopilot, setAutopilot] = useState(initialAutopilot)

    return (
      <SetRange
        pool={pool}
        balance={balance}
        amount={amount}
        width={width}
        manualRange={manualRange}
        autopilot={autopilot}
        onChangeAmount={(next) => {
          onChangeAmount(next)
          setAmount(next)
        }}
        onChangeWidth={(next) => {
          onChangeWidth(next)
          // Mirrors session.ts's setWidth: picking a width again drops any
          // hand moved edges.
          setManualRangeState(null)
          setWidth(next)
        }}
        onChangeManualRange={(next) => {
          onChangeManualRange(next)
          setManualRangeState(next)
        }}
        onToggleAutopilot={(next) => {
          onToggleAutopilot(next)
          setAutopilot(next)
        }}
        onConfirm={overrides.onConfirm ?? onConfirm}
        onBack={overrides.onBack ?? onBack}
        deposit={overrides.deposit ?? { status: 'idle' }}
      />
    )
  }

  const utils = renderScreen(<Wrapper />)
  return {
    ...utils,
    onConfirm,
    onBack,
    onChangeAmount,
    onChangeWidth,
    onChangeManualRange,
    onToggleAutopilot,
  }
}

/** The exact text a `Value` with decimals=2 and no prefix renders. */
function valueTexts(container: HTMLElement): Array<string> {
  return [...container.querySelectorAll('[class*="text-value"]')].map(
    (el) => el.textContent,
  )
}

describe('the pair, the amount, the balance', () => {
  it('renders all three', () => {
    const { getByText, container } = renderSetRange()

    expect(getByText(/CHOG \/ USDC/i)).toBeInTheDocument()
    expect(valueTexts(container)).toContain('100.00')
    expect(getByText(/balance \$250\.00/i)).toBeInTheDocument()
  })
})

describe('the amount row', () => {
  it('RIGHT walks to the next preset, and does not confirm', () => {
    const { container, onConfirm } = renderSetRange({ amount: 10 })

    press('RIGHT')

    expect(valueTexts(container)).toContain('25.00')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('RIGHT past the last preset fine-adjusts, and never exceeds the balance', () => {
    const { container } = renderSetRange({ amount: 100, balance: 110 })

    press('RIGHT') // 100 -> 105
    expect(valueTexts(container)).toContain('105.00')

    press('RIGHT') // 105 -> 110, the ceiling
    expect(valueTexts(container)).toContain('110.00')

    press('RIGHT') // stays at the ceiling
    expect(valueTexts(container)).toContain('110.00')
    expect(valueTexts(container)).not.toContain('115.00')
  })

  it('LEFT past the first preset steps down, and never goes below 0', () => {
    const { container } = renderSetRange({ amount: 10 })

    press('LEFT') // 10 -> 5
    expect(valueTexts(container)).toContain('5.00')

    press('LEFT') // 5 -> 0
    expect(valueTexts(container)).toContain('0.00')

    press('LEFT') // stays at 0
    expect(valueTexts(container)).toContain('0.00')
  })
})

describe('the focus model', () => {
  it('DOWN moves focus to WIDTH, and LEFT/RIGHT then changes width, not amount', () => {
    const { onChangeAmount, onChangeWidth } = renderSetRange({ amount: 100 })

    press('DOWN')
    press('RIGHT')

    expect(onChangeWidth).toHaveBeenCalledWith('tight')
    expect(onChangeAmount).not.toHaveBeenCalled()
  })

  it('does not wrap past either end', () => {
    const { onChangeAmount, onChangeWidth, onToggleAutopilot } =
      renderSetRange()

    // UP from the top row: nothing above it, so LEFT still means amount.
    press('UP')
    press('LEFT')
    expect(onChangeAmount).toHaveBeenCalledTimes(1)

    // DOWN twice reaches AUTOPILOT (the bottom row); a third DOWN must not
    // wrap back to AMOUNT.
    press('DOWN', 'DOWN', 'DOWN')
    press('RIGHT')
    expect(onToggleAutopilot).toHaveBeenCalledTimes(1)
    expect(onChangeWidth).not.toHaveBeenCalled()
  })
})

describe('width drives the plan, not just the label', () => {
  it('toggling to TIGHT changes the provenance line and the bin count', () => {
    const { getByText, container } = renderSetRange()

    // The provenance line: where the tight/wide price comes from.
    expect(getByText(/vol 40% -> \+\/-/i)).toBeInTheDocument()
    const before = container.textContent.match(/(\d+) bps steps, (\d+) bins/)
    expect(before).toBeTruthy()

    press('DOWN', 'RIGHT')

    expect(getByText(/vol 40% -> \+\/-/i)).toBeInTheDocument()
    const after = container.textContent.match(/(\d+) bps steps, (\d+) bins/)
    expect(after).toBeTruthy()

    // TIGHT (k=1.0) requests a narrower range than WIDE (k=2.5) for the same
    // pool, so the achieved bin count changes too. If it did not, the picture
    // would be lying about what the width choice actually does.
    expect(after?.[0]).not.toBe(before?.[0])
  })
})

describe('the split preview', () => {
  it('sums to the amount', () => {
    const { container } = renderSetRange({ amount: 100 })

    // shadow-hard is Panel's own marker; bg-panel alone would also match an
    // unselected Chip, which sits in the same fill class by coincidence.
    const panel = container.querySelector('[class*="shadow-hard"]')
    expect(panel).toBeTruthy()

    const figures = [
      ...(panel as HTMLElement).querySelectorAll('[class*="text-value"]'),
    ].map((el) => Number(el.textContent.replace('$', '')))

    expect(figures).toHaveLength(2)
    expect(figures[0] + figures[1]).toBeCloseTo(100, 2)
  })
})

describe('autopilot', () => {
  it('toggles, and its fee copy names a percentage of earnings', () => {
    const { getByText, getByRole, onToggleAutopilot } = renderSetRange({
      autopilot: true,
    })

    expect(getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(getByText(/10% of earnings/i)).toBeInTheDocument()

    press('DOWN', 'DOWN', 'RIGHT')

    expect(onToggleAutopilot).toHaveBeenCalledWith(false)
  })
})

describe('confirm and back', () => {
  it('A calls onConfirm, B calls onBack', () => {
    const { onConfirm, onBack } = renderSetRange()

    press('A')
    expect(onConfirm).toHaveBeenCalledTimes(1)

    press('B')
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('the width row is three positions, not two', () => {
  it('RIGHT walks WIDE to TIGHT to MANUAL, and MANUAL applies nothing', () => {
    const { onChangeWidth, onChangeManualRange } = renderSetRange({
      width: 'wide',
    })

    press('DOWN') // focus the width row
    press('RIGHT')
    expect(onChangeWidth).toHaveBeenCalledWith('tight')

    press('RIGHT') // onto MANUAL
    // Landing on MANUAL must not change the funded range. WIDE and TIGHT
    // apply on arrival because they are cheap and reversible; MANUAL opens an
    // overlay, which is neither, so it waits for A.
    expect(onChangeWidth).toHaveBeenCalledTimes(1)
    expect(onChangeManualRange).not.toHaveBeenCalled()
  })

  it('does not wrap past MANUAL, and does not wrap past WIDE', () => {
    const { onChangeWidth } = renderSetRange({ width: 'wide' })

    press('DOWN')
    press('RIGHT', 'RIGHT', 'RIGHT', 'RIGHT') // two real steps, then two no-ops
    expect(onChangeWidth).toHaveBeenCalledTimes(1)

    press('LEFT', 'LEFT') // manual -> tight -> wide
    expect(onChangeWidth).toHaveBeenLastCalledWith('wide')
    press('LEFT') // no wrap round to MANUAL
    expect(onChangeWidth).toHaveBeenCalledTimes(3)
  })

  it('A on MANUAL opens the editor instead of confirming', () => {
    const { getByText, queryByText, onConfirm } = renderSetRange()

    press('DOWN', 'RIGHT', 'RIGHT') // width row, cursor on MANUAL
    expect(queryByText(/manual range/i)).not.toBeInTheDocument()

    press('A')

    expect(getByText(/manual range/i)).toBeInTheDocument()
    // The whole reason the footer rewrites itself. If A ever confirms from
    // here, a player funds a position they meant to edit.
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('the footer says which of the two things A does right now', () => {
    const { getByText, queryByText } = renderSetRange()

    expect(getByText(/A confirm/i)).toBeInTheDocument()
    expect(queryByText(/A edit range/i)).not.toBeInTheDocument()

    press('DOWN', 'RIGHT', 'RIGHT') // cursor onto MANUAL

    expect(getByText(/A edit range/i)).toBeInTheDocument()
    expect(queryByText(/A confirm/i)).not.toBeInTheDocument()
  })

  it('A still confirms from every other position on the width row', () => {
    const { onConfirm } = renderSetRange()

    press('DOWN', 'RIGHT') // width row, cursor on TIGHT
    press('A')

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('cancelling out of the editor leaves MANUAL cursored but not applied', () => {
    const { getByText, queryByText, onChangeManualRange } = renderSetRange()

    press('DOWN', 'RIGHT', 'RIGHT', 'A') // open the editor from MANUAL
    press('B') // cancel

    expect(onChangeManualRange).not.toHaveBeenCalled()
    expect(queryByText(/manual range/i)).not.toBeInTheDocument()
    // Still the cursor, so A here still means EDIT rather than CONFIRM. The
    // player walked onto MANUAL and backed out of the overlay; they did not
    // walk off the chip.
    expect(getByText(/A edit range/i)).toBeInTheDocument()
    // And still not applied: the width caption keeps crediting the pool.
    expect(getByText(/vol 40% ->/)).toBeInTheDocument()
  })
})

describe('the manual range editor', () => {
  const basePlan = planForWidth(POOL, 'wide')
  // The exact formula ManualRangeEditor seeds from: the ACHIEVED half widths
  // of the plan already on screen, rounded to a whole percent.
  const seededLowerPct = -Math.round(
    widthFromBins(basePlan.plan.binsBelow, basePlan.plan.binStep),
  )
  const seededUpperPct = Math.round(
    widthFromBins(basePlan.plan.binsAbove, basePlan.plan.binStep),
  )

  it('SELECT opens the editor, replacing the old unbuilt no-op', () => {
    const { getByText, queryByText } = renderSetRange()

    expect(queryByText(/manual range/i)).not.toBeInTheDocument()
    press('SELECT')
    expect(getByText(/manual range/i)).toBeInTheDocument()
  })

  it("opens seeded at the current WIDE plan's edges", () => {
    const { container } = renderSetRange()

    const beforeLow = price(poolPrice(basePlan.lowerBinId, POOL.binStep))
    const beforeHigh = price(poolPrice(basePlan.upperBinId, POOL.binStep))
    expect(container.textContent).toContain(beforeLow)
    expect(container.textContent).toContain(beforeHigh)

    press('SELECT')

    // The editor reconstructs its own preview plan from the rounded seed
    // percentages, so it is compared against a plan built the same way
    // rather than assumed to be byte-identical to the WIDE plan's own edges.
    const seededPlan = planForOffsets(POOL, {
      lowerPct: seededLowerPct,
      upperPct: seededUpperPct,
    })
    const afterLow = price(poolPrice(seededPlan.lowerBinId, POOL.binStep))
    const afterHigh = price(poolPrice(seededPlan.upperBinId, POOL.binStep))
    expect(container.textContent).toContain(afterLow)
    expect(container.textContent).toContain(afterHigh)
  })

  it('LEFT on the seeded START row widens the low price and the strip', () => {
    const { container } = renderSetRange()
    press('SELECT')

    const beforePlan = planForOffsets(POOL, {
      lowerPct: seededLowerPct,
      upperPct: seededUpperPct,
    })
    const beforeLow = price(poolPrice(beforePlan.lowerBinId, POOL.binStep))
    // The overlay renders after the base screen in DOM order (it is the
    // last child appended to the root), so the LAST match of this pattern
    // in the full text is the editor's own bins row, not the base screen's.
    const beforeBins = lastMatch(
      container.textContent,
      /\d+ bps steps, \d+ bins/g,
    )

    press('LEFT') // START is focused by default on open

    const afterPlan = planForOffsets(POOL, {
      lowerPct: START_STEP_DOWN(seededLowerPct),
      upperPct: seededUpperPct,
    })
    const afterLow = price(poolPrice(afterPlan.lowerBinId, POOL.binStep))
    const afterBins = lastMatch(
      container.textContent,
      /\d+ bps steps, \d+ bins/g,
    )

    // The base screen stays mounted under the overlay (only its own
    // useConsoleIntent is guarded off, not its DOM), so this checks the
    // NEW price appears rather than that the old one vanished.
    expect(afterLow).not.toBe(beforeLow)
    expect(container.textContent).toContain(afterLow)
    expect(afterBins).not.toBe(beforeBins)
  })

  it('A applies the walked range and closes the overlay', () => {
    const { container, queryByText, onChangeManualRange } = renderSetRange()
    press('SELECT')
    press('LEFT') // widen START by one preset step

    press('A')

    expect(onChangeManualRange).toHaveBeenCalledTimes(1)
    const applied = onChangeManualRange.mock.calls[0][0] as ManualRange
    expect(applied.lowerPct).toBeLessThan(seededLowerPct)
    expect(applied.upperPct).toBe(seededUpperPct)
    expect(queryByText(/manual range/i)).not.toBeInTheDocument()
    // The width caption stops crediting the pool's volatility and prints the
    // player's own edges instead, which is the base screen saying out loud
    // that the funded range is no longer the suggestion.
    expect(container.textContent).toContain(
      `manual  ${applied.lowerPct}% / +${applied.upperPct}%`,
    )
  })

  it('B cancels without calling onChangeManualRange', () => {
    const { queryByText, onChangeManualRange } = renderSetRange()
    press('SELECT')
    press('LEFT')

    press('B')

    expect(onChangeManualRange).not.toHaveBeenCalled()
    expect(queryByText(/manual range/i)).not.toBeInTheDocument()
  })

  it('SELECT inside the editor resets to the suggestion, with null', () => {
    const { onChangeManualRange } = renderSetRange({
      manualRange: { lowerPct: -12, upperPct: 9 },
    })
    press('SELECT')

    press('SELECT')

    expect(onChangeManualRange).toHaveBeenCalledWith(null)
  })

  it('A while the overlay is open does not reach onConfirm underneath it', () => {
    const { onConfirm } = renderSetRange()
    press('SELECT')

    press('A')

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('walking both rows hard against both stops still renders, never throws', () => {
    const { container, getByText } = renderSetRange()
    press('SELECT')

    // START hard against its floor, then its ceiling.
    for (let i = 0; i < 100; i += 1) press('LEFT')
    for (let i = 0; i < 200; i += 1) press('RIGHT')
    // END hard against its floor, then its ceiling.
    press('DOWN')
    for (let i = 0; i < 200; i += 1) press('LEFT')
    for (let i = 0; i < 500; i += 1) press('RIGHT')

    // No RangeError reached render (it would have thrown out of `press`
    // above), and the overlay is still a real screen, not a blank one.
    expect(getByText(/manual range/i)).toBeInTheDocument()
    expect(container.textContent.length).toBeGreaterThan(0)
  })

  it('the width caption swaps the vol derivation for the hand moved edges', () => {
    // One caption slot, two things it can say, and it must never say the
    // wrong one. A manual range is the PLAYER's number; leaving it under a
    // "vol 40% ->" label would credit it to the pool's volatility.
    const { getByText, queryByText } = renderSetRange({
      manualRange: { lowerPct: -12, upperPct: 9 },
    })

    expect(getByText(/manual\s+-12% \/ \+9%/)).toBeInTheDocument()
    expect(queryByText(/vol 40% ->/)).not.toBeInTheDocument()
  })
})

/** The last regex match in a string, for text that appears once on the base
 * screen and again inside the overlay stacked on top of it. */
function lastMatch(text: string, pattern: RegExp): string | undefined {
  return [...text.matchAll(pattern)].at(-1)?.[0]
}

/** Mirrors ManualRangeEditor's own START step, for the one assertion above
 * that needs to predict where a single LEFT press lands. */
function START_STEP_DOWN(current: number): number {
  const presets = [-25, -15, -10, -5]
  const idx = presets.indexOf(current)
  if (idx > 0) return presets[idx - 1]
  return Math.max(current - 1, -90)
}

describe('missing data, Gate 2.4', () => {
  it('renders the not-found panel, not a throw, and B still goes back', () => {
    const { getByText, onBack, queryByRole } = renderSetRange({
      pool: undefined,
    })

    expect(getByText(/pool not found/i)).toBeInTheDocument()
    expect(queryByRole('progressbar')).not.toBeInTheDocument()

    press('B')
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
