// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { createInputStore } from './input-store'
import type { ConsoleIntent } from './intents'

/**
 * The store is the one thing between a key and every screen in the product, so
 * these are all about ROBUSTNESS rather than about mapping: `intents.test.ts`
 * already pins which key means what.
 */
function mounted() {
  const store = createInputStore()
  const detach = store.attach()
  const seen: Array<ConsoleIntent> = []
  const unsubscribe = store.subscribeIntent((intent) => seen.push(intent))

  return {
    seen,
    teardown: () => {
      unsubscribe()
      detach()
    },
  }
}

function keydown(key: string, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

describe('a key reaches the console however the page is wired', () => {
  it('still fires when something between the target and window stops the event', () => {
    // THE REGRESSION THIS FILE EXISTS FOR.
    //
    // The volume knob called stopPropagation() on arrow keys. The store used to
    // listen on window in the BUBBLE phase, which is the last thing to see an
    // event, so one click on the knob left the D-pad dead for the rest of the
    // session — no error, no warning, and no test could fail on it.
    const swallower = document.createElement('div')
    document.body.append(swallower)
    swallower.addEventListener('keydown', (e) => e.stopPropagation())

    const { seen, teardown } = mounted()
    keydown('ArrowDown', swallower)

    expect(seen).toEqual(['DOWN'])

    teardown()
    swallower.remove()
  })

  it('leaves the arrow keys to a focused slider, which genuinely owns them', () => {
    // The volume knob is a real role="slider" because a continuous control
    // deserves one. While it holds focus the arrows are its own, and the D-pad
    // steps aside rather than moving a cursor the player cannot see.
    const slider = document.createElement('div')
    slider.setAttribute('role', 'slider')
    document.body.append(slider)

    const { seen, teardown } = mounted()
    keydown('ArrowUp', slider)

    expect(seen).toEqual([])

    teardown()
    slider.remove()
  })

  it('still drives the console with WASD while the slider holds focus', () => {
    // Stepping aside is about the ARROWS, not about the whole keyboard. A
    // slider has no claim on W, and a player who reaches for it should not find
    // the console mute because a knob happens to be focused.
    const slider = document.createElement('div')
    slider.setAttribute('role', 'slider')
    document.body.append(slider)

    const { seen, teardown } = mounted()
    keydown('w', slider)
    keydown('z', slider)

    expect(seen).toEqual(['UP', 'A'])

    teardown()
    slider.remove()
  })
})

describe('what repeats and what does not', () => {
  it('repeats a held direction and never a held action', () => {
    const { seen, teardown } = mounted()

    keydown('ArrowLeft')
    keydown('ArrowLeft')
    keydown('z')
    keydown('z')

    // Two LEFTs because a held direction should walk a list. One A, because
    // holding confirm must not open eight positions.
    expect(seen).toEqual(['LEFT', 'LEFT', 'A'])

    teardown()
  })
})

describe('teardown', () => {
  it('stops listening, so a remounted console does not double-fire', () => {
    const store = createInputStore()
    const detach = store.attach()
    const seen: Array<ConsoleIntent> = []
    store.subscribeIntent((intent) => seen.push(intent))

    detach()
    keydown('ArrowDown')

    expect(seen).toEqual([])
  })
})

describe('sound never gates input', () => {
  it('emits the intent even when the audio element cannot be built', () => {
    // `press` plays a blip before it emits. If that ever throws — no Audio in
    // the environment, a missing file, an autoplay policy — the intent must
    // still arrive, because a silent console is a nuisance and a dead console
    // is a broken product.
    const original = globalThis.Audio
    // @ts-expect-error deliberately removing a global to simulate the failure
    delete globalThis.Audio

    const { seen, teardown } = mounted()
    keydown('ArrowRight')

    expect(seen).toEqual(['RIGHT'])

    teardown()
    globalThis.Audio = original
  })
})
