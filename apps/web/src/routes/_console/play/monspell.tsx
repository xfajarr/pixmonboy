import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Monspell } from '../../../game/screens/Monspell'
import { useSession } from '../../../state/session'
import type { CharacterId } from '../../../config/brand'
import type { Difficulty } from '../../../types/domain'

export const Route = createFileRoute('/_console/play/monspell')({
  component: MonspellRoute,
})

/** The Monanimal tied to the chosen difficulty, same map every play route. */
const CHARACTER_BY_DIFFICULTY: Record<Difficulty, CharacterId> = {
  easy: 'molandak',
  normal: 'moyaki',
  hard: 'mouch',
}

/**
 * How often the price is re-read.
 *
 * 300ms, not 1s: the Monanimal glides via requestAnimationFrame between
 * readings, but it can only glide toward a price it has been told about. A
 * once-a-second poll updates the target once a second, so the monster visibly
 * pauses between updates. At 300ms the read is cheap (one eth_call through the
 * API's own timeout ladder) and the character never stops moving for long.
 */
const POLL_MS = 300

type PriceBody =
  | { ok: true; priceUsd: number; at: number }
  | { ok: false; priceUsd: number; at: number; stale: true }
  | { ok: false; reason: string }

/**
 * MONSPELL's route. Owns the poll, hands the screen a price.
 *
 * The API is mounted in this same process at /api/price/mon (routes/api.$.ts),
 * so the poll is a same-origin fetch with nothing else that can be down while
 * the console is up. The endpoint answers a discriminated union: `ok:true` is
 * a fresh live read, `ok:false + stale` is the last good price (still better
 * than nothing on screen), and `ok:false + reason` is a hard failure. All
 * three are either a price to draw or a reason to keep the last one.
 *
 * The screen owns the round; this route owns nothing but the polling loop.
 */
function MonspellRoute() {
  const navigate = useNavigate()
  const { difficulty } = useSession()

  const [livePrice, setLivePrice] = useState<{
    priceUsd: number
    at: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch('/api/price/mon')
        const body = (await res.json()) as PriceBody
        if (cancelled) return
        if ('priceUsd' in body && typeof body.priceUsd === 'number') {
          setLivePrice({ priceUsd: body.priceUsd, at: body.at })
          // console.log during the demo: watching the number tick proves the
          // poll is live even when the movement is a few basis points.
          console.log('[MONSPELL] MON price', body.priceUsd, 'ok:', body.ok)
        }
        setLoading(false)
      } catch {
        // A failed fetch is still a render state, not a crash: the screen
        // keeps its last price until the next poll succeeds. Gate 2.4.
        if (!cancelled) setLoading(false)
      }
    }

    void poll()
    const timer = setInterval(() => void poll(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return (
    <Monspell
      characterId={CHARACTER_BY_DIFFICULTY[difficulty]}
      livePrice={livePrice ?? { priceUsd: 0, at: 0 }}
      loading={loading && livePrice === null}
      onBack={() => navigate({ to: '/cartridges' })}
    />
  )
}
