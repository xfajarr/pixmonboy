import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { CartridgeSelect } from '../../game/screens/CartridgeSelect'
import { cartridges, findDisk } from '../../game/fixtures'
import { useSession } from '../../state/session'

export const Route = createFileRoute('/_console/cartridges')({
  component: CartridgeSelectRoute,
})

/**
 * S3's route. ARCHITECTURE.md 2.1: a route owns navigation and nothing else.
 *
 * `disk` may be undefined, and that is a render state rather than a redirect:
 * every screen in this app opens directly at its URL and still renders
 * (session.ts), which is how nine screens get looked at without playing four
 * screens of preamble each time. Gate 2.4.
 */
function CartridgeSelectRoute() {
  const navigate = useNavigate()
  const diskId = useSession((s) => s.diskId)
  const disk = useMemo(() => findDisk(diskId), [diskId])

  return (
    <CartridgeSelect
      disk={disk}
      cartridges={useMemo(() => cartridges(), [])}
      onInsert={(cartridgeId) => {
        // cart-02 is MONSPELL, the live price game, which has its own flow
        // and does not need a pool pick. cart-01 is STAY IN RANGE.
        if (cartridgeId === 'cart-02') {
          navigate({ to: '/play/monspell' })
        } else {
          navigate({ to: '/play/difficulty' })
        }
      }}
      onBack={() => navigate({ to: '/disks' })}
    />
  )
}
