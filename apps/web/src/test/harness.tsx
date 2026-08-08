import { act, render } from '@testing-library/react'
import { ConsoleInputProvider } from '../console/useConsoleInput'
import type { ReactElement } from 'react'
import type { ConsoleIntent } from '../console/intents'

/**
 * How a screen is tested.
 *
 * ARCHITECTURE.md section 10 says ui/ and game/ are tested by looking at them,
 * and that stays true for LOOK. These tests cover the other half: what the
 * screen does when a button is pressed, and what it renders when the data it
 * wanted is not there. Both of those are gate conditions (2.1 and 2.4) and
 * neither is visible in a screenshot.
 *
 * Two rules make this cheap:
 *
 *   1. A SCREEN IS A COMPONENT, not a route. Route files are wrappers that own
 *      useNavigate and pass callbacks down. So a screen test never needs a
 *      router, and a `.test.tsx` never sits in src/routes/ where the route
 *      generator would turn it into a route.
 *   2. INPUT GOES THROUGH THE REAL KEYBOARD PATH. `press('A')` dispatches an
 *      actual keydown, which runs the real intent mapping, the real repeat
 *      policy, and the real store. A test that called a handler directly would
 *      pass while the screen was unreachable by keyboard, which is Gate 1.2.
 */

/**
 * Every screen mounts inside the console's input provider and nothing else.
 *
 * `rerenderScreen` re-wraps, and that matters more than it looks. Testing
 * Library's own `rerender` replaces the WHOLE tree with what it is given, so
 * passing a bare screen drops the provider and changes the tree's shape — React
 * then unmounts and remounts the component, silently resetting any state it was
 * accumulating. A test of anything that builds up over time (a price history, a
 * streak, a chart) would see an empty component and read as a bug in the screen.
 */
export function renderScreen(ui: ReactElement) {
  const utils = render(<ConsoleInputProvider>{ui}</ConsoleInputProvider>)

  return {
    ...utils,
    rerenderScreen: (next: ReactElement) =>
      utils.rerender(<ConsoleInputProvider>{next}</ConsoleInputProvider>),
  }
}

/**
 * The key each intent is driven by in a test.
 *
 * Deliberately one key per intent rather than the full map from intents.ts:
 * the map itself is already covered by intents.test.ts, and a test that
 * enumerated every alias would fail when an alias is added rather than when
 * something breaks.
 */
const KEY_FOR: Readonly<Record<ConsoleIntent, string>> = {
  UP: 'ArrowUp',
  DOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  A: 'z',
  B: 'x',
  START: 'Enter',
  SELECT: 'Shift',
}

/** One full press and release, the way a person does it. */
export function press(...intents: Array<ConsoleIntent>) {
  for (const intent of intents) {
    const key = KEY_FOR[intent]
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
    })
  }
}

/** Hold a direction for `times` repeats. Actions never repeat, by design. */
export function hold(intent: ConsoleIntent, times: number) {
  const key = KEY_FOR[intent]
  act(() => {
    for (let i = 0; i < times; i += 1) {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key, repeat: i > 0, bubbles: true }),
      )
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
  })
}

/**
 * Advance fake timers inside act, for screens driven by a tick.
 *
 * The caller owns vi.useFakeTimers(). This only exists so the act() wrapper is
 * not copy-pasted into every timing assertion.
 */
export async function tick(
  ms: number,
  timers: { advanceTimersByTime: (ms: number) => unknown },
) {
  await act(async () => {
    timers.advanceTimersByTime(ms)
  })
}
