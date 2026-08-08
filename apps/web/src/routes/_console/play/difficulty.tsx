import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Difficulty } from '../../../game/screens/Difficulty'
import { useSession } from '../../../state/session'

/**
 * `routeTree.gen.ts` is generated centrally and does not know about this file
 * yet, so `FileRoutesByPath` has no `/_console/play/difficulty` key and the
 * literal below fails `createFileRoute`'s overload. The cast is temporary:
 * regenerating the route tree (owned outside this task) removes the need for
 * it, and nothing about the component or its behaviour depends on the cast.
 */
export const Route = createFileRoute('/_console/play/difficulty')({
  component: DifficultyRoute,
})

/**
 * S4's route. ARCHITECTURE.md 2.1: five lines of real work, everything else
 * is `Difficulty` taking props.
 *
 * `onBack` goes to `/cartridges`, which is the screen the player actually
 * came from now that S3 exists. It pointed at `/gallery` while it did not.
 */
function DifficultyRoute() {
  const navigate = useNavigate()
  const { difficulty, godMode, chooseDifficulty } = useSession()

  return (
    <Difficulty
      difficulty={difficulty}
      godMode={godMode}
      onChange={(next) => chooseDifficulty(next, godMode)}
      onConfirm={(next, nextGodMode) => {
        chooseDifficulty(next, nextGodMode)
        navigate({ to: '/play/tracker' })
      }}
      onBack={() => navigate({ to: '/cartridges' })}
    />
  )
}
