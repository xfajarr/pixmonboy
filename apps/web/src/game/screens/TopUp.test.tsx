// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { press, renderScreen } from '../../test/harness'
import { TopUp } from './TopUp'
import type { TopUpProps, TopUpState } from './TopUp'

const CARD = '0x7a2b9c4d5e6f708192a3b4c5d6e7f8091a2b3c3f'

function renderTopUp(overrides: Partial<TopUpProps> = {}) {
  const onTopUp = vi.fn()
  const onContinue = vi.fn()

  const utils = renderScreen(
    <TopUp
      cardAddress={'cardAddress' in overrides ? overrides.cardAddress! : CARD}
      balanceMon={'balanceMon' in overrides ? overrides.balanceMon! : 0}
      dripMon={overrides.dripMon ?? '0.05'}
      state={overrides.state ?? { status: 'idle' }}
      onTopUp={overrides.onTopUp ?? onTopUp}
      onContinue={overrides.onContinue ?? onContinue}
    />,
  )

  return { ...utils, onTopUp, onContinue }
}

/**
 * The screen exists because an embedded wallet is minted empty. Everything
 * below is either "does it say something true" or "can the player always get
 * out", which are the only two things that can go wrong on a step nobody asked
 * to be on.
 */
describe('the charge readout', () => {
  it('shows a dash, never a zero, before the balance has been read', () => {
    // Null is "not read yet" and 0 is "this card is empty". Printing 0 for
    // both would tell a funded player their card is flat for as long as the
    // read takes, on the one screen whose job is to report exactly that.
    const { getByText } = renderTopUp({ balanceMon: null })
    expect(getByText('--')).toBeInTheDocument()
  })

  it('prints a short balance rather than eighteen decimals', () => {
    const { getByText } = renderTopUp({ balanceMon: 0.0512345 })
    expect(getByText('0.0512')).toBeInTheDocument()
  })
})

describe('what each state says', () => {
  const cases: Array<[TopUpState, RegExp]> = [
    [{ status: 'sending' }, /sending power/i],
    [{ status: 'already' }, /already has enough/i],
    [
      {
        status: 'funded',
        amountMon: '0.05',
        txHash: '0xabc',
        explorerUrl: null,
      },
      /added 0\.05/i,
    ],
  ]

  for (const [state, expected] of cases) {
    it(`describes "${state.status}"`, () => {
      const { getByText } = renderTopUp({ state })
      expect(getByText(expected)).toBeInTheDocument()
    })
  }

  it("repeats the server's own reason when the faucet is off", () => {
    // Verbatim, not paraphrased. A friendlier restatement here would be a
    // second description of one condition, and the two drift the first time
    // the service changes.
    const { getByText } = renderTopUp({
      state: {
        status: 'unavailable',
        reason: 'faucet is empty for this session',
      },
    })
    expect(getByText(/faucet is empty for this session/i)).toBeInTheDocument()
  })
})

describe('the way out', () => {
  it('always offers B, even when the top up is unavailable', () => {
    // A player who cannot be funded can still play the whole game. Trapping
    // them here would trade a working demo for a broken one.
    const { onContinue } = renderTopUp({
      state: { status: 'unavailable', reason: 'switched off' },
    })
    press('B')
    expect(onContinue).toHaveBeenCalled()
  })

  it('does not fire a second request while one is in flight', () => {
    const { onTopUp } = renderTopUp({ state: { status: 'sending' } })
    press('A')
    expect(onTopUp).not.toHaveBeenCalled()
  })

  it('turns A into CONTINUE once the card is funded', () => {
    const { onTopUp, onContinue } = renderTopUp({
      state: {
        status: 'funded',
        amountMon: '0.05',
        txHash: '0x1',
        explorerUrl: null,
      },
    })
    press('A')
    expect(onTopUp).not.toHaveBeenCalled()
    expect(onContinue).toHaveBeenCalled()
  })
})

/**
 * The same rule S1 is held to, and this screen is where it is hardest to keep:
 * "gas" is the word every other product uses for exactly this action.
 */
describe('the forbidden vocabulary', () => {
  const FORBIDDEN = ['wallet', 'connect', 'gas', 'seed'] as const

  const STATES: Array<TopUpState> = [
    { status: 'idle' },
    { status: 'checking' },
    { status: 'sending' },
    { status: 'already' },
    { status: 'funded', amountMon: '0.05', txHash: '0x1', explorerUrl: null },
  ]

  for (const state of STATES) {
    for (const word of FORBIDDEN) {
      it(`never says "${word}" in "${state.status}"`, () => {
        const { container } = renderTopUp({ state })
        expect(container.textContent.toLowerCase()).not.toContain(word)
      })
    }
  }
})
