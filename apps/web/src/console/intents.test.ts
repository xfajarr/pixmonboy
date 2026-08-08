import { describe, expect, it } from 'vitest'
import {
  GAMEPAD_BUTTONS,
  INTENTS,
  REPEATABLE,
  STICK_DEADZONE,
  intentFromKey,
  intentsFromAxes,
  shouldPreventDefault,
} from './intents'
import type { ConsoleIntent } from './intents'

describe('keyboard mapping', () => {
  it('maps arrow keys and WASD to the same directions', () => {
    expect(intentFromKey('ArrowUp')).toBe('UP')
    expect(intentFromKey('w')).toBe('UP')
    expect(intentFromKey('ArrowDown')).toBe('DOWN')
    expect(intentFromKey('s')).toBe('DOWN')
    expect(intentFromKey('ArrowLeft')).toBe('LEFT')
    expect(intentFromKey('a')).toBe('LEFT')
    expect(intentFromKey('ArrowRight')).toBe('RIGHT')
    expect(intentFromKey('d')).toBe('RIGHT')
  })

  it('maps the action keys', () => {
    expect(intentFromKey('z')).toBe('A')
    expect(intentFromKey(' ')).toBe('A')
    expect(intentFromKey('x')).toBe('B')
    expect(intentFromKey('Escape')).toBe('B')
    expect(intentFromKey('Enter')).toBe('START')
    expect(intentFromKey('Shift')).toBe('SELECT')
  })

  it('is case insensitive, so caps lock does not break the console', () => {
    expect(intentFromKey('W')).toBe('UP')
    expect(intentFromKey('Z')).toBe('A')
    expect(intentFromKey('ARROWLEFT')).toBe('LEFT')
  })

  it('keeps `a` as LEFT even though the A button exists', () => {
    // Deliberate. This is the emulator layout everyone already has in their
    // hands. Swapping it to match the letter would break muscle memory.
    expect(intentFromKey('a')).toBe('LEFT')
    expect(intentFromKey('a')).not.toBe('A')
  })

  it('returns null for anything unmapped', () => {
    for (const key of ['q', 'F5', 'Tab', 'Control', '1', 'ArrowUpLeft']) {
      expect(intentFromKey(key), key).toBeNull()
    }
  })

  it('covers every intent in the vocabulary', () => {
    const reachable = new Set<ConsoleIntent>()
    for (const key of [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'z',
      'x',
      'Enter',
      'Shift',
    ]) {
      const intent = intentFromKey(key)
      if (intent) reachable.add(intent)
    }
    // If an intent exists that no key reaches, the app is not fully
    // keyboard-navigable and Gate 1.2 is a lie.
    expect(reachable).toEqual(new Set(INTENTS))
  })
})

describe('preventDefault', () => {
  it('swallows every mapped key', () => {
    // Arrows and space scroll the page, which makes the whole console jump.
    for (const key of ['ArrowUp', 'ArrowDown', ' ', 'Enter']) {
      expect(shouldPreventDefault(key), key).toBe(true)
    }
  })

  it('leaves unmapped keys alone, so refresh and devtools still work', () => {
    for (const key of ['F5', 'Tab', 'r']) {
      expect(shouldPreventDefault(key), key).toBe(false)
    }
  })
})

describe('auto-repeat policy', () => {
  it('repeats directions', () => {
    expect(REPEATABLE.has('UP')).toBe(true)
    expect(REPEATABLE.has('DOWN')).toBe(true)
    expect(REPEATABLE.has('LEFT')).toBe(true)
    expect(REPEATABLE.has('RIGHT')).toBe(true)
  })

  it('never repeats an action', () => {
    // Holding A on a confirm screen must not open eight positions.
    expect(REPEATABLE.has('A')).toBe(false)
    expect(REPEATABLE.has('B')).toBe(false)
    expect(REPEATABLE.has('START')).toBe(false)
    expect(REPEATABLE.has('SELECT')).toBe(false)
  })
})

describe('gamepad', () => {
  it('uses the standard button layout', () => {
    expect(GAMEPAD_BUTTONS[0]).toBe('A')
    expect(GAMEPAD_BUTTONS[1]).toBe('B')
    expect(GAMEPAD_BUTTONS[9]).toBe('START')
    expect(GAMEPAD_BUTTONS[12]).toBe('UP')
    expect(GAMEPAD_BUTTONS[15]).toBe('RIGHT')
  })

  it('ignores a stick inside the deadzone', () => {
    expect(intentsFromAxes(0, 0)).toEqual([])
    expect(intentsFromAxes(0.4, 0.4)).toEqual([])
    expect(intentsFromAxes(-0.49, 0.49)).toEqual([])
  })

  it('emits exactly one direction, never a diagonal', () => {
    // A cursor that moves diagonally in a list feels broken, and every screen
    // here is a list or a grid.
    expect(intentsFromAxes(0.9, 0.8)).toEqual(['RIGHT'])
    expect(intentsFromAxes(0.8, 0.9)).toEqual(['DOWN'])
    expect(intentsFromAxes(-0.9, -0.9)).toHaveLength(1)
  })

  it('reads the y axis with screen orientation, not maths orientation', () => {
    // Positive y is DOWN on a gamepad, as it is in the DOM.
    expect(intentsFromAxes(0, 1)).toEqual(['DOWN'])
    expect(intentsFromAxes(0, -1)).toEqual(['UP'])
  })

  it('fires exactly at the deadzone boundary', () => {
    expect(intentsFromAxes(STICK_DEADZONE, 0)).toEqual(['RIGHT'])
    expect(intentsFromAxes(STICK_DEADZONE - 0.001, 0)).toEqual([])
  })
})
