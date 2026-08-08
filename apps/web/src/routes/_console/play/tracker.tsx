import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { PoolTracker } from '../../../game/screens/PoolTracker'
import { fixtureGates, scoredPools } from '../../../game/fixtures'
import { useSession } from '../../../state/session'
import type { CharacterId } from '../../../config/brand'
import type { Difficulty } from '../../../types/domain'

export const Route = createFileRoute('/_console/play/tracker')({
  component: Tracker,
})

/** The Monanimal tied to the chosen difficulty. Duplicated from
 * `play/live.$id.tsx` rather than shared: it is three lines derived from a
 * three-entry union, and a shared module for two call sites is a second
 * concept to keep in sync for a saving that does not exist yet. */
const CHARACTER_BY_DIFFICULTY: Record<Difficulty, CharacterId> = {
  easy: 'molandak',
  normal: 'moyaki',
  hard: 'mouch',
}

/**
 * S5's route. SCREEN-DETAIL.md section 1: S5 leads to S6 SET RANGE.
 * `choosePool` records the pick in session state, then the player lands on
 * S6 to size the deposit before S7 plays it. Closes BUILD-PLAN.md open item 4.
 */
function Tracker() {
  const navigate = useNavigate()
  const { difficulty, godMode, choosePool } = useSession()
  const pools = useMemo(
    () => scoredPools(difficulty, godMode),
    [difficulty, godMode],
  )

  return (
    <PoolTracker
      pools={pools}
      characterId={CHARACTER_BY_DIFFICULTY[difficulty]}
      gates={fixtureGates(difficulty)}
      onPlayPool={(pairAddress) => {
        choosePool(pairAddress)
        // S6, not S7. The tracker used to jump straight to the live screen on
        // the session defaults, which kept a run playable while S6 did not
        // exist and skipped the deposit the player is actually making.
        // BUILD-PLAN.md's S5 open item 4, closed here.
        navigate({ to: '/play/range/$id', params: { id: pairAddress } })
      }}
      onBack={() => navigate({ to: '/play/difficulty' })}
    />
  )
}
