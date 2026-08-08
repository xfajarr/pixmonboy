/**
 * The console's entire input vocabulary.
 *
 * Touch, keyboard, and gamepad collapse into this before any screen sees them.
 * No screen ever handles a raw key event, which is what makes every screen
 * keyboard-navigable and gamepad-navigable for free rather than as a retrofit.
 *
 * This file is PURE. No DOM, no React, no listeners. That is what lets the
 * mapping be tested, and the mapping is the part that is easy to get subtly
 * wrong.
 */

export const INTENTS = [
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  'A',
  'B',
  'START',
  'SELECT',
] as const

export type ConsoleIntent = (typeof INTENTS)[number]

/**
 * Directions auto-repeat while held. Actions never do.
 *
 * Holding DOWN should walk a list. Holding A must not confirm eight times,
 * and on a confirm screen that would be the difference between one position
 * and eight.
 */
export const REPEATABLE: ReadonlySet<ConsoleIntent> = new Set([
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
])

/**
 * Keyboard map. Arrow keys and WASD both drive the D-pad, which is the layout
 * every emulator has used for twenty years.
 *
 * Note that `a` is LEFT and the A BUTTON is `z`. That looks like a collision
 * and is not one: it is the standard mapping, and swapping it to match the
 * letter would break the muscle memory of everyone who has used an emulator.
 */
const KEY_MAP: Readonly<Record<string, ConsoleIntent>> = {
  arrowup: 'UP',
  w: 'UP',
  arrowdown: 'DOWN',
  s: 'DOWN',
  arrowleft: 'LEFT',
  a: 'LEFT',
  arrowright: 'RIGHT',
  d: 'RIGHT',
  z: 'A',
  ' ': 'A',
  spacebar: 'A',
  x: 'B',
  escape: 'B',
  enter: 'START',
  shift: 'SELECT',
}

/** Returns the intent for a `KeyboardEvent.key`, or null if unmapped. */
export function intentFromKey(key: string): ConsoleIntent | null {
  return KEY_MAP[key.toLowerCase()] ?? null
}

/**
 * Standard Gamepad button indices.
 * https://w3c.github.io/gamepad/#remapping
 */
export const GAMEPAD_BUTTONS: Readonly<Record<number, ConsoleIntent>> = {
  0: 'A',
  1: 'B',
  8: 'SELECT',
  9: 'START',
  12: 'UP',
  13: 'DOWN',
  14: 'LEFT',
  15: 'RIGHT',
}

/** Below this, a stick is at rest. Analogue drift is real and it is loud. */
export const STICK_DEADZONE = 0.5

/**
 * Left stick to directions.
 *
 * The dominant axis wins outright, so a diagonal push produces one direction
 * rather than two. A menu cursor that moves diagonally is a menu cursor that
 * feels broken, and every screen in this product is a list or a grid.
 */
export function intentsFromAxes(
  x: number,
  y: number,
): ReadonlyArray<ConsoleIntent> {
  const ax = Math.abs(x)
  const ay = Math.abs(y)

  if (ax < STICK_DEADZONE && ay < STICK_DEADZONE) return []
  if (ax >= ay) return [x > 0 ? 'RIGHT' : 'LEFT']
  return [y > 0 ? 'DOWN' : 'UP']
}

/**
 * Keys we swallow. Arrows and space scroll the page by default, which on a
 * fixed 480x320 screen means the whole console jumps while you play.
 */
export function shouldPreventDefault(key: string): boolean {
  return intentFromKey(key) !== null
}
