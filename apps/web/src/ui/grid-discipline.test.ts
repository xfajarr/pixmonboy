import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Gate 1.4: every primitive is on the 4px grid.
 *
 * Tailwind's base unit is 4px, so a spacing utility cannot be off-grid. The
 * one way back onto a bad number is an arbitrary value, `p-[7px]`. This test
 * reads the source of every component and fails on one.
 *
 * It is a lint rule wearing a test's clothes, and it lives here because a
 * custom ESLint rule for it would cost an hour and this cost ten minutes.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url))

function walk(dir: string): Array<string> {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : []
  })
}

// game/ is in here because that is where the screens live, and a screen is
// where an off-grid number actually gets written. ui/ is fifteen components
// nobody edits again; the screens are the moving target.
const files = [
  ...walk(join(SRC, 'ui')),
  ...walk(join(SRC, 'routes')),
  ...walk(join(SRC, 'game')),
]

/** `p-[7px]`, `gap-[13px]`, `mt-[3px]` and friends. */
const ARBITRARY_PX =
  /\b(?:[mp][trblxy]?|gap(?:-[xy])?|w|h|inset|top|left|right|bottom|size)-\[(-?\d+(?:\.\d+)?)px\]/g

/** `text-[15px]`. The five roles are the only sizes that exist. */
const ARBITRARY_TEXT = /\btext-\[(\d+(?:\.\d+)?)px\]/g

describe('the 4px grid holds', () => {
  it('finds the component source to check', () => {
    expect(files.length).toBeGreaterThan(4)
  })

  for (const file of files) {
    const rel = file.slice(SRC.length).replace(/\\/g, '/')
    const source = code(file)

    it(`${rel} uses no off-grid arbitrary spacing`, () => {
      const offenders = [...source.matchAll(ARBITRARY_PX)]
        .filter(([, px]) => Number(px) % 4 !== 0)
        .map(([match]) => match)
      expect(offenders, `off the 4px grid: ${offenders.join(', ')}`).toEqual([])
    })

    it(`${rel} uses only the five type roles`, () => {
      const offenders = [...source.matchAll(ARBITRARY_TEXT)]
        .filter(([, px]) => ![8, 16, 32].includes(Number(px)))
        .map(([match]) => match)
      expect(
        offenders,
        `a bitmap font at a non-integer multiple resamples: ${offenders.join(', ')}`,
      ).toEqual([])
    })
  }
})

/**
 * Comments explain the rules, so they contain the words the rules forbid.
 * Strip them, or every test below fails on its own documentation.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('motion rules hold in component source', () => {
  const all = files.map(code).join('\n')

  it('never eases in', () => {
    // ease-in delays the first movement, which is the exact moment the user is
    // watching, and it reads as lag.
    expect(all).not.toMatch(/\bease-in\b(?!-out)/)
  })

  it('never scales on press', () => {
    // Scaling a pixel panel resamples its border and the crisp edge smears for
    // the duration of the press. The 1px offset is the pixel-native equivalent.
    expect(all).not.toMatch(/active:scale-/)
  })

  it('never animates the selection cursor', () => {
    // The single most common way a retro UI ends up feeling slow. It looks
    // charming in a GIF and it is unbearable on the two hundredth press.
    const select = code(join(SRC, 'ui/select.tsx'))
    expect(select).not.toMatch(/transition|duration-/)
  })
})

describe('the console boundary holds', () => {
  const consoleFiles = walk(join(SRC, 'console'))

  it('has console source to check', () => {
    expect(consoleFiles.length).toBeGreaterThan(3)
  })

  for (const file of consoleFiles) {
    const rel = file.slice(SRC.length).replace(/\\/g, '/')
    it(`${rel} does not know this app is about money`, () => {
      const source = code(file)
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
        ([, spec]) => spec,
      )
      const forbidden = imports.filter((spec) =>
        /(^|\/)(lib|chain|server|game|types)\//.test(spec),
      )
      expect(
        forbidden,
        `ARCHITECTURE.md section 3: ${forbidden.join(', ')}`,
      ).toEqual([])
    })
  }
})
