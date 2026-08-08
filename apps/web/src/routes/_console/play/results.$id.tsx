import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { Results } from '../../../game/screens/Results'
import { findPool } from '../../../game/fixtures'
import { useSession } from '../../../state/session'
import type { SaveState } from '../../../game/screens/Results'
import type { CharacterId } from '../../../config/brand'
import type { Difficulty } from '../../../types/domain'

// routeTree.gen.ts is regenerated centrally (this agent's brief keeps it
// off limits) and has not picked up this file yet, so `/_console/play/
// results/$id` is not a key of FileRoutesByPath and createFileRoute cannot
// infer TFilePath from the string literal below without help. The cast is
// removed for free the next time the route tree regenerates; nothing here
// changes when it does.
export const Route = createFileRoute('/_console/play/results/$id')({
  component: ResultsRoute,
})

/** The Monanimal tied to the chosen difficulty. Mirrors live.$id.tsx: brand.ts
 * owns the labels, this is only the difficulty -> character key each one
 * already answers to. */
const CHARACTER_BY_DIFFICULTY: Record<Difficulty, CharacterId> = {
  easy: 'molandak',
  normal: 'moyaki',
  hard: 'mouch',
}

/** The disk the keeper owns. Fixed until S2 reads real disks off the chain. */
const DEMO_DISK_ID = 0

/** Whole cents, because the contract stores uint64 and not a float. */
function cents(usd: number): number {
  return Math.max(0, Math.round(usd * 100))
}

/**
 * S8's route. ARCHITECTURE.md 2.1: a few lines of real work, everything else
 * is `Results` taking props. "back to disks" goes to `/disks` for real now
 * that S2 exists; it pointed at `/gallery` while it did not.
 *
 * The route owns the network call and the screen owns the rendering, which is
 * the same split every other route here uses. It matters more than usual for
 * this one: `POST /api/runs` answers 200 with a reason whether or not anything
 * was written, so there is no error path to throw and the screen only ever
 * receives a state to draw. Gate 2.4, no spinner is a terminal state.
 */
function ResultsRoute() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const { difficulty, godMode, autopilot, lastRun } = useSession()
  const pool = useMemo(
    () => findPool(id, difficulty, godMode)?.pool,
    [id, difficulty, godMode],
  )

  const [save, setSave] = useState<SaveState>({ status: 'idle' })

  const onSaveRun = useCallback(() => {
    if (!lastRun) return
    setSave({ status: 'saving' })

    // Same origin. The API is mounted inside this app's own server at
    // routes/api.$.ts, so there is no second host, no CORS, and nothing extra
    // that can be down while the screens are up.
    void fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        diskId: DEMO_DISK_ID,
        scoreCents: cents(lastRun.feesEarnedUsd),
        damageCents: cents(lastRun.damageUsd),
        durationSeconds: Math.max(0, Math.trunc(lastRun.elapsedSeconds)),
        // The contract takes basis points, so 100% is 10,000.
        inRangeBps: Math.min(
          10_000,
          Math.max(0, Math.round(lastRun.timeInRangePct * 100)),
        ),
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.recorded) {
          setSave({
            status: 'saved',
            txHash: result.txHash,
            confirmed: result.confirmed,
            signer: result.signer,
            explorerUrl: result.explorerUrl,
          })
        } else {
          setSave({ status: 'failed', reason: result.reason ?? 'unavailable' })
        }
      })
      // A transport failure is the one case the endpoint cannot report on
      // itself. It still ends as a drawn state, never a thrown one.
      .catch(() => setSave({ status: 'failed', reason: 'no answer from api' }))
  }, [lastRun])

  return (
    <Results
      pool={pool}
      run={lastRun}
      characterId={CHARACTER_BY_DIFFICULTY[difficulty]}
      autopilot={autopilot}
      save={save}
      onSaveRun={onSaveRun}
      onBackToDisks={() => navigate({ to: '/disks' })}
    />
  )
}
