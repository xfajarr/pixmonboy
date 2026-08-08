// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { press, renderScreen } from '../../test/harness'
import { FIXTURE_CARD_ADDRESS } from '../fixtures'
import { MemoryCard } from './MemoryCard'
import type { MemoryCardProps } from './MemoryCard'

function renderMemoryCard(overrides: Partial<MemoryCardProps> = {}) {
  const onInsert = vi.fn()
  const onBack = vi.fn()

  const utils = renderScreen(
    <MemoryCard
      cardAddress={
        'cardAddress' in overrides ? (overrides.cardAddress ?? null) : null
      }
      onInsert={overrides.onInsert ?? onInsert}
      onBack={overrides.onBack ?? onBack}
    />,
  )

  return { ...utils, onInsert, onBack }
}

describe('the screen', () => {
  it('offers both ways in, and states the three reassurances', () => {
    const { getByText } = renderMemoryCard()

    expect(getByText(/continue with google/i)).toBeInTheDocument()
    expect(getByText(/use an email/i)).toBeInTheDocument()

    expect(getByText(/no seed phrase/i)).toBeInTheDocument()
    expect(getByText(/no extension/i)).toBeInTheDocument()
    expect(getByText(/^free$/i)).toBeInTheDocument()
  })

  it('says FIXTURE, because Privy is not wired', () => {
    const { getByText } = renderMemoryCard()

    // Eight pixels of honesty. Both rows land on a committed fixture card,
    // and nobody watching a demo should believe a Google login just happened.
    expect(getByText(/fixture/i)).toBeInTheDocument()
  })
})

/**
 * The screen's whole product thesis, as a test.
 *
 * SCREEN-DETAIL.md section 4: this is where the intimidated person
 * historically leaves, and the reason they leave is the vocabulary. If someone
 * edits this copy back toward "connect your wallet", this fails, which is the
 * only way a copy rule survives contact with a deadline.
 */
describe('the forbidden vocabulary', () => {
  const FORBIDDEN = ['wallet', 'connect', 'gas'] as const

  for (const word of FORBIDDEN) {
    it(`never says "${word}"`, () => {
      const { container } = renderMemoryCard()
      expect(container.textContent.toLowerCase()).not.toContain(word)
    })
  }

  it('says "seed" only inside the reassurance that removes it', () => {
    const { container } = renderMemoryCard()
    const text = container.textContent.toLowerCase()

    const seedMentions = text.match(/seed/g) ?? []
    const removals = text.match(/no seed phrase/g) ?? []
    expect(seedMentions).toHaveLength(removals.length)
    expect(removals).toHaveLength(1)
  })

  it('keeps the vocabulary rule once a card is already in the slot', () => {
    // The returning-player state renders different copy, so it needs the same
    // guarantee rather than inheriting it.
    const { container } = renderMemoryCard({
      cardAddress: FIXTURE_CARD_ADDRESS,
    })
    const text = container.textContent.toLowerCase()

    for (const word of FORBIDDEN) expect(text).not.toContain(word)
  })
})

describe('the cursor', () => {
  it('DOWN moves it and does not wrap past the last method', () => {
    const { container } = renderMemoryCard()

    press('DOWN', 'DOWN', 'DOWN')

    // Two methods, so the cursor parks on the second however hard it is
    // pushed. A cursor that wraps past the end of a two item list feels
    // broken, not clever, the first time a player hits it.
    const current = container.querySelectorAll('[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0].textContent).toMatch(/use an email/i)
  })

  it('UP does not wrap past the first method', () => {
    const { container } = renderMemoryCard()

    press('UP', 'UP')

    const current = container.querySelectorAll('[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0].textContent).toMatch(/continue with google/i)
  })
})

describe('inserting and going back', () => {
  it('A inserts the card', () => {
    const { onInsert } = renderMemoryCard()

    press('A')

    expect(onInsert).toHaveBeenCalledTimes(1)
  })

  it('a mouse click inserts too, because a phone has no A button', () => {
    const { getByText, onInsert } = renderMemoryCard()

    const button = getByText(/use an email/i).closest('button')
    if (!button) throw new Error('a method row is not inside a button')
    fireEvent.click(button)

    expect(onInsert).toHaveBeenCalledTimes(1)
  })

  it('B goes back', () => {
    const { onBack } = renderMemoryCard()

    press('B')

    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('the returning player', () => {
  it('shows the card as already in the slot, with its address truncated', () => {
    const { getByText } = renderMemoryCard({
      cardAddress: FIXTURE_CARD_ADDRESS,
    })

    expect(getByText(/memory card in/i)).toBeInTheDocument()
    expect(getByText(/0x7a\.\.3f/i)).toBeInTheDocument()
    // One action, not a second sign-in: they are carrying on, not choosing
    // how to arrive.
    expect(getByText(/^continue$/i)).toBeInTheDocument()
  })

  it('shows no address at all before a card exists', () => {
    const { container } = renderMemoryCard()

    expect(container.textContent).not.toMatch(/0x/)
  })

  it('A still continues, so the route stays the only thing that knows where', () => {
    const { onInsert } = renderMemoryCard({
      cardAddress: FIXTURE_CARD_ADDRESS,
    })

    press('A')

    expect(onInsert).toHaveBeenCalledTimes(1)
  })
})
