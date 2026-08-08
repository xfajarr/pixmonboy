// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
// `fireEvent`, not `element.click()`: a raw DOM click dispatches the event but
// is not wrapped in `act`, so React never flushes the state update and the
// assertion reads the pre-click render.
import { fireEvent } from '@testing-library/react'
import { press, renderScreen } from '../../test/harness'
import { PoolTracker } from './PoolTracker'
// The real gate set, not a local literal: the shaded region on the map is
// drawn from these two numbers, so a test asserting the region has to be
// reading the same source the screen reads or it asserts nothing.
import { fixtureGates } from '../fixtures'
import type { ScoredPool } from '../fixtures'
import type { GateFailure } from '../../lib/scoring/gates'
import type { Pool, PoolScore } from '../../types/domain'

/**
 * Local fixtures, not the committed `data/pools.fixture.json`: this file
 * tests what the SCREEN does with a `ScoredPool[]`, and a screen test that
 * depended on the real snapshot would break every time that snapshot is
 * re-tuned for the map's spread, which is exactly the coupling
 * `game/fixtures.ts` exists to prevent. InRange.test.tsx sets the same
 * precedent with its own local `POOL`.
 */
function pool(overrides: Partial<Pool> = {}): Pool {
  return {
    pairAddress: '0x1111111111111111111111111111111111111111',
    tokenX: {
      address: '0x1111111111111111111111111111111111111111',
      symbol: 'AAA',
      decimals: 18,
    },
    tokenY: {
      address: '0x2222222222222222222222222222222222222222',
      symbol: 'USDC',
      decimals: 6,
    },
    binStep: 25,
    activeBinId: 8_388_608,
    tvlUsd: 400_000,
    volume24hUsd: 90_000,
    createdAt: 1_753_000_000,
    createdAtIsExact: true,
    lpConcentration: 0.3,
    realizedVol24h: 0.5,
    ...overrides,
  }
}

function score(overrides: Partial<PoolScore> = {}): PoolScore {
  return {
    pairAddress: '0x1111111111111111111111111111111111111111',
    safety: 80,
    heat: 30,
    liquidityDepth: 70,
    poolAge: 90,
    quoteQuality: 100,
    lpConcentrationScore: 60,
    realizedVol: 20,
    turnover: 40,
    momentum: 50,
    honeypotClean: true,
    momentumDegraded: false,
    ...overrides,
  }
}

function scoredPool(overrides: {
  pool?: Partial<Pool>
  score?: Partial<PoolScore>
  failures?: Array<GateFailure>
  passes?: boolean
}): ScoredPool {
  const failures = overrides.failures ?? []
  return {
    pool: pool(overrides.pool),
    score: score(overrides.score),
    gates: { passed: failures.length === 0, failures, unverified: [] },
    passes: overrides.passes ?? failures.length === 0,
  }
}

// index 0: the starting cursor. Passes, low HEAT, low-ish SAFETY so pressing
// RIGHT has exactly one pool beyond it.
const PASSING_LOW = scoredPool({
  pool: {
    pairAddress: '0xaaaa',
    tokenX: { address: '0xaaaa', symbol: 'AAA', decimals: 18 },
    tokenY: {
      address: '0x2222222222222222222222222222222222222222',
      symbol: 'USDC',
      decimals: 6,
    },
  },
  score: { safety: 30, heat: 40, momentumDegraded: false },
  passes: true,
})

// index 1: filtered out on TWO gates, momentum degraded. Highest SAFETY, so a
// single RIGHT press from index 0 lands here unambiguously.
const FILTERED_DEGRADED = scoredPool({
  pool: {
    pairAddress: '0xbbbb',
    tokenX: { address: '0xbbbb', symbol: 'BBB', decimals: 18 },
    tokenY: {
      address: '0x2222222222222222222222222222222222222222',
      symbol: 'USDC',
      decimals: 6,
    },
  },
  score: { safety: 80, heat: 85, momentumDegraded: true },
  failures: ['tvl-too-low', 'safety-too-low'],
})

// index 2: passes, just so the map has a pool the header's PASSED count has
// to actually count, and the on-screen-vs-passing distinction means something.
const PASSING_FILLER = scoredPool({
  pool: {
    pairAddress: '0xcccc',
    tokenX: { address: '0xcccc', symbol: 'CCC', decimals: 18 },
    tokenY: {
      address: '0x2222222222222222222222222222222222222222',
      symbol: 'USDC',
      decimals: 6,
    },
  },
  score: { safety: 10, heat: 10 },
  passes: true,
})

const THREE_POOLS = [PASSING_LOW, FILTERED_DEGRADED, PASSING_FILLER]

function renderTracker(
  overrides: Partial<Parameters<typeof PoolTracker>[0]> = {},
) {
  const onPlayPool = vi.fn()
  const onBack = vi.fn()
  const utils = renderScreen(
    <PoolTracker
      pools={THREE_POOLS}
      characterId="molandak"
      gates={fixtureGates('easy')}
      onPlayPool={onPlayPool}
      onBack={onBack}
      {...overrides}
    />,
  )
  return { ...utils, onPlayPool, onBack }
}

describe('the map draws the filter working', () => {
  it('renders every pool, filtered-out included, not just the passing ones', () => {
    const { container } = renderTracker()
    // Every Pin is `role="img"`; nothing else on the map view claims that
    // role, so this counts pins, not text nodes.
    expect(container.querySelectorAll('[role="img"]').length).toBe(
      THREE_POOLS.length + 4,
    )
    // +4: the legend draws one pin per risk band, plus a filtered one to show
    // what this tier skipped. Counted here rather than hidden behind a magic
    // number below.
  })

  it('the header PASSED count matches the pools actually marked passes, not the total', () => {
    const { getByText } = renderTracker()
    expect(getByText(/2 passed/i)).toBeInTheDocument()
  })
})

describe('inspecting a pool', () => {
  it('A opens the inspect panel for the selected pool', () => {
    const { getByText } = renderTracker()
    press('A')
    expect(getByText(/AAA \/ USDC/)).toBeInTheDocument()
  })

  it('shows all seven score terms, the whole claim of the screen', () => {
    const { getByText } = renderTracker()
    press('A')
    expect(getByText(/depth 70/)).toBeInTheDocument()
    expect(getByText(/age 90/)).toBeInTheDocument()
    expect(getByText(/pair 100/)).toBeInTheDocument()
    expect(getByText(/spread 60/)).toBeInTheDocument()
    expect(getByText(/swing 20/)).toBeInTheDocument()
    expect(getByText(/trade 40/)).toBeInTheDocument()
    expect(getByText(/buzz 50/)).toBeInTheDocument()
  })

  it('states fee income is an estimate, permanently, next to the number', () => {
    const { getByText } = renderTracker()
    press('A')
    expect(getByText(/% \/ yr/)).toBeInTheDocument()
    expect(getByText(/estimate, not a promise/)).toBeInTheDocument()
  })

  it('renders "offline" next to buzz for a pool with no momentum entry', () => {
    const { getByText } = renderTracker()
    press('RIGHT') // 0 (safety 30) -> 1 (safety 80, the only pool beyond it)
    press('A')
    expect(getByText(/BBB \/ USDC/)).toBeInTheDocument()
    expect(getByText(/buzz 50 \(offline\)/)).toBeInTheDocument()
  })

  it('lists every gate failure for a filtered pool, not just the first', () => {
    const { getByText } = renderTracker()
    press('RIGHT')
    press('A')
    expect(
      getByText(/Not enough liquidity for this difficulty/),
    ).toBeInTheDocument()
    expect(getByText(/Safety below this difficulty floor/)).toBeInTheDocument()
  })

  it('B returns to the map, not to onBack', () => {
    const { getByText, queryByText, onBack } = renderTracker()
    press('A')
    expect(getByText(/AAA \/ USDC/)).toBeInTheDocument()
    press('B')
    expect(queryByText(/AAA \/ USDC/)).not.toBeInTheDocument()
    expect(onBack).not.toHaveBeenCalled()
  })
})

describe('leaving the map', () => {
  it('B calls onBack', () => {
    const { onBack } = renderTracker()
    press('B')
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('missing data, Gate 2.4', () => {
  it('zero passing pools renders the defined empty state, not a spinner', () => {
    const { getByText, onBack, queryByRole } = renderTracker({
      pools: [scoredPool({ failures: ['tvl-too-low'] })],
    })

    expect(getByText(/Nothing passed/i)).toBeInTheDocument()
    expect(queryByRole('progressbar')).not.toBeInTheDocument()

    press('B')
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

/**
 * The map used to be a white box with dots on it. Every assertion below covers
 * one of the things that were missing from it, and each one is checked against
 * the real `GateSet` rather than a literal, so re-tuning a tier moves the test
 * and the screen together.
 */
describe('the field states the rule it is judging pools by', () => {
  it('draws the passing region from the gate set, not from a hard-coded box', () => {
    const gates = fixtureGates('easy')
    const { container } = renderTracker({ gates })

    // Score space is the SVG's coordinate space, so the rectangle's own
    // attributes are readable as SAFETY and HEAT with no conversion. Y is
    // inverted because heat increases upward and `y` grows downward, which is
    // the one line of this screen that is easy to get backwards and invisible
    // in a screenshot when you do.
    const region = container.querySelector(
      `rect[x="${gates.minSafety}"][height="${gates.maxHeat}"]`,
    )
    expect(region).not.toBeNull()
    expect(region?.getAttribute('y')).toBe(String(100 - gates.maxHeat))
    expect(region?.getAttribute('width')).toBe(String(100 - gates.minSafety))
  })

  it('colours each pin by its safety band, and never by the tier it is on', () => {
    // PASSING_LOW is safety 30 (amber), FILTERED_DEGRADED 80 (green),
    // PASSING_FILLER 10 (red). The bands are the tier FLOORS, so a pool is
    // the same colour whichever difficulty a player reaches it from, which is
    // the whole reason `riskBand` takes a score and not a GateSet.
    const { container } = renderTracker()
    const labels = Array.from(container.querySelectorAll('[role="img"]')).map(
      (el) => el.getAttribute('aria-label'),
    )

    expect(labels).toContain('amber')
    expect(labels).toContain('green filtered')
    expect(labels).toContain('red')
  })

  it('moves the region when the tier does', () => {
    const easy = fixtureGates('easy')
    const hard = fixtureGates('hard')
    // Guards the test itself: if two tiers ever share both thresholds, the
    // assertion below would pass while proving nothing.
    expect(easy.minSafety).not.toBe(hard.minSafety)

    const { container } = renderTracker({ gates: hard })
    expect(container.querySelector(`rect[x="${easy.minSafety}"]`)).toBeNull()
    expect(
      container.querySelector(`rect[x="${hard.minSafety}"]`),
    ).not.toBeNull()
  })
})

/** Selection is a state of the pin now, not a box parked next to it. The old
 * cursor was a black square standing 8px off the glyph, and at map density it
 * read as a second object rather than as "this one". */
const selectedRings = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('circle')).filter(
    (c) => c.getAttribute('stroke-width') === '3',
  )

describe('the cursor is a state of the pin', () => {
  it('marks exactly one pin, and moving the cursor moves the mark', () => {
    const { container } = renderTracker()

    expect(selectedRings(container).length).toBe(1)
    const before = selectedRings(container)[0].closest('div')

    // PASSING_LOW sits at safety 30; PASSING_FILLER at 10. LEFT is the one
    // direction with somewhere to go from the starting pin.
    press('LEFT')
    expect(selectedRings(container).length).toBe(1)
    expect(selectedRings(container)[0].closest('div')).not.toBe(before)
  })

  it('names only the selected pool, because fourteen labels is a list', () => {
    // The label is the PAIR and its size now, not `tokenX` alone. On the real
    // pool set three pools are the same token against the same stable and
    // differ only by bin step, so `tokenX` named nothing; TVL is what actually
    // tells them apart and money is a unit every player already reads.
    const { getAllByText } = renderTracker()
    expect(getAllByText(/AAA\/USDC/).length).toBe(1)
    press('LEFT')
    expect(getAllByText(/CCC\/USDC/).length).toBe(1)
  })
})

describe('the list view', () => {
  it('SELECT swaps the map for a list and back', () => {
    const { queryByText, getByText } = renderTracker()

    // The map names only the pool under the cursor; the list names all of them,
    // which is the whole reason it exists.
    expect(queryByText(/CCC\/USDC/)).not.toBeInTheDocument()

    press('SELECT')
    expect(getByText(/AAA\/USDC/)).toBeInTheDocument()
    expect(getByText(/CCC\/USDC/)).toBeInTheDocument()

    press('SELECT')
    expect(queryByText(/CCC\/USDC/)).not.toBeInTheDocument()
  })

  it('puts the pools a player can open at the top', () => {
    const { container } = renderTracker()
    press('SELECT')

    const rows = [...container.querySelectorAll('button[type="button"]')]
    // `upper` is a CSS text-transform, so textContent keeps the source casing.
    const states = rows.map((r) =>
      /skipped/i.test(r.textContent) ? 'skipped' : 'open',
    )

    // Sorted by usefulness rather than by score: every openable pool before
    // every skipped one. A player scanning from the top reaches something they
    // can actually play first.
    expect(states.indexOf('skipped')).toBeGreaterThan(-1)
    expect(states.lastIndexOf('open')).toBeLessThan(states.indexOf('skipped'))
  })

  it('A from the list inspects, and B returns to the list rather than the map', () => {
    const { getByText, queryByText } = renderTracker()
    press('SELECT')
    press('A')

    // The inspect panel, reached from the list.
    expect(getByText(/B Back to map/i)).toBeInTheDocument()

    press('B')
    // Back in the LIST, not the map: every pool is named again.
    expect(queryByText(/CCC\/USDC/)).toBeInTheDocument()
  })
})

describe('where the cursor starts', () => {
  it('lands on a pool the tier can actually open', () => {
    // It used to start at index 0, whichever pool the snapshot happened to sort
    // first. On the real set that is a pool the gates reject, so the first
    // thing a new player saw was a dim pin above a locked button.
    const failing = scoredPool({
      pool: {
        pairAddress: '0xdead',
        tokenX: { address: '0xdead', symbol: 'BAD', decimals: 18 },
        tokenY: {
          address: '0x2222222222222222222222222222222222222222',
          symbol: 'USDC',
          decimals: 6,
        },
      },
      failures: ['safety-too-low'],
    })

    const { getByText } = renderTracker({ pools: [failing, PASSING_LOW] })

    // PASSING_LOW is the only openable pool, so the cursor must be on it.
    expect(getByText(/AAA\/USDC/)).toBeInTheDocument()
  })
})

describe('the radar has something in it', () => {
  it('plots every pool as a minimap dot, not an empty sweeping circle', () => {
    const { container } = renderTracker()
    const minimap = container.querySelector('.radar-sweep-hand')?.parentElement

    // One dot per pool. The sweep stays, behind them, because it is what makes
    // the thing look alive; what it never was is informative.
    expect(minimap?.querySelectorAll('span').length).toBe(
      THREE_POOLS.length + 1,
    )
  })

  it('shows the viewport rectangle only once there is a viewport to show', () => {
    const { container } = renderTracker()
    const box = () =>
      container
        .querySelector('.radar-sweep-hand')
        ?.parentElement?.querySelector('.border-ink')

    expect(box()).toBeNull()
    press('SELECT')
    expect(box()).not.toBeNull()
  })
})

describe('zoom', () => {
  // SELECT used to cycle the zoom and now opens the LIST, so the two buttons
  // below the plot are the whole zoom control. That is a deliberate trade: a
  // list separates overlapping pools better than 3x ever did, and the zoom
  // never lost a control it did not already have a bigger version of.
  const zoomIn = (utils: ReturnType<typeof renderTracker>) =>
    fireEvent.click(utils.getByLabelText('Zoom in'))

  it('steps up through the levels and stops at 3x', () => {
    const utils = renderTracker()

    expect(utils.getByText('1x')).toBeInTheDocument()
    zoomIn(utils)
    expect(utils.getByText('2x')).toBeInTheDocument()
    zoomIn(utils)
    expect(utils.getByText('3x')).toBeInTheDocument()
    zoomIn(utils)
    expect(utils.getByText('3x')).toBeInTheDocument()
  })

  it('cancels itself on the pins, so zooming separates them without fattening them', () => {
    const utils = renderTracker()
    const pinBox = () =>
      utils.container.querySelector('[role="img"]')?.parentElement

    expect(pinBox()?.getAttribute('style')).toContain('scale(1)')
    zoomIn(utils)
    expect(pinBox()?.getAttribute('style')).toContain('scale(0.5)')
  })
})

describe('the worst pool still shows its controls', () => {
  it('keeps the footer on screen when a pool fails every gate', () => {
    // Five failures is 70px this panel never budgeted for, and it used to
    // push the Monanimal and BOTH button labels off the bottom of a screen
    // that cannot scroll. The controls disappeared on the one pool that most
    // needed explaining.
    const { getByText } = renderTracker({
      pools: [
        scoredPool({
          score: { safety: 7, heat: 95 },
          failures: [
            'tvl-too-low',
            'too-new',
            'quote-not-allowed',
            'safety-too-low',
            'heat-too-high',
          ],
        }),
        PASSING_LOW,
      ],
    })
    // The cursor starts on the best pool that PASSES, so the worst one is a
    // press away rather than under the cursor. That is the point of the new
    // starting position and it is why this test moves before it inspects.
    press('LEFT')
    press('A')

    expect(getByText(/Too hot for this difficulty/)).toBeInTheDocument()
    expect(getByText(/Locked by the checks above/i)).toBeInTheDocument()
    expect(getByText(/B Back to map/i)).toBeInTheDocument()
  })

  it('absorbs the overflow in the failure list, not in the footer', () => {
    const { container } = renderTracker({
      pools: [
        scoredPool({ failures: ['tvl-too-low', 'too-new', 'honeypot'] }),
        PASSING_LOW,
      ],
    })
    press('LEFT')
    press('A')

    // `min-h-0 flex-1` is what lets a flex child actually shrink. Without it
    // the box keeps its content height and shoves everything below it off.
    const region = container.querySelector('.min-h-0.flex-1')
    expect(region).not.toBeNull()
    expect(region?.querySelector('.bg-sunk')).not.toBeNull()
  })
})

describe('zoom is reachable by tap as well as by button', () => {
  it('the on-screen controls step the same zoom SELECT cycles', () => {
    const { getByLabelText, getByText } = renderTracker()

    expect(getByText('1x')).toBeInTheDocument()
    fireEvent.click(getByLabelText('Zoom in'))
    expect(getByText('2x')).toBeInTheDocument()
    fireEvent.click(getByLabelText('Zoom out'))
    expect(getByText('1x')).toBeInTheDocument()
  })

  it('clamps at both ends rather than wrapping, unlike SELECT', () => {
    const { getByLabelText, getByText } = renderTracker()

    // A button that wraps 3x back to 1x reads as a broken button; a cycle on
    // a single console key does not, because there is nowhere else to press.
    expect(getByLabelText('Zoom out')).toBeDisabled()
    fireEvent.click(getByLabelText('Zoom in'))
    fireEvent.click(getByLabelText('Zoom in'))
    expect(getByText('3x')).toBeInTheDocument()
    expect(getByLabelText('Zoom in')).toBeDisabled()
  })
})

describe('the inspect panel says who is talking', () => {
  it('puts the Monanimal next to its own line', () => {
    const { getByText, container } = renderTracker()
    press('A')

    expect(getByText(/deep, old, boring/)).toBeInTheDocument()
    // The sprite is the character, idling. A quote with nobody attached to it
    // is a fortune cookie.
    expect(container.querySelector('.sprite-pair')).not.toBeNull()
  })
})
