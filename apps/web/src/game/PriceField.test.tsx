// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { PriceField } from './PriceField'

/**
 * One thing is tested here and it is the jump.
 *
 * `PriceField`'s geometry is already covered by `domain.test.ts`, which owns
 * the y-domain rule, and by `InRange.test.tsx`, which owns what the screen
 * says. What neither of them could see is that the character stops standing on
 * the price for the length of the jump animation, because that is a CSS
 * cascade fact rather than a rendering one: `transform` is a single property,
 * so an animation that sets it silently discards the `translate` that was
 * positioning the element.
 *
 * The assertion below is the shape of the fix rather than its effect, and that
 * is deliberate. jsdom does not run animations, so there is no computed
 * position to compare. What it CAN see is whether the two transforms were put
 * on the same element, which is the entire bug.
 */

const BASE = {
  series: [100, 101, 99, 102, 103],
  lowerPrice: 95,
  upperPrice: 110,
  width: 464,
  height: 200,
  character: 'molandak',
  animation: 'run' as const,
  earning: true,
}

/** The element that puts the character's feet on the price line. Found by the
 * transform it carries, because that transform IS the thing under test. */
function positioner(container: HTMLElement): HTMLElement {
  const found = Array.from(container.querySelectorAll<HTMLElement>('div')).find(
    (el) => el.style.transform === 'translate(-50%, -100%)',
  )
  if (!found) throw new Error('character positioner not found')
  return found
}

describe('the character stays on the price while it jumps', () => {
  it('never puts the jump animation on the element that positions it', () => {
    const { container } = render(<PriceField {...BASE} jumping />)

    // The regression, stated exactly. When these two lived on one element the
    // sprite snapped half its width right and its whole height down the
    // moment A was pressed, hopped there, and snapped back. On screen it read
    // as the character leaping off the chart.
    expect(positioner(container).className).not.toContain('sprite-jump')
  })

  it('still plays the jump, on a child of the positioner', () => {
    const { container } = render(<PriceField {...BASE} jumping />)

    expect(positioner(container).querySelector('.sprite-jump')).not.toBeNull()
  })

  it('plays nothing when not jumping', () => {
    const { container } = render(<PriceField {...BASE} jumping={false} />)

    expect(container.querySelector('.sprite-jump')).toBeNull()
  })

  it('keeps the positioning transform in both states', () => {
    // The positioner is found BY its transform, so this passing at all is the
    // assertion: the character is placed the same way whether or not the
    // animation is running.
    for (const jumping of [true, false]) {
      const { container, unmount } = render(
        <PriceField {...BASE} jumping={jumping} />,
      )
      expect(positioner(container).style.top).not.toBe('')
      unmount()
    }
  })
})
