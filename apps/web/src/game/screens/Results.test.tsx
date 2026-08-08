// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { press, renderScreen } from '../../test/harness'
import { Results } from './Results'
import type { RunSummary } from '../sim'
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

/** A run that clears STRONG_TIME_IN_RANGE_PCT, so the default render picks
 * the `happy` / "strong" branch and tests that want the other branches have
 * to say so explicitly. */
const RUN: RunSummary = {
  feesEarnedUsd: 1.42,
  damageUsd: 0.38,
  netUsd: 1.04,
  timeInRangePct: 84,
  rebalances: 2,
  bestStreakSeconds: 3_720,
  elapsedSeconds: 4_000,
}

function renderResults(overrides: Partial<Parameters<typeof Results>[0]> = {}) {
  const onBackToDisks = vi.fn()
  const onSaveRun = vi.fn()

  const utils = renderScreen(
    <Results
      pool={POOL}
      run={RUN}
      characterId="molandak"
      autopilot
      save={{ status: 'idle' }}
      onSaveRun={onSaveRun}
      onBackToDisks={onBackToDisks}
      {...overrides}
    />,
  )

  return { ...utils, onBackToDisks, onSaveRun }
}

describe('the money block, CLAUDE.md rule 2', () => {
  it('renders fees, damage, and net, and net is fees minus damage', () => {
    const { getByText } = renderResults()

    expect(getByText('+$1.42')).toBeInTheDocument()
    expect(getByText('-$0.38')).toBeInTheDocument()
    // 1.42 - 0.38 = 1.04, the exact RunSummary field, not recomputed here.
    expect(getByText('+$1.04')).toBeInTheDocument()
  })

  it('renders DAMAGE with a minus sign and the loss tone even though the stored value is positive', () => {
    // This is the assertion most likely to catch a careless refactor: swap
    // `tone="loss"` for `signed` and this still shows a minus (damageUsd is
    // stored positive, so `signed` would flip it to a green plus) but the
    // colour class is what actually proves rule 2 rather than half-keeping it.
    const { container, getByText } = renderResults()

    const damage = getByText('-$0.38')
    expect(damage.className).toContain('text-loss')
    expect(container.textContent).toContain('-$0.38')
  })
})

describe('time in range, the real score', () => {
  it('renders as a percentage and a meter', () => {
    const { getByText, getByRole } = renderResults()

    expect(getByText('84%')).toBeInTheDocument()
    const meter = getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '84')
  })
})

describe('the rebalance line credits whoever actually pressed A', () => {
  // The earlier version of these tests asserted the opposite, and locked in a
  // lie. `run.rebalances` is incremented only by `recordRebalance`, whose only
  // caller is the A keypress branch in InRange.tsx; nothing in this repo fires
  // autopilot. Branching the label on the autopilot SETTING therefore credited
  // a machine for a press the player made by hand, and did it on the screen
  // that gets photographed.
  it('says REBALANCED even when the autopilot setting is on', () => {
    const { getByText, queryByText } = renderResults({ autopilot: true })
    expect(getByText(/Rebalanced 2x/i)).toBeInTheDocument()
    expect(queryByText(/AUTOPILOT/i)).not.toBeInTheDocument()
  })

  it('says REBALANCED when the setting is off', () => {
    const { getByText, queryByText } = renderResults({ autopilot: false })
    expect(getByText(/Rebalanced 2x/i)).toBeInTheDocument()
    expect(queryByText(/AUTOPILOT/i)).not.toBeInTheDocument()
  })

  it('never contradicts S7, which says autopilot is not moving the range', () => {
    // S7's alarm banner tells the player, with autopilot on, "not moving: the
    // swap costs more than it earns back". If this screen then claimed the
    // autopilot fired, the two screens would disagree in front of a judge who
    // watched the presses. Asserting the absence is the point.
    const { queryByText } = renderResults({ autopilot: true })
    expect(queryByText(/fired/i)).not.toBeInTheDocument()
  })
})

describe('the face says what the numbers say', () => {
  // Two Sprites carry the outcome animation: the big Monanimal and the
  // Dialog portrait. Both read the same `spriteAnimation`, on purpose, so
  // getAllByRole rather than getByRole: two elements agreeing is the
  // feature this test is pinning, not a query ambiguity to work around.
  it('a strong run picks happy and the strong line', () => {
    const { getAllByRole, getByText } = renderResults({
      run: { ...RUN, netUsd: 1.04, timeInRangePct: 84 },
    })
    expect(getAllByRole('img', { name: /happy/ }).length).toBeGreaterThan(0)
    expect(
      getByText(/you stayed on your feet\. that is the whole job\./i),
    ).toBeInTheDocument()
  })

  it('a net-negative run picks sit and the losing line', () => {
    const { getAllByRole, getByText } = renderResults({
      run: { ...RUN, netUsd: -0.5, damageUsd: 1.9, timeInRangePct: 20 },
    })
    expect(getAllByRole('img', { name: /sit/ }).length).toBeGreaterThan(0)
    expect(
      getByText(/price walked off your ground\. that happens\./i),
    ).toBeInTheDocument()
  })
})

describe('missing data, Gate 2.4', () => {
  it('run={null} renders the no-session panel, and A still gets the player out', () => {
    const { getByText, onBackToDisks } = renderResults({ run: null })

    expect(getByText(/No session to report/i)).toBeInTheDocument()

    press('A')
    expect(onBackToDisks).toHaveBeenCalledTimes(1)
  })
})

describe('input', () => {
  it('A fires onBackToDisks, SELECT writes the run to chain', () => {
    const { onBackToDisks, onSaveRun } = renderResults()

    press('A')
    expect(onBackToDisks).toHaveBeenCalledTimes(1)

    press('SELECT')
    expect(onSaveRun).toHaveBeenCalledTimes(1)
  })

  it('SELECT does nothing while a write is already in flight', () => {
    // SELECT used to fire a no-op share, where a double press cost nothing.
    // It sends a transaction now, and on Monad a transaction is billed on the
    // gas limit whether or not it was needed, so a second press is real money.
    const { onSaveRun } = renderResults({ save: { status: 'saving' } })

    press('SELECT')
    press('SELECT')
    expect(onSaveRun).not.toHaveBeenCalled()
  })

  it('SELECT does nothing once the run is already on chain', () => {
    const { onSaveRun } = renderResults({
      save: {
        status: 'saved',
        txHash:
          '0xa1f76292b77a6100dd2f31d5752fd2451a07ff1ace05c4e13200fc08e5acbf62',
        confirmed: true,
        signer: '0x3909599390D9f30DC19e06e4900ec955CEC33039',
        explorerUrl: null,
      },
    })

    press('SELECT')
    expect(onSaveRun).not.toHaveBeenCalled()
  })

  it('SELECT retries after a failure', () => {
    const { onSaveRun } = renderResults({
      save: { status: 'failed', reason: 'ONCHAIN_RUNS is not set to 1' },
    })

    press('SELECT')
    expect(onSaveRun).toHaveBeenCalledTimes(1)
  })
})

describe('the chain line names who signed', () => {
  it('says nothing at all before anything has happened', () => {
    const { queryByText } = renderResults()
    expect(queryByText(/onchain/i)).not.toBeInTheDocument()
    expect(queryByText(/writing to monad/i)).not.toBeInTheDocument()
  })

  it('credits the KEEPER, never the player, once written', () => {
    // The player has no wallet in this build and signs nothing. A hash on
    // screen without the signer beside it implies the player's wallet wrote
    // it, which is the unverifiable claim rule 1 exists to stop.
    const { getByText } = renderResults({
      save: {
        status: 'saved',
        txHash:
          '0xa1f76292b77a6100dd2f31d5752fd2451a07ff1ace05c4e13200fc08e5acbf62',
        confirmed: true,
        signer: '0x3909599390D9f30DC19e06e4900ec955CEC33039',
        explorerUrl: null,
      },
    })
    expect(getByText(/signed by keeper/i)).toBeInTheDocument()
  })

  it('shows the reason instead of breaking when nothing was written', () => {
    const { getByText } = renderResults({
      save: { status: 'failed', reason: 'ONCHAIN_RUNS is not set to 1' },
    })
    expect(getByText(/not written/i)).toBeInTheDocument()
    expect(getByText(/ONCHAIN_RUNS is not set to 1/i)).toBeInTheDocument()
  })
})
