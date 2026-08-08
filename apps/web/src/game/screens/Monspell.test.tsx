// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { press, renderScreen } from '../../test/harness'
import { ConsoleInputProvider } from '../../console/useConsoleInput'
import { Monspell } from './Monspell'
import type { MonspellProps } from './Monspell'

function renderMonspell(overrides: Partial<MonspellProps> = {}) {
  const onBack = vi.fn()
  const utils = renderScreen(
    <Monspell
      characterId={overrides.characterId ?? 'molandak'}
      livePrice={overrides.livePrice ?? { priceUsd: 0.0207, at: 1 }}
      loading={overrides.loading ?? false}
      onBack={overrides.onBack ?? onBack}
    />,
  )
  return { ...utils, onBack }
}

/** Re-render inside the provider with a new live price, like a real poll. */
function setLivePrice(
  utils: ReturnType<typeof renderMonspell>,
  priceUsd: number,
) {
  act(() => {
    utils.rerender(
      <ConsoleInputProvider>
        <Monspell
          characterId="molandak"
          livePrice={{ priceUsd, at: Date.now() }}
          loading={false}
          onBack={() => {}}
        />
      </ConsoleInputProvider>,
    )
  })
}

describe('the pick state', () => {
  it('shows the live price, the chart character, and both directions', () => {
    const { getByText, getAllByRole } = renderMonspell({
      livePrice: { priceUsd: 0.0207, at: 1 },
    })

    expect(getByText(/mon price/i)).toBeInTheDocument()
    expect(getByText('$0.02070')).toBeInTheDocument()
    expect(getByText(/up/i)).toBeInTheDocument()
    expect(getByText(/down/i)).toBeInTheDocument()
    // The character is the chart: the monster must be on screen, not a bare
    // number, so the player reads the price as a creature's height. Two
    // images are expected: the hairline plot and the sprite that rides it.
    expect(getAllByRole('img').length).toBeGreaterThanOrEqual(2)
  })

  it('shows the read placeholder instead of inventing a price while loading', () => {
    const { getByText } = renderMonspell({ loading: true })

    expect(getByText(/reading price/i)).toBeInTheDocument()
    expect(getByText('.....')).toBeInTheDocument()
  })

  it('RIGHT and LEFT flip the call', () => {
    const { container } = renderMonspell()

    press('RIGHT')
    let current = container.querySelector('[aria-current="true"]')
    expect(current?.textContent).toMatch(/up/i)

    press('LEFT')
    current = container.querySelector('[aria-current="true"]')
    expect(current?.textContent).toMatch(/down/i)
  })
})

describe('a round', () => {
  it('A opens the window and B still goes back from running', () => {
    const { onBack } = renderMonspell()

    press('A')
    expect(onBack).not.toHaveBeenCalled()

    press('B')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('B goes back from the pick state', () => {
    const { onBack } = renderMonspell()

    press('B')
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('deciding a round', () => {
  it('resolves a win when the price moves the called way', () => {
    vi.useFakeTimers()
    try {
      const utils = renderMonspell({
        livePrice: { priceUsd: 0.0200, at: 1 },
      })

      press('RIGHT') // call = up
      press('A') // window opens at 0.0200

      // Price walks up during the window; each poll re-renders the screen.
      setLivePrice(utils, 0.0210)
      act(() => {
        vi.advanceTimersByTime(10_000)
      })

      expect(utils.getByText(/called it/i)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves a loss when the call was wrong', () => {
    vi.useFakeTimers()
    try {
      const utils = renderMonspell({
        livePrice: { priceUsd: 0.0200, at: 1 },
      })

      press('LEFT') // call = down
      press('A') // window opens at 0.0200

      // Price went UP instead, so DOWN is a miss.
      setLivePrice(utils, 0.0210)
      act(() => {
        vi.advanceTimersByTime(10_000)
      })

      expect(utils.getByText(/missed/i)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('A on the result starts a fresh round', () => {
    vi.useFakeTimers()
    try {
      const utils = renderMonspell({
        livePrice: { priceUsd: 0.0200, at: 1 },
      })

      press('A')
      setLivePrice(utils, 0.0210)
      act(() => {
        vi.advanceTimersByTime(10_000)
      })
      expect(utils.getByText(/called it/i)).toBeInTheDocument()

      press('A')
      expect(utils.queryByText(/mon price/i)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the console', () => {
  it('needs the input provider, like every other screen', () => {
    // A screen that renders without the provider would be lying about the
    // console contract; this guards the inverse. The provider is the thing
    // that turns keys into intents.
    expect(() =>
      render(
        <Monspell
          characterId="moyaki"
          livePrice={{ priceUsd: 1, at: 1 }}
          loading={false}
          onBack={() => {}}
        />,
      ),
    ).toThrow()
  })
})
