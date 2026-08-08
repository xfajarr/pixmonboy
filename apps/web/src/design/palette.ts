/**
 * DAYLIGHT palette, mirrored from src/styles/tokens.css.
 *
 * This exists so the palette can be tested and so canvas code (which cannot
 * read CSS custom properties cheaply per frame) has typed constants.
 *
 * palette.test.ts fails if this file and tokens.css ever disagree, so the
 * mirror cannot silently rot.
 */

export const daylight = {
  screen: '#f4f1ff',
  panel: '#ffffff',
  sunk: '#ddd7fe',

  ink: '#0e091c',
  inkDim: '#4a35c4',
  inkInvert: '#ffffff',

  edge: '#0e091c',
  edgeSoft: '#9b87ff',

  accent: '#6e54ff',
  accentInk: '#ffffff',

  gain: '#1e7a34',
  loss: '#c41a1a',

  alarm: '#ff3b3b',
  alarmInk: '#0e091c',

  warn: '#ffae45',
  warnInk: '#0e091c',

  character: '#6e54ff',
} as const

export type DaylightColor = keyof typeof daylight

/** The CSS custom property name for each palette entry. */
export const cssVar: Record<DaylightColor, string> = {
  screen: '--color-screen',
  panel: '--color-panel',
  sunk: '--color-sunk',
  ink: '--color-ink',
  inkDim: '--color-ink-dim',
  inkInvert: '--color-ink-invert',
  edge: '--color-edge',
  edgeSoft: '--color-edge-soft',
  accent: '--color-accent',
  accentInk: '--color-accent-ink',
  gain: '--color-gain',
  loss: '--color-loss',
  alarm: '--color-alarm',
  alarmInk: '--color-alarm-ink',
  warn: '--color-warn',
  warnInk: '--color-warn-ink',
  character: '--color-character',
}

/**
 * Every colour pair the product actually renders, with the floor it must
 * clear. `text` pairs carry words and clear 4.5:1. `object` pairs are bars,
 * borders, and fills that carry meaning without words, and clear 3:1.
 *
 * Pairs that deliberately fail are listed in `decorative` below with the
 * reason, so a failure is a decision on record rather than an oversight.
 */
export const contrastContract: Array<{
  fg: DaylightColor
  bg: DaylightColor
  kind: 'text' | 'object'
  where: string
}> = [
  { fg: 'ink', bg: 'screen', kind: 'text', where: 'all body copy' },
  { fg: 'ink', bg: 'panel', kind: 'text', where: 'panel copy' },
  { fg: 'inkDim', bg: 'screen', kind: 'text', where: 'labels, units, meta' },
  { fg: 'inkDim', bg: 'panel', kind: 'text', where: 'panel labels' },
  { fg: 'gain', bg: 'screen', kind: 'text', where: 'fees earned, profit' },
  { fg: 'gain', bg: 'panel', kind: 'text', where: 'results panel profit' },
  { fg: 'loss', bg: 'screen', kind: 'text', where: 'DAMAGE, negative values' },
  { fg: 'loss', bg: 'panel', kind: 'text', where: 'results panel damage' },
  {
    fg: 'accentInk',
    bg: 'accent',
    kind: 'text',
    where: 'the selected row, every screen',
  },
  {
    fg: 'alarmInk',
    bg: 'alarm',
    kind: 'text',
    where: 'the out of range banner, the demo moment',
  },
  { fg: 'warnInk', bg: 'warn', kind: 'text', where: 'the NAD-SENSE strip' },
  { fg: 'edge', bg: 'screen', kind: 'object', where: '1px panel borders' },
  {
    fg: 'accent',
    bg: 'screen',
    kind: 'object',
    where: 'filled meter segments',
  },
  {
    fg: 'accent',
    bg: 'sunk',
    kind: 'object',
    where: 'meter fill on its track',
  },
  { fg: 'alarm', bg: 'screen', kind: 'object', where: 'the banner as a shape' },
]

/**
 * Pairs that do not meet a contrast floor, on purpose. Each one must be
 * paired with a second, non-colour signal.
 */
export const decorative: Array<{
  pair: string
  measured: string
  why: string
}> = [
  {
    pair: 'edgeSoft on screen',
    measured: '2.6:1',
    why: 'inner rules and dividers only. Never the sole boundary of a control.',
  },
  {
    pair: 'accent as text on screen',
    measured: '4.31:1',
    why: 'accent is a fill colour. Purple text is always inkDim, which is 7.3:1.',
  },
  {
    pair: 'warn as text on screen',
    measured: '1.66:1',
    why: 'warn is a fill colour. NAD-SENSE is a filled strip, never orange words.',
  },
  {
    pair: 'sunk as the hard shadow on panel',
    measured: '1.38:1',
    why: 'the shadow carries no meaning. Every panel is already bounded by a 1px edge, so the shadow is depth only and may be invisible without loss.',
  },
]

export const CONTRAST_FLOOR = { text: 4.5, object: 3 } as const
