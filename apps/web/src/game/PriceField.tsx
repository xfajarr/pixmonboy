import { PixelText, Sprite } from '../ui'
import { price as fmt } from '../lib/format'
import { yDomain } from './domain'
import type { SpriteAnimation } from '../ui'

/**
 * The screen. Everything else on S7 is a label around this.
 *
 * A price line, the two edges of your range drawn across it, and your
 * Monanimal standing on the price. The whole product in one picture: the
 * character is where the price is, the lines are where you are still earning,
 * and the job is to stay between them.
 *
 * This replaced a strip of bin tiles. The bins were the honest data model and
 * the wrong picture: forty identical tiles say "there is liquidity here" but
 * they cannot say "you are here and the edge is there", which is the only
 * question the player has. The bins still exist underneath, in lib/range, and
 * the range they produce is exactly what the two lines below are drawn from.
 *
 * SVG for the geometry, DOM for the text. The bitmap font renders crisply as
 * DOM and resamples as SVG <text>, so the labels are positioned absolutely
 * over the plot rather than drawn into it.
 */

/** Room on the right for the two edge prices, so the line never runs under
 *  them. A multiple of 4, like everything else. */
const LABEL_GUTTER = 56

export interface PriceFieldProps {
  /** Oldest to newest. The last sample is where the character stands. */
  series: ReadonlyArray<number>
  lowerPrice: number
  upperPrice: number
  width: number
  height: number
  character: string
  animation: SpriteAnimation
  jumping: boolean
  /** Drives the greyed treatment. Nothing is earning while price is outside. */
  earning: boolean
}

export function PriceField({
  series,
  lowerPrice,
  upperPrice,
  width,
  height,
  character,
  animation,
  jumping,
  earning,
}: PriceFieldProps) {
  const plotWidth = width - LABEL_GUTTER
  const { low, high } = yDomain(series, lowerPrice, upperPrice)

  const y = (value: number) => ((high - value) / (high - low)) * height
  const step = plotWidth / Math.max(1, series.length - 1)

  // Stepped, not interpolated, exactly like the Chart primitive: each sample
  // holds its value until the next one. A smooth curve would invent prices
  // that never traded.
  const points: Array<string> = []
  series.forEach((value, i) => {
    const px = Math.round(i * step)
    points.push(`${px},${Math.round(y(value))}`)
    if (i < series.length - 1) {
      points.push(`${Math.round((i + 1) * step)},${Math.round(y(value))}`)
    }
  })

  const nowPrice = series[series.length - 1]
  const nowY = y(nowPrice)
  const nowX = Math.round((series.length - 1) * step)

  // A bound outside the visible window is simply not drawn. When price runs a
  // long way past one edge the other edge stops being the thing worth showing,
  // and squeezing both in would flatten the price line into a straight one.
  const upperVisible = upperPrice <= high && upperPrice >= low
  const lowerVisible = lowerPrice <= high && lowerPrice >= low

  const edge = earning ? 'var(--color-accent)' : 'var(--color-ink-dim)'

  return (
    <div className="relative h-full w-full" style={{ height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Price against your range"
        className="absolute inset-0"
      >
        {/* The band you are earning in. Filled, so "inside" is a place rather
            than a gap between two lines. */}
        {upperVisible || lowerVisible ? (
          <rect
            x={0}
            y={Math.round(y(Math.min(upperPrice, high)))}
            width={plotWidth}
            height={Math.max(
              1,
              Math.round(
                y(Math.max(lowerPrice, low)) - y(Math.min(upperPrice, high)),
              ),
            )}
            fill={earning ? 'var(--color-sunk)' : 'transparent'}
          />
        ) : null}

        {[
          { value: upperPrice, visible: upperVisible },
          { value: lowerPrice, visible: lowerVisible },
        ].map(({ value, visible }) =>
          visible ? (
            <line
              key={value}
              x1={0}
              x2={plotWidth}
              y1={Math.round(y(value))}
              y2={Math.round(y(value))}
              stroke={edge}
              strokeWidth={2}
              strokeDasharray="4 4"
              shapeRendering="crispEdges"
            />
          ) : null,
        )}

        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={2}
          shapeRendering="crispEdges"
        />
      </svg>

      {/* The two edge prices, stated. A dashed line tells you an edge exists;
          only the number tells you how far away it is. */}
      {upperVisible ? (
        <EdgeLabel top={y(upperPrice)} value={upperPrice} label="Up" />
      ) : null}
      {lowerVisible ? (
        <EdgeLabel top={y(lowerPrice)} value={lowerPrice} label="Low" />
      ) : null}

      {/* The character stands ON the price, so its feet are the reading. */}
      <div
        className="absolute"
        style={{
          left: nowX,
          top: nowY,
          transform: 'translate(-50%, -100%)',
        }}
      >
        {/*
          TWO ELEMENTS, TWO TRANSFORMS, AND THAT IS THE WHOLE JUMP FIX.

          `transform` is one property. `sprite-jump` animates it to
          `translateY(-16px)`, which REPLACES whatever the element already had
          rather than adding to it. Both classes used to sit on the wrapper
          above, so pressing A dropped the `translate(-50%, -100%)` that puts
          the character's feet on the price line: it snapped half a sprite
          right and a whole sprite down, hopped, and snapped back. It read as
          the character leaping off the chart, because it was.

          The wrapper positions. The child jumps. Neither one can clobber the
          other, and it stays that way no matter what the animation does next.
        */}
        <div className={jumping ? 'sprite-jump' : undefined}>
          <Sprite character={character} animation={animation} size={32} />
        </div>
      </div>
    </div>
  )
}

function EdgeLabel({
  top,
  value,
  label,
}: {
  top: number
  value: number
  label: string
}) {
  return (
    <div
      className="absolute right-0 flex items-center gap-1"
      style={{ top, transform: 'translateY(-50%)' }}
    >
      <PixelText role="micro" tone="dim" upper>
        {label}
      </PixelText>
      <PixelText role="micro" className="tabular-nums">
        {fmt(value)}
      </PixelText>
    </div>
  )
}
