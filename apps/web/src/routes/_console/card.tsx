import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { MemoryCard } from '../../game/screens/MemoryCard'
import { FIXTURE_CARD_ADDRESS } from '../../game/fixtures'
import { useSession } from '../../state/session'

export const Route = createFileRoute('/_console/card')({
  component: MemoryCardRoute,
})

/**
 * S1's route. ARCHITECTURE.md 2.1: a route owns navigation and nothing else.
 *
 * The two sign-in methods both land here on the same fixture card, which is
 * exactly what Phase 3 replaces: `insertCard` takes whatever address Privy's
 * embedded wallet issues (INTEGRATIONS.md section 5) and the screen does not
 * change. The screen says FIXTURE out loud until then.
 */
function MemoryCardRoute() {
  const navigate = useNavigate()
  const { cardAddress, insertCard } = useSession()

  return (
    <MemoryCard
      cardAddress={cardAddress}
      onInsert={() => {
        insertCard(FIXTURE_CARD_ADDRESS)
        navigate({ to: '/disks' })
      }}
      onBack={() => navigate({ to: '/' })}
    />
  )
}
