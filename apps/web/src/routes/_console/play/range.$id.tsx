import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { SetRange } from '../../../game/screens/SetRange'
import { findPool } from '../../../game/fixtures'
import { useSession } from '../../../state/session'

// The route tree is generated centrally (routeTree.gen.ts) and this route
// was added alongside it in the same pass, so '/_console/play/range/$id'
// is not yet a literal TanStack Router has registered. CLAUDE.md instructs
// against hand-editing the generated file; this cast is the documented
// workaround until the generator runs. Drop it once routeTree.gen.ts lists
// this path for real.
export const Route = createFileRoute('/_console/play/range/$id')({
  component: SetRangeRoute,
})

/**
 * S6's route. ARCHITECTURE.md 2.1: five lines of real work, everything else
 * is `SetRange` taking props. Mirrors live.$id.tsx exactly.
 */
function SetRangeRoute() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const {
    difficulty,
    godMode,
    amount,
    width,
    manualRange,
    autopilot,
    balance,
    setAmount,
    setWidth,
    setManualRange,
    setAutopilot,
  } = useSession()
  const pool = useMemo(
    () => findPool(id, difficulty, godMode)?.pool,
    [id, difficulty, godMode],
  )

  return (
    <SetRange
      pool={pool}
      balance={balance}
      amount={amount}
      width={width}
      manualRange={manualRange}
      autopilot={autopilot}
      onChangeAmount={setAmount}
      onChangeWidth={setWidth}
      onChangeManualRange={setManualRange}
      onToggleAutopilot={setAutopilot}
      onConfirm={() => navigate({ to: '/play/live/$id', params: { id } })}
      onBack={() => navigate({ to: '/play/tracker' })}
    />
  )
}
