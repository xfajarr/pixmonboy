import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { InRange } from '../../../game/screens/InRange'
import { findPool } from '../../../game/fixtures'
import { useSession } from '../../../state/session'
import type { CharacterId } from '../../../config/brand'
import type { Difficulty } from '../../../types/domain'

export const Route = createFileRoute('/_console/play/live/$id')({
  component: Live,
})

/** The Monanimal tied to the chosen difficulty. brand.ts owns the labels;
 * this is only the difficulty -> character key each one already answers to. */
const CHARACTER_BY_DIFFICULTY: Record<Difficulty, CharacterId> = {
  easy: 'molandak',
  normal: 'moyaki',
  hard: 'mouch',
}

/**
 * S7's route. ARCHITECTURE.md 2.1: five lines of real work, everything else
 * is `InRange` taking props. `onBack` leaves the position and returns to the
 * tracker, which is where the player picked this pool.
 */
function Live() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const {
    difficulty,
    godMode,
    amount,
    width,
    manualRange,
    autopilot,
    finishRun,
  } = useSession()
  const pool = useMemo(
    () => findPool(id, difficulty, godMode)?.pool,
    [id, difficulty, godMode],
  )

  const toTracker = () => navigate({ to: '/play/tracker' })

  return (
    <InRange
      pool={pool}
      amount={amount}
      width={width}
      manualRange={manualRange}
      autopilot={autopilot}
      characterId={CHARACTER_BY_DIFFICULTY[difficulty]}
      onWithdraw={(run) => {
        // The summary is a record of what already happened, not a cache of
        // something recomputable (session.ts's own reasoning for lastRun),
        // so it is stashed before navigating rather than re-derived on S8.
        finishRun(run)
        navigate({ to: '/play/results/$id', params: { id } })
      }}
      // A rebalance keeps the player on this position, it does not leave the
      // screen. InRange now moves the range locally on this press (the sim's
      // own bookkeeping); what is still missing is the on-chain withdraw,
      // swap, and redeposit, and the keeper signature to authorise it
      // (ARCHITECTURE.md 8). This stays a no-op until Lane B wires that
      // transaction, it is just no longer the ONLY thing missing.
      onRebalance={() => {}}
      onBack={toTracker}
    />
  )
}
