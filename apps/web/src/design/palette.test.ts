import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../lib/color'
import {
  CONTRAST_FLOOR,
  contrastContract,
  cssVar,
  daylight,
  decorative,
} from './palette'

const tokensCss = readFileSync(
  fileURLToPath(new URL('../styles/tokens.css', import.meta.url)),
  'utf8',
)

/**
 * Pull `--name: value;` out of the token file. The colon is part of the
 * pattern, so `--color-ink` never matches `--color-ink-dim`.
 */
function tokenValue(name: string): string | undefined {
  const match = tokensCss.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
  return match?.[1]?.trim()
}

describe('the palette mirror does not drift', () => {
  for (const [key, hex] of Object.entries(daylight)) {
    it(`${key} matches ${cssVar[key as keyof typeof daylight]} in tokens.css`, () => {
      const fromCss = tokenValue(cssVar[key as keyof typeof daylight])
      expect(
        fromCss,
        `${cssVar[key as keyof typeof daylight]} is missing`,
      ).toBeDefined()
      expect(fromCss?.toLowerCase()).toBe(hex.toLowerCase())
    })
  }
})

describe('every meaningful colour pair clears its contrast floor', () => {
  for (const pair of contrastContract) {
    const floor = CONTRAST_FLOOR[pair.kind]
    it(`${pair.fg} on ${pair.bg} clears ${floor}:1 (${pair.where})`, () => {
      const ratio = contrastRatio(daylight[pair.fg], daylight[pair.bg])
      expect(
        ratio,
        `measured ${ratio.toFixed(2)}:1, needs ${floor}:1`,
      ).toBeGreaterThanOrEqual(floor)
    })
  }
})

describe('the documented failures are still failures', () => {
  // If one of these starts passing, the palette changed and the note in
  // palette.ts is now misleading. That is worth failing over.
  it('edgeSoft on screen is still below the object floor', () => {
    expect(contrastRatio(daylight.edgeSoft, daylight.screen)).toBeLessThan(
      CONTRAST_FLOOR.object,
    )
  })

  it('accent as text on screen is still below the text floor', () => {
    expect(contrastRatio(daylight.accent, daylight.screen)).toBeLessThan(
      CONTRAST_FLOOR.text,
    )
  })

  it('lists a reason for each one', () => {
    expect(decorative.length).toBeGreaterThan(0)
    for (const entry of decorative) {
      expect(entry.why.length).toBeGreaterThan(20)
    }
  })
})

describe('the fixed grid', () => {
  it('sets the Tailwind base unit to 4px', () => {
    expect(tokenValue('--spacing')).toBe('4px')
  })

  it('uses only 8, 16, and 32 for type sizes', () => {
    const sizes = [...tokensCss.matchAll(/--text-([a-z]+):\s*(\d+)px;/g)].map(
      (m) => Number(m[2]),
    )
    expect(sizes.length).toBeGreaterThan(0)
    for (const size of sizes) {
      expect([8, 16, 32]).toContain(size)
    }
  })

  it('keeps every line height on the 4px grid', () => {
    const leads = [
      ...tokensCss.matchAll(/--text-[a-z]+--line-height:\s*(\d+)px;/g),
    ].map((m) => Number(m[1]))
    expect(leads.length).toBeGreaterThan(0)
    for (const lead of leads) {
      expect(lead % 4).toBe(0)
    }
  })

  it('renders the screen at exactly 480x320 logical pixels', () => {
    expect(tokenValue('--screen-w')).toBe('480px')
    expect(tokenValue('--screen-h')).toBe('320px')
  })
})

describe('motion', () => {
  it('never defines an ease-in', () => {
    // ease-in delays the first movement, which is the exact moment the user
    // is watching, and it reads as lag.
    expect(tokensCss).not.toMatch(/--ease-in:/)
  })

  it('provides stepped easings for anything on the grid', () => {
    expect(tokenValue('--ease-sprite-2')).toBe('steps(2, end)')
    expect(tokenValue('--ease-sprite-4')).toBe('steps(4, end)')
    expect(tokenValue('--ease-sprite-8')).toBe('steps(8, end)')
  })
})
