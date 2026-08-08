// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { press, renderScreen } from '../../test/harness'
import { CartridgeSelect } from './CartridgeSelect'
import { cartridges, saveDisks } from '../fixtures'
import { brand } from '../../config/brand'
import type { CartridgeSelectProps } from './CartridgeSelect'

// The real fixture shelf, not a hand-typed one: cart-01 unlocked, cart-02 and
// cart-03 locked, exactly what the route passes in. A test built on a local
// stand-in could pass while the real prop shape breaks the screen.
const CARTS = cartridges()
const DISK = saveDisks()[0]

function renderCartridgeSelect(overrides: Partial<CartridgeSelectProps> = {}) {
  const onInsert = vi.fn()
  const onBack = vi.fn()
  const utils = renderScreen(
    <CartridgeSelect
      disk={DISK}
      cartridges={CARTS}
      onInsert={onInsert}
      onBack={onBack}
      {...overrides}
    />,
  )
  return { ...utils, onInsert, onBack }
}

describe('the shelf', () => {
  it('renders all three cartridges, and the one real title comes from brand.ts', () => {
    const { getByText } = renderCartridgeSelect()
    expect(getByText(brand.CARTRIDGE_01)).toBeInTheDocument()
    expect(getByText('CART 01', { exact: false })).toBeInTheDocument()
    expect(getByText('CART 02', { exact: false })).toBeInTheDocument()
    expect(getByText('CART 03', { exact: false })).toBeInTheDocument()
  })

  it('shows an honest placeholder, never a throw or a spinner, when no disk is open', () => {
    const { getByText, queryByText } = renderCartridgeSelect({
      disk: undefined,
    })
    expect(getByText(/no disk/i)).toBeInTheDocument()
    expect(queryByText(/disk 1/i)).not.toBeInTheDocument()
  })
})

describe('moving the cursor', () => {
  it('RIGHT moves toward CART 02, and does not wrap past CART 03', () => {
    const { onInsert } = renderCartridgeSelect()
    press('RIGHT')
    press('RIGHT')
    press('RIGHT') // already on the last slot, has nowhere honest to go
    press('A')
    // The cursor stopped on CART 03, which is locked, so A must not insert.
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('LEFT at the first slot does not wrap', () => {
    const { onInsert } = renderCartridgeSelect()
    press('LEFT')
    press('A')
    // Still on CART 01, the one unlocked slot, so A still inserts it.
    expect(onInsert).toHaveBeenCalledExactlyOnceWith(CARTS[0].id)
  })
})

describe('pressing A', () => {
  it('on the unlocked cartridge calls onInsert with its id', () => {
    const { onInsert } = renderCartridgeSelect()
    press('A')
    expect(onInsert).toHaveBeenCalledExactlyOnceWith('cart-01')
  })

  it('on a locked cartridge does not call onInsert', () => {
    const { onInsert } = renderCartridgeSelect()
    press('RIGHT') // CART 02
    press('RIGHT') // CART 03, still locked
    press('A')
    expect(onInsert).not.toHaveBeenCalled()
  })
})

describe('pressing B', () => {
  it('calls onBack', () => {
    const { onBack } = renderCartridgeSelect()
    press('B')
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('clicking with a mouse', () => {
  it('inserts the unlocked cartridge on click', () => {
    const { onInsert, getByText } = renderCartridgeSelect()
    const button = getByText(brand.CARTRIDGE_01).closest('button')
    if (!button) throw new Error('cartridge title is not inside a button')
    fireEvent.click(button)
    expect(onInsert).toHaveBeenCalledExactlyOnceWith('cart-01')
  })

  it('moves the cursor to a locked cartridge on click without inserting', () => {
    const { onInsert, getAllByText } = renderCartridgeSelect()
    // Case-insensitive: the label is uppercased by a CSS class, and jsdom
    // does not apply `text-transform`, so the node's text is still "Locked".
    const lockedLabel = getAllByText(/^locked$/i)[0]
    const button = lockedLabel.closest('button')
    if (!button) throw new Error('locked cartridge is not inside a button')
    fireEvent.click(button)
    expect(onInsert).not.toHaveBeenCalled()
  })
})

describe('the tagline block', () => {
  it('keeps a fixed-height container whether the cursor is on a real tagline or the locked placeholder', () => {
    const { container, getByText } = renderCartridgeSelect()

    // CART 01: the real tagline, read from the fixture prop.
    const realBlock = container.querySelector('.h-10')
    expect(realBlock).toBeInTheDocument()
    expect(getByText(CARTS[0].tagline ?? '')).toBeInTheDocument()

    // Move to CART 03, the one still locked: same container class, different
    // text. CART 02 is MONSPELL and has a real tagline now.
    press('RIGHT')
    press('RIGHT')
    const lockedBlock = container.querySelector('.h-10')
    expect(lockedBlock).toBeInTheDocument()
    expect(getByText(/shipping in a later cartridge/i)).toBeInTheDocument()
  })
})
