import { PixelText } from './text'

/**
 * Meter. Segmented, never a smooth fill.
 *
 * A smooth bar is a continuous value pretending to be precise. Segments are
 * honest about their resolution and they land on the 4px grid for free, which
 * a percentage width does not.
 */
export function Meter({
  value,
  max = 100,
  segments = 20,
  label,
}: {
  value: number
  max?: number
  segments?: number
  label?: string
}) {
  const filled = Math.round((Math.min(value, max) / max) * segments)

  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <div className="flex justify-between">
          <PixelText role="micro" tone="dim" upper>
            {label}
          </PixelText>
          <PixelText role="micro" tone="dim" className="tabular-nums">
            {Math.round(value)}
          </PixelText>
        </div>
      ) : null}
      <div
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="flex gap-px"
      >
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-1 ${i < filled ? 'bg-accent' : 'bg-sunk'}`}
          />
        ))}
      </div>
    </div>
  )
}

export type BinState = 'empty' | 'in-range' | 'active' | 'out'

const BIN_CLASS: Record<BinState, string> = {
  empty: 'bg-sunk',
  'in-range': 'bg-accent',
  active: 'bg-ink',
  out: 'bg-screen border-edge border',
}

/**
 * The bin strip. Bins ARE the chart, and that is the point.
 *
 * Each tile is an 8px column. The active bin is the darkest thing on screen so
 * it is findable in a photograph from four metres, which is Gate 2.3.
 */
export function BinStrip({
  bins,
  height = 48,
}: {
  bins: ReadonlyArray<{ state: BinState; fill: number }>
  height?: number
}) {
  return (
    <div
      className="border-edge bg-screen flex items-end gap-px border p-1"
      style={{ height }}
      aria-hidden="true"
    >
      {bins.map((bin, i) => (
        <span
          key={i}
          className={`w-2 ${BIN_CLASS[bin.state]}`}
          style={{ height: `${Math.max(6, bin.fill * 100)}%` }}
        />
      ))}
    </div>
  )
}

export type PinKind = 'safe' | 'hot' | 'blocked' | 'held'

/**
 * Map pin. Shape first, colour second.
 *
 * A judge should be able to read the tracker map in a grayscale screenshot.
 * That is why these are a square, a diamond, a cross, and a ring rather than
 * four coloured dots.
 */
export function Pin({
  kind,
  selected = false,
  size = 12,
}: {
  kind: PinKind
  selected?: boolean
  /** 12 on a map, where the pin IS the datum. 8 in a legend, where it is a
   * reference to one and competing with the label beside it for weight. */
  size?: 8 | 12
}) {
  const base =
    size === 8
      ? 'inline-block h-2 w-2 border-edge border'
      : 'inline-block h-3 w-3 border-edge border'
  const shape = {
    safe: '',
    hot: 'rotate-45',
    blocked: 'rounded-full',
    held: 'rounded-full border-2',
  }[kind]
  const fill = {
    safe: 'bg-accent',
    hot: 'bg-warn',
    blocked: 'bg-sunk',
    held: 'bg-panel',
  }[kind]

  return (
    <span
      role="img"
      aria-label={kind}
      className={`${base} ${shape} ${fill} ${selected ? 'ring-ink ring-2' : ''}`}
    />
  )
}

/**
 * Chart. A stepped SVG polyline, hand-rolled.
 *
 * lightweight-charts is excellent and it is wrong here: it renders antialiased
 * lines with smooth interpolation, which is the exact opposite of the fixed
 * grid. Fighting a chart library into looking like 1998 costs more than drawing
 * the segments.
 */
export function Chart({
  series,
  width = 240,
  height = 96,
  band,
}: {
  series: ReadonlyArray<number>
  width?: number
  height?: number
  /** The user's range, drawn as a band behind the line. */
  band?: { low: number; high: number }
}) {
  if (series.length < 2) return null

  const min = Math.min(...series, band?.low ?? Infinity)
  const max = Math.max(...series, band?.high ?? -Infinity)
  const span = max - min || 1
  const y = (v: number) => height - ((v - min) / span) * height
  const step = width / (series.length - 1)

  // Stepped, not interpolated. Each sample holds its value until the next one.
  const points: Array<string> = []
  series.forEach((v, i) => {
    const px = Math.round(i * step)
    points.push(`${px},${Math.round(y(v))}`)
    if (i < series.length - 1) {
      points.push(`${Math.round((i + 1) * step)},${Math.round(y(v))}`)
    }
  })

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="border-edge bg-screen border"
      role="img"
      aria-label="Price history"
    >
      {band ? (
        <>
          <rect
            x={0}
            y={Math.round(y(band.high))}
            width={width}
            height={Math.max(1, Math.round(y(band.low) - y(band.high)))}
            fill="var(--color-sunk)"
          />
          {/* The edges, drawn. A wide band fills most of the box, and a fill
              with no boundary reads as "the chart has a light background"
              rather than as "this is your range". The two lines are the whole
              point of the band being there. */}
          {[band.high, band.low].map((edge) => (
            <line
              key={edge}
              x1={0}
              x2={width}
              y1={Math.round(y(edge))}
              y2={Math.round(y(edge))}
              stroke="var(--color-ink-dim)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          ))}
        </>
      ) : null}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth={1}
        shapeRendering="crispEdges"
      />
    </svg>
  )
}
