import type { RiskBand } from './map'

/**
 * The Monad map. S5's field.
 *
 * WHY THIS IS DRAWN AND NOT GENERATED. A raster background would be resampled
 * at every fit scale, cannot be recoloured by a token, and would be a download
 * sitting in the demo path. More importantly it could not be HONEST: the
 * coastline below is a function of the axes, so the land is where the safe
 * pools are because it is drawn from the same numbers that place them. An
 * illustration would be a picture the pins happen to sit on top of.
 *
 * The axes have not changed and they cannot. X is SAFETY, Y is HEAT inverted,
 * exactly as `scoreToPosition` places every pin. What changed is the costume:
 * a coordinate plane states the rule and a map states the situation, and a
 * beginner reads the second one without being taught the first.
 *
 * All coordinates are score space, 0 to 100 on both axes, stretched to the
 * plot by `preserveAspectRatio="none"`.
 */

/**
 * The west coast, as SAFETY at each 10 units of HEAT, low heat first.
 *
 * It leans right as heat rises, and that lean is the one idea the map is
 * making visual: the hotter a pool runs, the more safety it needs before it
 * counts as solid ground. A flat coast would have been decoration.
 */
const COAST: ReadonlyArray<number> = [
  36, 33, 38, 44, 41, 48, 54, 51, 58, 65, 62,
]

/** Stepped, never sloped. A diagonal edge antialiases and this whole product
 * is a fixed pixel grid; a staircase is what the grid can actually draw. */
function coastPath(): string {
  const step = 100 / (COAST.length - 1)
  // Start at the bottom right corner, run up the right edge, then walk the
  // coast back down. Screen y is inverted because heat increases upward.
  const parts = [`M 100 100`, `L 100 0`]
  COAST.forEach((safety, i) => {
    const heat = 100 - i * step
    const y = 100 - heat
    parts.push(`L ${safety} ${y}`)
    if (i < COAST.length - 1) {
      parts.push(`L ${safety} ${100 - (heat - step)}`)
    }
  })
  parts.push('Z')
  return parts.join(' ')
}

const LAND = coastPath()

/** Blocky texture in the water, so the left half is a sea rather than a gap.
 * Purely decorative and deliberately sparse: an islet where a pin lands would
 * read as a place the pin belongs to. */
const ISLETS: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [
  { x: 8, y: 22, w: 5, h: 4 },
  { x: 18, y: 62, w: 4, h: 3 },
  { x: 12, y: 78, w: 6, h: 4 },
  { x: 24, y: 12, w: 4, h: 3 },
]

export const BAND_FILL: Record<RiskBand, string> = {
  green: 'var(--color-gain)',
  amber: 'var(--color-warn)',
  red: 'var(--color-loss)',
}

/**
 * The Monad mark reads on all three band fills, but not in one colour.
 *
 * `--color-warn` is a light amber and white on it is under 2:1, which is the
 * one combination `tokens.css` calls out as fill-only. Ink on amber is 10.6:1
 * and white on the other two clears 4.8:1, so the glyph swaps rather than the
 * band, and the pin stays readable in a photo of a projector.
 */
export const BAND_GLYPH: Record<RiskBand, string> = {
  green: 'var(--color-ink-invert)',
  amber: 'var(--color-ink)',
  red: 'var(--color-ink-invert)',
}

export function WorldMap({
  minSafety,
  maxHeat,
}: {
  minSafety: number
  maxHeat: number
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {/* Sea. The whole field, with the deep shelf on the far left where no
          tier's safety floor reaches. */}
      <rect x={0} y={0} width={100} height={100} fill="var(--color-sunk)" />
      <rect
        x={0}
        y={0}
        width={20}
        height={100}
        fill="var(--color-edge-soft)"
        opacity={0.35}
      />

      {/* The storm band, the top of the heat axis. Fill only, per tokens. */}
      <rect
        x={0}
        y={0}
        width={100}
        height={12}
        fill="var(--color-warn)"
        opacity={0.3}
      />

      {ISLETS.map((i) => (
        <rect
          key={`${i.x}-${i.y}`}
          x={i.x}
          y={i.y}
          width={i.w}
          height={i.h}
          fill="var(--color-edge-soft)"
          opacity={0.5}
        />
      ))}

      <path d={LAND} fill="var(--color-panel)" />
      <path
        d={LAND}
        fill="none"
        stroke="var(--color-edge)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {/*
        THE TERRITORY THIS TIER WILL LET YOU INTO.

        Same two thresholds the old dashed rectangle drew, and it still has to
        be here: the map says where pools ARE and this says where the filter
        will let you go, which are different questions. Drawn as a claimed
        border rather than as a maths box, and left unfilled so the coastline
        underneath still reads through it.
      */}
      <rect
        x={minSafety}
        y={100 - maxHeat}
        width={100 - minSafety}
        height={maxHeat}
        fill="var(--color-accent)"
        opacity={0.1}
      />
      <rect
        x={minSafety}
        y={100 - maxHeat}
        width={100 - minSafety}
        height={maxHeat}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
