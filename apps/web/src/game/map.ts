/**
 * S5, the scatter plot. SCREEN-DETAIL.md section 8.
 *
 * PURE. Two jobs, both geometry, neither touching a score: placing a pin on
 * the plot, and moving a cursor between pins that are already placed. Scoring
 * happens in lib/scoring; this file only knows x and y.
 */

export interface MapPin {
  /** X axis. 0 to 100, per zScore. */
  safety: number
  /** Y axis in DATA space, where more heat is "further up". Screen space
   * inverts this, see `scoreToPosition` below. */
  heat: number
}

/** CSS percentages, ready for `style={{ left, top }}` inside a relatively
 * positioned plot. Percentages are the plot's own coordinate space, not an
 * arbitrary pixel value, so they do not trip the 4px grid check. */
export interface PinPosition {
  leftPct: number
  topPct: number
}

const clampPct = (n: number): number => Math.max(0, Math.min(100, n))

/**
 * SAFETY maps straight to X. HEAT maps to Y, INVERTED.
 *
 * This is the one line in the whole screen where "heat increasing upward"
 * (SCREEN-DETAIL.md 8, PRD.md 7.3) meets CSS, where `top` grows DOWNWARD.
 * A pin with heat 100 belongs at the top of the box, which is `top: 0%`, not
 * `top: 100%`. Get this backwards and every pin still renders, just mirrored,
 * which is exactly the kind of bug a screenshot does not catch and a demo
 * does: Mouch's hot pools would sit calmly at the bottom.
 */
export function scoreToPosition(pin: MapPin): PinPosition {
  return {
    leftPct: clampPct(pin.safety),
    topPct: clampPct(100 - pin.heat),
  }
}

/**
 * The three colours a pin can be, and they are not decoration.
 *
 * Each boundary is a difficulty tier's own SAFETY floor from `thresholds.ts`,
 * so the colour is a fact about which tiers would even consider the pool
 * rather than a mood:
 *
 *   green  safety >= 70   clears EASY, the strictest floor there is
 *   amber  safety >= 30   clears HARD, and nothing above it
 *   red    safety <  30   clears no tier's floor at all
 *
 * Kept as literals rather than read from `gatesFor()` because the bands are a
 * property of the SET of tiers, not of the one tier being played: a pool has
 * to look the same colour on every screen a player can reach it from. When a
 * tier's floor moves, this moves with it, which is what the test asserts.
 */
export type RiskBand = 'green' | 'amber' | 'red'

export function riskBand(safety: number): RiskBand {
  if (safety >= 70) return 'green'
  if (safety >= 30) return 'amber'
  return 'red'
}

/**
 * How far to slide the map so the cursor sits in the middle of the window.
 *
 * Returned as a percentage of the map's own width, to be fed to
 * `translate()` INSIDE a `scale()`, which is why the maths is not just
 * `50 - pct`: translate runs in the unscaled local space and the scale
 * multiplies the result afterwards, so centring at zoom `z` needs `50 / z`.
 *
 * The clamps are the whole reason this is a function and not an expression.
 * Without them a pin near an edge pans the map past its own border and the
 * player is looking at a rectangle of nothing, which reads as the map having
 * broken rather than as the cursor being near the coast.
 */
export function panFor(pct: number, zoom: number): number {
  if (zoom <= 1) return 0
  const centred = 50 / zoom - pct
  const min = 100 / zoom - 100
  return Math.max(min, Math.min(0, centred))
}

export type CursorDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

const distance = (a: MapPin, b: MapPin): number =>
  Math.hypot(a.safety - b.safety, a.heat - b.heat)

/**
 * Move the cursor to the nearest pin in the pressed direction.
 *
 * Candidates are pins strictly beyond the current one on the axis the
 * direction moves (RIGHT means greater SAFETY, UP means greater HEAT, in DATA
 * space, before the Y inversion above ever applies). Among those, the closest
 * by straight-line distance wins, so a press never launches the cursor across
 * the whole map to grab a pin that happens to share an axis value with one
 * sitting right next door.
 *
 * No wrap. A spatial map is not a list: reappearing on the opposite edge
 * relocates the cursor to a spot the eye was not tracking, which is
 * disorienting in a way list-wrap never is. Staying put is the honest answer
 * to "there is nothing further this way".
 */
export function nextPin(
  pins: ReadonlyArray<MapPin>,
  currentIndex: number,
  direction: CursorDirection,
): number {
  // Explicit bounds check rather than trusting `pins[currentIndex]` to be
  // `undefined` when out of range: this project's tsconfig does not turn on
  // `noUncheckedIndexedAccess`, so TypeScript types indexed access as always
  // present, and a truthiness check on it is dead code as far as the type
  // checker is concerned even though it is very much alive at runtime.
  if (currentIndex < 0 || currentIndex >= pins.length) return currentIndex
  const current = pins[currentIndex]

  const beyond = (pin: MapPin): boolean => {
    switch (direction) {
      case 'RIGHT':
        return pin.safety > current.safety
      case 'LEFT':
        return pin.safety < current.safety
      case 'UP':
        return pin.heat > current.heat
      case 'DOWN':
        return pin.heat < current.heat
    }
  }

  let bestIndex = currentIndex
  let bestDistance = Infinity

  pins.forEach((pin, index) => {
    if (index === currentIndex || !beyond(pin)) return
    const d = distance(current, pin)
    if (d < bestDistance) {
      bestDistance = d
      bestIndex = index
    }
  })

  return bestIndex
}
