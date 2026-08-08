/**
 * The pixel primitives. Fifteen components. All of them are rectangles.
 *
 * Two changes from the inventory in DESIGN-SYSTEM.md section 6, both made
 * while building them:
 *
 *   Bevel is GONE. On a light field, the hard 1px border plus the offset
 *   shadow does the job a bevel does in a dark system, and it does it with one
 *   fewer concept to keep consistent.
 *
 *   Value is NEW, and it earns the slot. Every number on the live screen is
 *   changing, so tabular figures and a sign glyph are not a formatting detail,
 *   they are what stops the layout shifting and what makes the sign survive a
 *   grayscale screenshot.
 */

export { PixelText, Value, Stat } from './text'
export type { TextRole, TextTone } from './text'

export { Panel, Sunk, Dialog, Field, Scanlines } from './surface'

export { Row, List, Tabs, Toggle } from './select'

export { Meter, BinStrip, Pin, Chart } from './data'
export type { BinState, PinKind } from './data'

export { Sprite, Marquee, FRAMES } from './motion'
export type { FrameName, SpriteAnimation } from './motion'
