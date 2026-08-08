/**
 * The single source of input for the whole application.
 *
 * Deliberately framework-free so it can be created once, outside React, and
 * subscribed to with `useSyncExternalStore`. That matters for one reason: the
 * pressed-state changes on every D-pad tap, hundreds of times a session, and
 * putting it in ordinary React state would re-render every screen on every
 * press.
 */

import {
  GAMEPAD_BUTTONS,
  REPEATABLE,
  intentFromKey,
  intentsFromAxes,
  shouldPreventDefault,
} from './intents'
import { playButton, playClick } from './sound'
import type { ConsoleIntent } from './intents'

export type IntentHandler = (intent: ConsoleIntent) => void

export interface InputStore {
  /** Fires once per press, and repeatedly while a direction is held. */
  subscribeIntent: (handler: IntentHandler) => () => void
  /** For the visual state of the D-pad and buttons only. */
  subscribePressed: (onChange: () => void) => () => void
  getPressed: () => ReadonlySet<ConsoleIntent>
  /** Touch and programmatic input enter here. */
  press: (intent: ConsoleIntent) => void
  release: (intent: ConsoleIntent) => void
  /** Attaches window listeners and gamepad polling. Returns a teardown. */
  attach: () => () => void
}

const EMPTY: ReadonlySet<ConsoleIntent> = new Set()

export function createInputStore(): InputStore {
  const intentHandlers = new Set<IntentHandler>()
  const pressedHandlers = new Set<() => void>()

  // Replaced rather than mutated, so useSyncExternalStore sees a new reference
  // only when something actually changed.
  let pressed: ReadonlySet<ConsoleIntent> = EMPTY

  function emit(intent: ConsoleIntent) {
    for (const handler of intentHandlers) handler(intent)
  }

  function setPressed(next: ReadonlySet<ConsoleIntent>) {
    pressed = next
    for (const handler of pressedHandlers) handler()
  }

  function press(intent: ConsoleIntent) {
    // Every physical button and every mapped key lands here, so this is the
    // one place a button click can be heard. Not in the keyboard handler, or
    // gamepad and touch would stay silent. A and B get the meatier face-button
    // blip; everything else gets the generic click.
    if (intent === 'A' || intent === 'B') playButton()
    else playClick()
    if (pressed.has(intent)) {
      // Already held. Only directions are allowed to fire again.
      if (REPEATABLE.has(intent)) emit(intent)
      return
    }
    const next = new Set(pressed)
    next.add(intent)
    setPressed(next)
    emit(intent)
  }

  function release(intent: ConsoleIntent) {
    if (!pressed.has(intent)) return
    const next = new Set(pressed)
    next.delete(intent)
    setPressed(next)
  }

  function attach(): () => void {
    if (typeof window === 'undefined') return () => {}

    /**
     * True when the focused element legitimately owns the arrow keys.
     *
     * There is exactly one: the volume knob, which is a real `role="slider"`
     * because a continuous control deserves one. While it has focus, arrows
     * belong to it and the D-pad must stay out of the way.
     *
     * Checked by ROLE rather than by class or id, so any future continuous
     * control gets the same treatment by declaring what it is.
     */
    const ownsArrows = (target: EventTarget | null): boolean => {
      // `instanceof Element`, not a cast. An EventTarget is genuinely not
      // always an element — a key event dispatched at the window has the window
      // as its target, and `window.closest` does not exist. Casting to Element
      // told the compiler otherwise and threw at runtime inside the one handler
      // the whole console depends on.
      if (!(target instanceof Element)) return false
      return target.closest('[role="slider"]') !== null
    }

    /**
     * The PHYSICAL key, not the intent it maps to.
     *
     * This distinction is the whole correctness of the rule below, and getting
     * it wrong is subtle: `w` and `ArrowUp` are both `UP`, but the slider only
     * listens for arrows. Keying the check off the intent suppressed WASD too,
     * so a focused volume knob silently muted half the keyboard — the same
     * class of bug this guard exists to prevent, reintroduced from the other
     * side. A test pins it.
     */
    const isArrowKey = (key: string) => key.toLowerCase().startsWith('arrow')

    const onKeyDown = (e: KeyboardEvent) => {
      const intent = intentFromKey(e.key)
      if (!intent) return
      // The slider handles its own arrows. Everything else, including WASD
      // while the slider happens to hold focus, still drives the console.
      if (isArrowKey(e.key) && ownsArrows(e.target)) return
      if (shouldPreventDefault(e.key)) e.preventDefault()

      // The browser's own key repeat drives direction repeat, so the timing
      // matches the user's OS settings rather than a number we invented.
      if (e.repeat && !REPEATABLE.has(intent)) return
      press(intent)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const intent = intentFromKey(e.key)
      if (intent) release(intent)
    }

    // A held key with the window unfocused would otherwise stay held forever.
    const onBlur = () => setPressed(EMPTY)

    // On-screen buttons (a screen's own rows and footer controls) are plain
    // <button> elements with onClick, so they never reach `press` above. One
    // delegated listener covers them all. The physical console buttons are
    // skipped: they already clicked through `press`, and playing twice per
    // press would make the loudest game in the build.
    const onButtonClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest('button')
      if (!el) return
      if (el.closest('.dpad-hit, .ab-well, .startsel')) return
      playClick()
    }

    /**
     * CAPTURE, NOT BUBBLE, and this is load bearing.
     *
     * A bubbling window listener is the LAST thing to see a key event, so any
     * `stopPropagation()` anywhere between the focused element and the window
     * silently kills the console's entire D-pad. That is not a hypothetical:
     * the volume knob called `stopPropagation()` on arrows, React attaches its
     * handlers at the root container, and so one click on the volume knob left
     * arrow-key navigation dead for the rest of the session with no error
     * anywhere.
     *
     * Capture runs BEFORE the target, so the console sees every key first and
     * nothing downstream can take it away. Which control gets to keep the key
     * is then decided explicitly, by `ownsArrows` above, rather than by
     * whichever handler happens to run first.
     */
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('click', onButtonClick)

    // ---- gamepad -----------------------------------------------------------
    // Polled only while one is connected. A permanent rAF loop on a page that
    // is mostly static is a battery cost for nothing.
    let frame = 0
    let padCount = 0
    const padPressed = new Set<ConsoleIntent>()

    const poll = () => {
      const pads = navigator.getGamepads()
      const seen = new Set<ConsoleIntent>()

      for (const pad of pads) {
        if (!pad) continue
        for (const [index, intent] of Object.entries(GAMEPAD_BUTTONS)) {
          if (pad.buttons[Number(index)]?.pressed) seen.add(intent)
        }
        for (const intent of intentsFromAxes(
          pad.axes[0] ?? 0,
          pad.axes[1] ?? 0,
        )) {
          seen.add(intent)
        }
      }

      for (const intent of seen) {
        if (!padPressed.has(intent)) {
          padPressed.add(intent)
          press(intent)
        }
      }
      for (const intent of [...padPressed]) {
        if (!seen.has(intent)) {
          padPressed.delete(intent)
          release(intent)
        }
      }

      frame = requestAnimationFrame(poll)
    }

    const onConnect = () => {
      padCount += 1
      if (padCount === 1) frame = requestAnimationFrame(poll)
    }
    const onDisconnect = () => {
      padCount = Math.max(0, padCount - 1)
      if (padCount === 0 && frame) {
        cancelAnimationFrame(frame)
        frame = 0
        for (const intent of [...padPressed]) release(intent)
        padPressed.clear()
      }
    }

    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)
    if (navigator.getGamepads().some(Boolean)) onConnect()

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('click', onButtonClick)
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
      if (frame) cancelAnimationFrame(frame)
      setPressed(EMPTY)
    }
  }

  return {
    subscribeIntent(handler) {
      intentHandlers.add(handler)
      return () => intentHandlers.delete(handler)
    },
    subscribePressed(onChange) {
      pressedHandlers.add(onChange)
      return () => pressedHandlers.delete(onChange)
    },
    getPressed: () => pressed,
    press,
    release,
    attach,
  }
}
