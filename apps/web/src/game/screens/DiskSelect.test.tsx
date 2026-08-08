// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { press, renderScreen } from '../../test/harness'
import { FIXTURE_CARD_ADDRESS, MAX_DISKS, saveDisks } from '../fixtures'
import { DiskSelect } from './DiskSelect'
import type { DiskSelectProps } from './DiskSelect'

const DISKS = saveDisks()

function renderDiskSelect(overrides: Partial<DiskSelectProps> = {}) {
  const onOpen = vi.fn()
  const onBack = vi.fn()
  const onEject = vi.fn()

  const utils = renderScreen(
    <DiskSelect
      cardAddress={
        'cardAddress' in overrides
          ? (overrides.cardAddress ?? null)
          : FIXTURE_CARD_ADDRESS
      }
      disks={overrides.disks ?? DISKS}
      maxDisks={overrides.maxDisks ?? MAX_DISKS}
      onOpen={overrides.onOpen ?? onOpen}
      onBack={overrides.onBack ?? onBack}
      onEject={overrides.onEject}
    />,
  )

  return { ...utils, onOpen, onBack, onEject: overrides.onEject ?? onEject }
}

describe('the shelf', () => {
  it('renders both fixture disks with their names and their characters', () => {
    const { getByText } = renderDiskSelect()

    expect(getByText('safe money')).toBeInTheDocument()
    expect(getByText('degen box')).toBeInTheDocument()
    // A disk IS a difficulty and a difficulty IS a Monanimal (ERD.md 2), so
    // the character is a lookup off the tier, never a separate choice.
    expect(getByText(/molandak/i)).toBeInTheDocument()
    expect(getByText(/mouch/i)).toBeInTheDocument()
  })

  it('draws the free slot, and says why it cannot be used yet', () => {
    const { getByText } = renderDiskSelect()

    expect(getByText(/empty slot/i)).toBeInTheDocument()
    expect(getByText(/new disks arrive with the registry/i)).toBeInTheDocument()
  })

  it('shows the card, truncated in the middle', () => {
    const { getByText } = renderDiskSelect()

    // Middle truncation, so the trailing characters survive. Those are the
    // half a person actually uses to tell two addresses apart.
    expect(getByText(/0x7a\.\.3f/i)).toBeInTheDocument()
  })
})

describe('never hide a loss, CLAUDE.md rule 2', () => {
  it('renders the losing disk with a minus glyph and a loss tone', () => {
    const { container } = renderDiskSelect()

    const values = [...container.querySelectorAll('[class*="text-"]')]
      .map((el) => ({ text: el.textContent, cls: el.className }))
      .filter((v) => /^[+-]\$/.test(v.text))

    expect(values).toHaveLength(2)

    // Disk 1 earned 12.40 and took no damage. Disk 2 earned 4.80 and took
    // 7.90, so it is 3.10 down, and that is what the screen must say.
    const gain = values.find((v) => v.text === '+$12.40')
    const loss = values.find((v) => v.text === '-$3.10')

    expect(gain).toBeDefined()
    expect(loss).toBeDefined()
    // Shape before colour: the sign is a glyph, so the row survives a
    // photograph, a projector, and colour blindness. Colour is the SECOND
    // signal and is asserted second, never instead.
    expect(gain?.cls).toMatch(/text-gain/)
    expect(loss?.cls).toMatch(/text-loss/)
  })

  it('marks the GOD MODE disk permanently, and only that one', () => {
    const { container, getByText } = renderDiskSelect()

    // U+2020, not a skull. Departure Mono has no U+2620 and would render the
    // most memorable row on the screen as a tofu box.
    expect(getByText(/god mode/i)).toBeInTheDocument()
    expect(container.textContent).toContain('†')
    expect(container.textContent.match(/god mode/gi)).toHaveLength(1)
  })
})

describe('the cursor', () => {
  it('DOWN moves it and does not wrap past the last disk', () => {
    const { onOpen } = renderDiskSelect()

    press('DOWN', 'DOWN', 'DOWN') // two disks, so the last two are no-ops
    press('A')

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(2)
  })

  it('UP does not wrap past the first disk', () => {
    const { onOpen } = renderDiskSelect()

    press('UP', 'UP')
    press('A')

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('never lands on the empty slot', () => {
    const { onOpen } = renderDiskSelect()

    // Press DOWN far more times than there are slots. If the cursor could
    // reach the free slot, A would open nothing and the player would be
    // stuck on a dead control, which is a dead end found live on stage.
    for (let i = 0; i < 20; i += 1) press('DOWN')
    press('A')

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(2)
  })
})

describe('opening and going back', () => {
  it('A opens the focused disk', () => {
    const { onOpen } = renderDiskSelect()

    press('A')

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('B goes back', () => {
    const { onBack } = renderDiskSelect()

    press('B')

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('a mouse click opens a disk, because a phone has no A button', () => {
    const { getByText, onOpen } = renderDiskSelect()

    const button = getByText('degen box').closest('button')
    if (!button) throw new Error('a disk row is not inside a button')
    fireEvent.click(button)

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(2)
  })
})

describe('missing data, Gate 2.4', () => {
  it('renders with no card, and says so rather than redirecting', () => {
    const { getByText, queryByRole, onBack } = renderDiskSelect({
      cardAddress: null,
    })

    expect(getByText(/no memory card/i)).toBeInTheDocument()
    expect(queryByRole('progressbar')).not.toBeInTheDocument()

    press('B')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('renders a card with no disks as a real screen with a way out', () => {
    const { getByText, queryByRole, onOpen, onBack } = renderDiskSelect({
      disks: [],
    })

    expect(getByText(/has no disks yet/i)).toBeInTheDocument()
    expect(queryByRole('progressbar')).not.toBeInTheDocument()

    // A on an empty shelf must do nothing rather than throw.
    press('A')
    expect(onOpen).not.toHaveBeenCalled()

    press('B')
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('ejecting the card from the shelf', () => {
  it('renders the eject row only when the route can sign the player out', () => {
    const { queryByText } = renderDiskSelect({ onEject: undefined })

    expect(queryByText(/eject memory card/i)).not.toBeInTheDocument()
  })

  it('DOWN past the last disk reaches EJECT, and A ejects', () => {
    const { onOpen, onEject } = renderDiskSelect({
      onEject: vi.fn(),
      cardAddress: FIXTURE_CARD_ADDRESS,
    })

    // Two disks, so DOWN DOWN parks on the second disk and one more moves to
    // the eject row. It sits below the empty slots, never over them.
    press('DOWN', 'DOWN', 'DOWN')
    press('A')

    expect(onEject).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('does not open a disk when EJECT is focused', () => {
    const { onOpen, onEject } = renderDiskSelect({
      onEject: vi.fn(),
      cardAddress: FIXTURE_CARD_ADDRESS,
    })

    press('DOWN', 'DOWN', 'DOWN')
    press('A')

    expect(onEject).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a mouse click on the eject row ejects, because a phone has no A', () => {
    const { getByText, onEject } = renderDiskSelect({
      onEject: vi.fn(),
      cardAddress: FIXTURE_CARD_ADDRESS,
    })

    const button = getByText(/eject memory card/i).closest('button')
    if (!button) throw new Error('the eject row is not inside a button')
    fireEvent.click(button)

    expect(onEject).toHaveBeenCalledTimes(1)
  })
})
