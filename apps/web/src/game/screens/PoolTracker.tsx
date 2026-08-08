import { useState } from 'react'
import { useConsoleIntent } from '../../console/useConsoleInput'
import { characters } from '../../config/brand'
import { GATE_COPY } from '../../lib/scoring/gates'
import { ageInDays, compactUsd } from '../../lib/format'
import { FIXTURE_NOW } from '../fixtures'
import { nextPin, panFor, riskBand, scoreToPosition } from '../map'
import { BAND_FILL, WorldMap } from '../WorldMap'
import { MapPin, PIN_SIZE, PIN_SIZE_SELECTED } from '../MapPin'
import { Meter, Panel, PixelText, Sprite } from '../../ui'
import type { ReactNode } from 'react'
import type { CharacterId } from '../../config/brand'
import type { ScoredPool } from '../fixtures'
import type { CursorDirection } from '../map'
import type { GateSet } from '../../types/domain'

/**
 * S5, the pool tracker. SCREEN-DETAIL.md section 8.
 *
 * A component, not a route, exactly like `InRange`: it takes the already
 * scored, already gated pools and two callbacks, and knows nothing about
 * `useSession` or `useNavigate`. The route decides difficulty and GOD MODE by
 * calling `scoredPools()`; this file only decides how to look at the result.
 */
export interface PoolTrackerProps {
  /** Every pool at the caller's difficulty, filtered-out ones INCLUDED.
   * fixtures.ts returns them on purpose so this screen can draw them dim. */
  pools: Array<ScoredPool>
  /** The player's Monanimal, which is also the tier: brand.ts's `characters`
   * map answers both `label` and `tier` from this one id. */
  characterId: CharacterId
  /** The same gate set `pools` was scored against. Drawn as the shaded region
   * on the map, so the box and the pins can never tell different stories. */
  gates: GateSet
  onPlayPool: (pairAddress: string) => void
  onBack: () => void
}

/**
 * The plot, in pixels.
 *
 * 480 less 16px of page padding (8 each side, matching InRange's p-2) leaves
 * 464. The Y-axis label column is a fixed 16 (four letters, one per row, at
 * text-micro), so the plot itself gets whatever is left. Height is fixed
 * because pins are positioned by percentage of THIS box, not of the screen:
 * a flexible height would mean a pin's percentage position meant a different
 * pixel every time the surrounding text wrapped.
 */
const PLOT_HEIGHT = 200
const RADAR_SIZE = 32

/**
 * Zoom levels, cycled by SELECT.
 *
 * Two, not a continuous range. The map is 100 units across and the pins sit on
 * real scores, so at 2x two pools four points apart finally separate, and past
 * 3x a player is navigating a map they can no longer see the shape of. A
 * continuous zoom would also need its own control; SELECT was free.
 */
const ZOOM_LEVELS = [1, 2, 3] as const

/** Plain words for a 0 to 100 term, so the panel never prints a bare number
 * next to a bar and calls that an explanation. No jargon, per SCREEN-DETAIL.md
 * section 7's difficulty copy rule applied to this screen too. */
function bucket(score: number, low: string, mid: string, high: string): string {
  if (score >= 75) return high
  if (score >= 40) return mid
  return low
}

/**
 * Fee income is not a PoolScore field: HEAT's `turnover` term is a normalised
 * 0-100 SCORE, not a percentage a beginner can read. This is a separate,
 * openly heuristic estimate, exactly like `InRange.tsx`'s WIDTH_K: PRD.md
 * never names a per-swap fee rate because Pool does not carry LFJ's real
 * per-bin fee parameter yet (Lane B phase 3 item), so 30bps stands in as a
 * representative Liquidity Book fee until a live rate replaces it. The label
 * next to the number is what keeps this honest either way.
 */
const ASSUMED_FEE_RATE = 0.003

/** Null when volume is unread, so the caller renders "not read" and not a 0%. */
function feeIncomePct(pool: ScoredPool['pool']): number | null {
  if (pool.volume24hUsd === null) return null
  if (pool.tvlUsd <= 0) return 0
  return (pool.volume24hUsd / pool.tvlUsd) * ASSUMED_FEE_RATE * 365 * 100
}

/** Canned, per CLAUDE.md rule 3: nothing on this screen waits on a model. */
const QUOTES: Record<CharacterId, string> = {
  molandak: 'deep, old, boring. boring is good.',
  moyaki: 'it moves. so do I. we get along.',
  mouch: 'if it is not shaking, why bother.',
}

const DIRECTIONS: ReadonlySet<CursorDirection> = new Set([
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
])

export function PoolTracker({
  pools,
  characterId,
  gates,
  onPlayPool,
  onBack,
}: PoolTrackerProps) {
  const [view, setView] = useState<'map' | 'inspect'>('map')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [zoomStep, setZoomStep] = useState(0)
  const zoom = ZOOM_LEVELS[zoomStep]

  const character = characters[characterId]
  const passing = pools.filter((p) => p.passes)
  const selected = pools[cursorIndex]

  useConsoleIntent((intent) => {
    // Gate 2.4's empty state only has one control. Handled first so the map
    // and inspect branches below never have to think about an undefined
    // `selected`.
    if (passing.length === 0) {
      if (intent === 'B') onBack()
      return
    }

    if (view === 'inspect') {
      if (intent === 'B') {
        setView('map')
        return
      }
      if (intent === 'A' && selected.passes) {
        // A pool that failed a gate has no PLAY action to fire. The gates
        // exist to stop exactly this, and GOD MODE still routes through
        // `passes`, which by then means only "the honeypot check cleared."
        onPlayPool(selected.pool.pairAddress)
      }
      return
    }

    if (intent === 'B') {
      onBack()
      return
    }
    if (intent === 'A') {
      setView('inspect')
      return
    }
    // Cycles rather than paired zoom-in and zoom-out buttons: the console has
    // one spare control on this screen, not two, and three levels wrap in one
    // press from the far end.
    if (intent === 'SELECT') {
      setZoomStep((step) => (step + 1) % ZOOM_LEVELS.length)
      return
    }
    if (DIRECTIONS.has(intent as CursorDirection)) {
      setCursorIndex((current) =>
        nextPin(
          pools.map((p) => p.score),
          current,
          intent as CursorDirection,
        ),
      )
    }
  })

  // Gate 2.4: no spinner is a terminal state, and "the filter removed every
  // pool" is exactly as real a state as "here is the map." Not a blank plot:
  // a map with zero live pins looks like a bug, this looks like a sentence.
  if (passing.length === 0) {
    return (
      <div className="bg-screen flex h-full w-full flex-col items-center justify-center gap-3 p-4">
        <Panel className="flex flex-col gap-2">
          <PixelText role="title" upper>
            Nothing passed
          </PixelText>
          <PixelText role="body">
            {character.label}&apos;s filter removed every pool at this
            difficulty. Try an easier tier.
          </PixelText>
        </Panel>
        <PixelText role="micro" tone="dim" upper>
          B back
        </PixelText>
      </div>
    )
  }

  return (
    <div className="bg-screen flex h-full w-full flex-col gap-1 p-2">
      {/* Three columns, not justify-between, for the same reason S7's header
          is a grid: with three items of unequal width, "spread them apart"
          puts the middle one wherever the other two leave room, and it drifts
          every time the count changes from one digit to two. */}
      <div className="grid grid-cols-3 items-baseline">
        <div className="flex items-baseline gap-1">
          <PixelText role="body" upper>
            Pool tracker
          </PixelText>
          {/* The densest screen in the product and the one that reads most
              like live market instrumentation: LIQUIDITY, 24H VOLUME, FEE
              INCOME %/yr, AGE, SAFETY, HEAT. Every one of those is a committed
              fixture, and all fourteen pairAddress values in
              data/pools.fixture.json are placeholders. Four other screens
              already carry this label; this was the one that needed it most
              and did not have it. Eight pixels of honesty. */}
          <PixelText role="micro" tone="dim" upper>
            Fixture
          </PixelText>
        </div>
        <PixelText role="micro" tone="dim" className="text-center" upper>
          {character.label} · {character.tier}
        </PixelText>
        <PixelText role="micro" upper className="text-right tabular-nums">
          {passing.length} passed
        </PixelText>
      </div>

      {view === 'inspect' ? (
        <InspectPanel
          entry={selected}
          quote={QUOTES[characterId]}
          quoteSpeaker={character.label}
          characterId={characterId}
        />
      ) : (
        <MapView
          pools={pools}
          cursorIndex={cursorIndex}
          characterLabel={character.label}
          gates={gates}
          zoom={zoom}
          onZoom={(delta) =>
            setZoomStep((step) =>
              Math.max(0, Math.min(ZOOM_LEVELS.length - 1, step + delta)),
            )
          }
        />
      )}
    </div>
  )
}

function MapView({
  pools,
  cursorIndex,
  characterLabel,
  gates,
  zoom,
  onZoom,
}: {
  pools: Array<ScoredPool>
  cursorIndex: number
  characterLabel: string
  gates: GateSet
  zoom: number
  onZoom: (delta: number) => void
}) {
  const cursor = scoreToPosition(pools[cursorIndex].score)
  // The map slides under a fixed window rather than the window moving over a
  // fixed map, so the plot box, the pins, and the minimap all keep working in
  // the same 0-100 space at every zoom level.
  const panX = panFor(cursor.leftPct, zoom)
  const panY = panFor(cursor.topPct, zoom)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex gap-1">
        {/* HEAT, one letter per row rather than a rotated string: a bitmap
            font rotated with CSS resamples, and four short lines cost nothing
            a transform would have saved. */}
        <div className="flex w-4 shrink-0 flex-col items-center justify-center">
          {['H', 'E', 'A', 'T'].map((letter) => (
            <PixelText key={letter} role="micro" tone="dim">
              {letter}
            </PixelText>
          ))}
        </div>

        <div
          className="border-edge relative flex-1 overflow-hidden border"
          style={{ height: PLOT_HEIGHT }}
        >
          {/* Everything that lives in score space moves together. The minimap
              and the zoom badge sit OUTSIDE this, which is what keeps them
              readable while the map is panned. */}
          <div
            className="absolute inset-0"
            style={{
              transform: `scale(${zoom}) translate(${panX}%, ${panY}%)`,
              transformOrigin: '0 0',
            }}
          >
            <WorldMap minSafety={gates.minSafety} maxHeat={gates.maxHeat} />

            {pools.map((entry, index) => {
              const { leftPct, topPct } = scoreToPosition(entry.score)
              const selected = index === cursorIndex
              return (
                <div
                  key={entry.pool.pairAddress}
                  className="absolute"
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    // The pin rides in score space with the map, so the zoom
                    // would double its size too and turn the map into
                    // fourteen discs touching each other. Cancelling the zoom
                    // here keeps the glyph one size at every level and lets
                    // the zoom do the only job it exists for, which is
                    // separating pins that overlap.
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                  }}
                >
                  <MapPin
                    band={riskBand(entry.score.safety)}
                    filtered={!entry.passes}
                    selected={selected}
                    size={selected ? PIN_SIZE_SELECTED : PIN_SIZE}
                  />
                  {/* Only the selected pool names itself. Fourteen labels is
                      not a map, it is a list with coordinates. */}
                  {selected ? (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 pt-1 whitespace-nowrap">
                      <PixelText role="micro" upper>
                        {entry.pool.tokenX.symbol}
                      </PixelText>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {/* The coastline, named. The axes have not changed and a judge can
              still read them off the line below the plot; these are the same
              two facts in the map's own words. */}
          <div className="pointer-events-none absolute inset-0 flex items-end justify-between p-1">
            <PixelText role="micro" tone="dim" upper>
              Deep water
            </PixelText>
            <PixelText role="micro" tone="dim" upper>
              Safe harbour
            </PixelText>
          </div>

          <Minimap pools={pools} cursorIndex={cursorIndex} zoom={zoom} />
        </div>
      </div>

      <div className="flex items-center justify-between pl-5">
        <PixelText role="micro" tone="dim" upper>
          Safety, increasing right. Heat, increasing up.
        </PixelText>
        {/*
          TAPPABLE ZOOM, AND SELECT STILL DOES IT TOO.

          Below the plot rather than floating on it: the map is the one thing
          on this screen with nothing to spare, and a control parked on the
          corner of a map covers data at exactly the zoom level where data got
          dense. Down here the targets are also big enough for a thumb, which
          a 20px badge in the corner of a 480px screen never was on a phone.

          The keyboard path is not a fallback for these. SELECT cycles and
          these step, so every input the console has can reach the feature and
          neither one is the "real" control. ARCHITECTURE.md 3: a screen never
          grows an action the D-pad cannot perform.
        */}
        <div className="flex items-center gap-1">
          <ZoomButton
            label="-"
            title="Zoom out"
            disabled={zoom === ZOOM_LEVELS[0]}
            onClick={() => onZoom(-1)}
          />
          <PixelText
            role="micro"
            upper
            className="w-6 text-center tabular-nums"
          >
            {zoom}x
          </PixelText>
          <ZoomButton
            label="+"
            title="Zoom in"
            disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            onClick={() => onZoom(1)}
          />
          <PixelText role="micro" tone="dim" upper>
            Select
          </PixelText>
        </div>
      </div>

      {/* Colour is the SAFETY band and it means the same thing on every screen
          a pool can be reached from. Whether THIS tier's filter accepted it is
          a different question, so it gets its own entry rather than a fourth
          colour that would collide with the first three. */}
      <div className="flex items-center gap-3 pl-5">
        {(
          [
            { band: 'green', label: 'Safe' },
            { band: 'amber', label: 'Risky' },
            { band: 'red', label: 'Very risky' },
          ] as const
        ).map((item) => (
          <div key={item.band} className="flex items-center gap-1">
            <MapPin band={item.band} size={10} />
            <PixelText role="micro" tone="dim" upper>
              {item.label}
            </PixelText>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <MapPin band="green" size={10} filtered />
          <PixelText role="micro" tone="dim" upper>
            {characterLabel} skipped
          </PixelText>
        </div>
      </div>

      {/* `mt-auto` pins the controls to the bottom EDGE of the screen rather
          than to the bottom of the content above them. */}
      <div className="mt-auto flex items-center justify-between">
        <PixelText role="micro" upper>
          Move cursor
        </PixelText>
        <PixelText role="micro" upper>
          A Inspect
        </PixelText>
        <PixelText role="micro" upper>
          B Back
        </PixelText>
      </div>
    </div>
  )
}

/** A pressable on the pixel grid: 1px down and right on :active via
 * `.pressable`, never a scale, because scaling a pixel panel resamples its
 * border. DESIGN-SYSTEM.md section 9. */
function ZoomButton({
  label,
  title,
  disabled,
  onClick,
}: {
  label: string
  title: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="pressable border-edge bg-panel text-ink disabled:text-ink-dim flex h-4 w-4 items-center justify-center border font-bold leading-none disabled:opacity-40"
    >
      {label}
    </button>
  )
}

/**
 * The radar, which is a minimap now and therefore has something in it.
 *
 * It used to be a sweeping hand over an empty circle: motion that stated
 * nothing, and the first thing anyone asked about it was what it was for. A
 * minimap gives the same "this is scanning" read and answers the question the
 * zoom created, which is where the window sits on the whole map. The sweep
 * stays, behind the dots, because it is what makes it look alive.
 */
function Minimap({
  pools,
  cursorIndex,
  zoom,
}: {
  pools: Array<ScoredPool>
  cursorIndex: number
  zoom: number
}) {
  const cursor = scoreToPosition(pools[cursorIndex].score)
  const windowPct = 100 / zoom

  return (
    <div
      className="border-edge bg-screen absolute bottom-1 left-1 overflow-hidden border"
      style={{ width: RADAR_SIZE, height: RADAR_SIZE }}
      aria-hidden="true"
    >
      <span
        className="radar-sweep-hand bg-accent absolute top-1/2 left-1/2 h-px w-1/2 origin-left opacity-50"
        style={{ transform: 'translateY(-50%)' }}
      />
      {pools.map((entry) => {
        const { leftPct, topPct } = scoreToPosition(entry.score)
        return (
          <span
            key={entry.pool.pairAddress}
            className="absolute"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: 2,
              height: 2,
              transform: 'translate(-50%, -50%)',
              background: BAND_FILL[riskBand(entry.score.safety)],
            }}
          />
        )
      })}
      {zoom > 1 ? (
        <span
          className="border-ink absolute border"
          style={{
            left: `${-panFor(cursor.leftPct, zoom)}%`,
            top: `${-panFor(cursor.topPct, zoom)}%`,
            width: `${windowPct}%`,
            height: `${windowPct}%`,
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * S5's inspect panel, in four banded sections.
 *
 * The first cut ran eleven rows of `text-micro` down the screen at one weight
 * with 120px of dead space under them. Everything was present and nothing was
 * findable: a reader had to scan the whole panel to locate the pair name,
 * because the pair name looked exactly like the fee estimate.
 *
 * So: rules between sections, one job each, and the vertical budget spent on
 * the two things a player actually decides from. WHICH POOL is a title now,
 * and the score breakdown gets a column of its own rather than trailing off
 * the end of a sentence. The room this needs was already on the screen, it was
 * just sitting unused at the bottom.
 */
function InspectPanel({
  entry,
  quote,
  quoteSpeaker,
  characterId,
}: {
  entry: ScoredPool
  quote: string
  quoteSpeaker: string
  characterId: CharacterId
}) {
  const { pool, score, gates, passes } = entry
  // The proven minimum, so a pool whose exact birthday is unreadable reads as
  // "at least this old" rather than borrowing a number it does not have.
  const ageSeconds = Math.max(0, FIXTURE_NOW - pool.createdAt)
  const ageIsExact = pool.createdAtIsExact
  const feeIncome = feeIncomePct(pool)

  /**
   * THE WORST POOL IN THE SET IS THE ONE THAT BREAKS THE LAYOUT.
   *
   * A pool can fail five gates at once, and `evaluateGates` collects all of
   * them on purpose. Five sentences is 70px this panel did not budget for, so
   * the footer, which is the Monanimal and both button labels, was pushed off
   * the bottom of a screen that cannot scroll. The controls vanished on the
   * exact pool that most needed explaining.
   *
   * Two fixes, because one is not enough. The section padding tightens when
   * there is a lot to say, and the failure list is the FLEXIBLE region below,
   * so anything left over is absorbed there instead of shoving the footer.
   * Cutting the list short was never an option: PRD.md 12 says every reason
   * shows, and a pool this bad is exactly the one a judge will click.
   */
  /**
   * Three tiers, not two.
   *
   * `failures.length > 2` was one boolean shared by 3, 4 AND 5 failures, so all
   * three got the same allocation and the fifth reason laid out below the
   * `overflow-hidden` edge of the box at 4. below: clientHeight 67 against
   * scrollHeight 84, no seam, no scrollbar, the sentence simply gone. It was
   * the worst pool in the set that lost a line, which is the one a judge clicks.
   *
   * Note for whoever reads the comment above this one: it cites "PRD.md 12 says
   * every reason shows". PRD section 12 says no such thing. The rule is this
   * file's own, which makes it a promise to keep rather than one to cite.
   */
  const dense = gates.failures.length > 2
  const veryDense = gates.failures.length > 4
  const pad = veryDense ? 'py-0.5' : dense ? 'py-1' : 'py-2'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 1. WHICH POOL. The only thing on this screen at title weight, so the
             eye lands here first and knows what the rest is about. */}
      <div
        className={`border-edge flex items-center justify-between border-b ${dense ? 'pb-1' : 'pb-2'}`}
      >
        <div className="flex items-center gap-2">
          <MapPin band={riskBand(score.safety)} filtered={!passes} />
          <PixelText role="title" upper>
            {pool.tokenX.symbol} / {pool.tokenY.symbol}
          </PixelText>
        </div>
        {/* A passive label. CLAUDE.md rule 4: bin step is never a control. */}
        <PixelText role="body" tone="dim" upper>
          Bin step {pool.binStep}
        </PixelText>
      </div>

      {/* 2. WHAT IT IS. Four facts, one per row, label left and value right so
             the numbers form a column the eye can run down. */}
      <div className={`border-edge flex flex-col gap-1 border-b ${pad}`}>
        <Fact label="Liquidity" value={compactUsd(pool.tvlUsd)}>
          <div className="w-16">
            <Meter value={score.liquidityDepth} segments={10} />
          </div>
          <PixelText role="micro" tone="dim">
            {bucket(score.liquidityDepth, 'thin', 'adequate', 'deep')}
          </PixelText>
        </Fact>

        <Fact
          label="24h volume"
          value={
            pool.volume24hUsd === null
              ? 'not read'
              : compactUsd(pool.volume24hUsd)
          }
        />

        <Fact
          label="Fee income"
          value={
            feeIncome === null ? 'not read' : `${feeIncome.toFixed(1)}% / yr`
          }
        >
          {/* PRD.md section 12 rule 1, permanent, never conditional. The
              second line is only true when there IS an estimate; with volume
              unread there is nothing to caveat, and printing the caveat anyway
              would imply a number is hiding behind it. */}
          <PixelText role="micro" tone="dim">
            {feeIncome === null
              ? 'needs 24h volume, which this rpc will not serve'
              : 'estimate, not a promise'}
          </PixelText>
        </Fact>

        <Fact
          label="Age"
          value={
            ageIsExact ? ageInDays(ageSeconds) : `over ${ageInDays(ageSeconds)}`
          }
        >
          <div className="w-16">
            <Meter value={score.poolAge} segments={10} />
          </div>
          <PixelText role="micro" tone="dim">
            {bucket(score.poolAge, 'new', 'settling in', 'established')}
          </PixelText>
        </Fact>
      </div>

      {/* 3. WHY IT SCORED THAT. Every term of both scores, visible. This is
             the whole point of the screen: the answer to "what is your AI
             actually based on" is a sentence a judge can read, not a promise
             to trust a black box. Score left, terms right, so the two headline
             numbers line up under each other instead of hiding at the head of
             two different-length sentences. */}
      <div className={`border-edge flex flex-col gap-1 border-b ${pad}`}>
        <div className="flex items-baseline justify-between gap-2">
          <PixelText role="body" upper>
            Safety {score.safety}
          </PixelText>
          <PixelText role="micro" tone="dim" className="tabular-nums">
            depth {score.liquidityDepth} · age {score.poolAge} · pair{' '}
            {score.quoteQuality} · spread {score.lpConcentrationScore}
          </PixelText>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <PixelText role="body" upper>
            Heat {score.heat}
          </PixelText>
          <PixelText role="micro" tone="dim" className="tabular-nums">
            swing {score.realizedVol} · trade {score.turnover} · buzz{' '}
            {score.momentum}
            {score.momentumDegraded ? ' (offline)' : ''}
          </PixelText>
        </div>
      </div>

      {/* THE FLEXIBLE REGION. Everything above is fixed height and everything
          below is the footer, so this is where the panel absorbs a pool with
          a lot wrong with it. `min-h-0` is what lets a flex child actually
          shrink; without it the box keeps its content height and pushes the
          footer off the bottom of a screen that has no scrollbar. */}
      <div className="min-h-0 flex-1 py-1">
        {!passes ? (
          // GATE_COPY already holds a sentence per failure; every one of them
          // renders, not just the first, because `evaluateGates` collected all
          // of them for exactly this reason.
          <div
            className={`border-edge bg-sunk flex h-full flex-col overflow-hidden border ${
              veryDense ? 'gap-0 p-0.5' : 'gap-1 p-1'
            }`}
          >
            {gates.failures.map((failure) => (
              <PixelText key={failure} role="micro" tone="loss">
                {GATE_COPY[failure]}
              </PixelText>
            ))}
          </div>
        ) : null}
      </div>

      {/* 4. WHO IS TELLING YOU. The Monanimal says its line with its face
             next to it, standing on the control row like a shopkeeper behind
             a counter. `mt-auto` puts it on the bottom edge whether or not
             the failure box above it rendered, so the panel has one shape.
             The idle loop is the same two frame animation every other screen
             uses and it parks on frame 0 under prefers-reduced-motion. */}
      <div className="flex items-end justify-between gap-2 pt-1">
        <PixelText role="micro" className="flex-1">
          &quot;{quote}&quot; - {quoteSpeaker}
        </PixelText>
        <Sprite character={characterId} animation="idle" size={32} />
      </div>

      <div className="flex items-center justify-between">
        {/* A dimmed label that silently does nothing is a dead end: the player
            presses A, gets no response, and has to guess why. When the pool
            failed a gate the button says so, and the reasons are already
            listed directly above it. */}
        <PixelText role="micro" tone={passes ? 'ink' : 'dim'} upper>
          {passes ? 'A Play this pool' : 'Locked by the checks above'}
        </PixelText>
        <PixelText role="micro" upper>
          B Back to map
        </PixelText>
      </div>
    </div>
  )
}

/**
 * One row of section 2: label left, value in a fixed column, colour and words
 * after it. The value column is fixed so four different-length numbers still
 * line up, which is the only reason this is a component and not four divs.
 */
function Fact({
  label,
  value,
  children,
}: {
  label: string
  value: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <PixelText role="micro" tone="dim" upper className="w-20 shrink-0">
        {label}
      </PixelText>
      <PixelText role="body" className="w-16 shrink-0 tabular-nums">
        {value}
      </PixelText>
      {children}
    </div>
  )
}
