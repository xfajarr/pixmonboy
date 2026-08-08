import { useEffect, useRef, useState } from 'react'
import { useConsoleIntent } from '../../console/useConsoleInput'
import { brand } from '../../config/brand'
import { PixelText, Value } from '../../ui'
import { decideRound, nextStreak, roundWindow, WINDOW_HALF } from '../monspell'
import { MonspellChart } from './MonspellChart'
import type { MonspellCall, MonspellOutcome } from '../monspell'
import type { CharacterId } from '../../config/brand'

/**
 * MONSPELL's screen. A component, not a route: it takes a live price and a
 * back callback and knows nothing about `fetch` or `useNavigate`. The route
 * owns the poll; this screen owns the state machine the player actually plays.
 *
 * THREE STATES, THREE JOBS
 *
 *   pick    the player chooses UP or DOWN. Nothing has started.
 *   running the window is open and the price is ticking. No input but B.
 *   result  the round is decided. A plays again, B leaves.
 *
 * The screen snapshots the start price at the moment A is pressed, from the
 * live price it is holding then. That snapshot is the whole round: the window
 * is timed here, and the outcome is decided against the price it captured, so
 * a poll tick in between can never corrupt a round in progress.
 */

export type MonspellPrice = { priceUsd: number; at: number }

export interface MonspellProps {
  characterId: CharacterId
  /** The live price now. The route polls it and re-renders us. */
  livePrice: MonspellPrice
  /** True until the live price is known, so the screen never invents one. */
  loading: boolean
  onBack: () => void
}

/** Ten seconds. The whole game. */
export const ROUND_SECONDS = 10

/** The window is over. */
export function windowOver(startAtMs: number): boolean {
  return Date.now() - startAtMs >= ROUND_SECONDS * 1000
}

export function Monspell({
  characterId,
  livePrice,
  loading,
  onBack,
}: MonspellProps) {
  const [phase, setPhase] = useState<'pick' | 'running' | 'result'>('pick')
  const [call, setCall] = useState<MonspellCall>('up')
  const [streak, setStreak] = useState(0)

  // The last real price movement, for the character's pose: up plays the run
  // loop, down parks on idle. Tracks the live reading, never the interpolated
  // glide, so the monster only changes posture when the price itself did.
  const lastDirectionRef = useRef<'up' | 'down' | 'flat'>('flat')
  const prevPriceRef = useRef<number | null>(null)
  const [lastDirection, setLastDirection] = useState<'up' | 'down' | 'flat'>(
    'flat',
  )
  useEffect(() => {
    const prev = prevPriceRef.current
    prevPriceRef.current = livePrice.priceUsd
    if (prev === null || livePrice.priceUsd === prev) return
    const dir = livePrice.priceUsd > prev ? 'up' : 'down'
    lastDirectionRef.current = dir
    setLastDirection(dir)
  }, [livePrice])

  // The frozen record of the round in progress, or null while picking.
  // startUsd is captured from livePrice at the instant the round begins. The
  // jail line IS the entry price: the monster starts on it and must leave it
  // in the called direction, which is the whole "escape" picture.
  const round = useRef<{
    startAtMs: number
    call: MonspellCall
    startUsd: number
    window: { low: number; high: number }
  } | null>(null)
  const [outcome, setOutcome] = useState<MonspellOutcome | null>(null)
  const [endUsd, setEndUsd] = useState<number | null>(null)

  // The latest price, readable from inside the window interval. The interval
  // closes over a snapshot; a re-render does not recreate it, so it would
  // decide the round against a stale price if it read `livePrice` directly.
  const livePriceRef = useRef(livePrice)
  livePriceRef.current = livePrice

  // The window clock. Runs while a round is open; ends it at ten seconds.
  useEffect(() => {
    if (phase !== 'running' || !round.current) return
    const timer = setInterval(() => {
      const r = round.current
      if (!r) return
      if (!windowOver(r.startAtMs)) return
      // Decide against the price right now, then freeze the result so the
      // next live price tick cannot rewrite a settled round.
      const result = decideRound({
        call: r.call,
        startUsd: r.startUsd,
        endUsd: livePriceRef.current.priceUsd,
      })
      setOutcome(result)
      setEndUsd(livePriceRef.current.priceUsd)
      setStreak((s) => nextStreak(s, result))
      setPhase('result')
      clearInterval(timer)
    }, 250)
    return () => clearInterval(timer)
  }, [phase])

  useConsoleIntent((intent) => {
    if (intent === 'B') {
      onBack()
      return
    }
    if (phase === 'pick') {
      if (intent === 'A') {
        const startUsd = livePrice.priceUsd
        round.current = {
          startAtMs: Date.now(),
          call,
          startUsd,
          window: roundWindow(startUsd, WINDOW_HALF),
        }
        setPhase('running')
      } else if (intent === 'LEFT' || intent === 'RIGHT') {
        setCall(intent === 'RIGHT' ? 'up' : 'down')
      }
    } else if (phase === 'result') {
      if (intent === 'A') {
        round.current = null
        setOutcome(null)
        setEndUsd(null)
        setPhase('pick')
      }
    }
  })

  return (
    <div className="bg-screen flex h-full w-full flex-col gap-1 p-2">
      <div className="flex items-baseline justify-between">
        <PixelText role="title" upper>
          {brand.CARTRIDGE_02}
        </PixelText>
        <PixelText role="micro" tone="dim" upper>
          {loading ? 'reading price...' : `streak ${streak}`}
        </PixelText>
      </div>

      {/* The character IS the chart. One element in every phase: the monster
          climbs and falls with the live price while the player decides,
          while the window is open, and on the result. The jail line sits at
          the round's entry price: start on it, leave it in your direction. */}
      <MonspellChart
        characterId={characterId}
        priceUsd={loading ? null : livePrice.priceUsd}
        running={phase === 'running'}
        lastDirection={lastDirection}
        window={round.current?.window ?? null}
        jailLine={round.current?.startUsd ?? null}
      />

      {phase === 'pick' ? (
        <PickState call={call} onSelect={setCall} />
      ) : phase === 'running' ? (
        <RunningState secondsLeft={remaining(round.current)} characterId={characterId} />
      ) : (
        <ResultState
          outcome={outcome}
          startUsd={round.current?.startUsd ?? null}
          endUsd={endUsd}
          streak={streak}
          characterId={characterId}
        />
      )}

      <div className="flex items-center justify-between">
        <PixelText role="micro" upper>
          ◄► Choose
        </PixelText>
        <PixelText role="micro" upper>
          A Start
        </PixelText>
        <PixelText role="micro" upper>
          B Back
        </PixelText>
      </div>
    </div>
  )
}

function remaining(round: { startAtMs: number } | null): number {
  if (!round) return ROUND_SECONDS
  return Math.max(
    0,
    ROUND_SECONDS - Math.floor((Date.now() - round.startAtMs) / 1000),
  )
}

function PickState({
  call,
  onSelect,
}: {
  call: MonspellCall
  onSelect: (c: MonspellCall) => void
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <PixelText role="micro" tone="dim">
        where is it in ten seconds?
      </PixelText>
      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={() => onSelect('up')}
          className={`pressable border-edge flex-1 border px-2 py-1 ${
            call === 'up' ? 'bg-accent' : 'bg-panel'
          }`}
          aria-current={call === 'up' ? 'true' : undefined}
        >
          <PixelText role="body" tone={call === 'up' ? 'invert' : 'ink'} upper>
            UP
          </PixelText>
        </button>
        <button
          type="button"
          onClick={() => onSelect('down')}
          className={`pressable border-edge flex-1 border px-2 py-1 ${
            call === 'down' ? 'bg-accent' : 'bg-panel'
          }`}
          aria-current={call === 'down' ? 'true' : undefined}
        >
          <PixelText role="body" tone={call === 'down' ? 'invert' : 'ink'} upper>
            DOWN
          </PixelText>
        </button>
      </div>
    </div>
  )
}

function RunningState({
  secondsLeft,
  characterId,
}: {
  secondsLeft: number
  characterId: CharacterId
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <PixelText role="hero" tone="gain">
        {secondsLeft}
      </PixelText>
      <PixelText role="micro" tone="dim" upper>
        {characterId.toUpperCase()} rides the price...
      </PixelText>
    </div>
  )
}

function ResultState({
  outcome,
  startUsd,
  endUsd,
  streak,
  characterId,
}: {
  outcome: MonspellOutcome | null
  startUsd: number | null
  endUsd: number | null
  streak: number
  characterId: CharacterId
}) {
  const label =
    outcome === 'win'
      ? 'called it.'
      : outcome === 'draw'
        ? 'it did not move.'
        : 'missed.'

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
      <PixelText role="hero" tone={outcome === 'win' ? 'gain' : 'loss'}>
        {label}
      </PixelText>
      <PixelText role="micro" tone="dim" upper>
        {characterId.toUpperCase()} {outcome === 'win' ? 'smiles' : 'shrugs'}
      </PixelText>
      {startUsd !== null && endUsd !== null ? (
        <div className="flex gap-2">
          <Value amount={startUsd} prefix="$" decimals={5} role="body" />
          <PixelText role="body" tone="dim">
            to
          </PixelText>
          <Value amount={endUsd} prefix="$" decimals={5} role="body" />
        </div>
      ) : null}
      <PixelText role="micro" tone="dim">
        streak {streak}. A for another round.
      </PixelText>
    </div>
  )
}
