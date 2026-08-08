import { createFileRoute, useHydrated, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { DiskSelect } from '../../game/screens/DiskSelect'
import { MAX_DISKS, saveDisks } from '../../game/fixtures'
import { useSession } from '../../state/session'

export const Route = createFileRoute('/_console/disks')({
  component: DiskSelectRoute,
})

/**
 * S2's route. ARCHITECTURE.md 2.1: a route owns navigation and nothing else.
 *
 * Opening a disk sets BOTH the disk and the difficulty it is bound to. A disk
 * IS a difficulty (ERD.md section 2, SAVE_DISK ||--|| DIFFICULTY), so letting
 * the player open a HARD disk and then land on S4 still holding the previous
 * disk's EASY gates would filter the tracker by the wrong tier and show a pool
 * list that disagrees with the disk that opened it.
 *
 * The live/fixture split mirrors card.tsx for the same reason: `usePrivy`
 * throws outside a mounted provider, and the provider does not exist during
 * SSR, so eject only exists on the hydrated client path.
 */
function DiskSelectRoute() {
  const hydrated = useHydrated()
  const appId = import.meta.env.VITE_PRIVY_APP_ID

  if (!hydrated || !appId) return <FixtureDisks />

  return <LiveDisks />
}

/** Shared disk + navigation wiring. The two paths differ only in logout. */
function useDiskNavigation() {
  const navigate = useNavigate()
  const { openDisk, chooseDifficulty } = useSession()
  const disks = useMemo(() => saveDisks(), [])

  const open = (diskId: number) => {
    const disk = disks.find((d) => d.diskId === diskId)
    if (!disk) return
    openDisk(diskId)
    chooseDifficulty(disk.difficulty, disk.godMode)
    navigate({ to: '/cartridges' })
  }

  return { disks, open, back: () => navigate({ to: '/card' }) }
}

/** The committed-fixture path. No provider, no eject, marker on. */
function FixtureDisks() {
  const { disks, open, back } = useDiskNavigation()

  return (
    <DiskSelect
      cardAddress={useSession((s) => s.cardAddress)}
      disks={disks}
      maxDisks={MAX_DISKS}
      onOpen={open}
      onBack={back}
    />
  )
}

/** The live path. Eject signs the player out of Privy and drops the session. */
function LiveDisks() {
  const navigate = useNavigate()
  const { disks, open, back } = useDiskNavigation()
  const { clearCard } = useSession()
  const { logout } = usePrivy()

  return (
    <DiskSelect
      cardAddress={useSession((s) => s.cardAddress)}
      disks={disks}
      maxDisks={MAX_DISKS}
      onOpen={open}
      onEject={async () => {
        // Eject the card: sign out of Privy first, THEN drop the session and
        // land on S1. Order matters: logout() is async, and if we navigate
        // while the wallet is still connected, LiveCard's auto-insert effect
        // re-inserts the same card and bounces straight back to /disks.
        clearCard()
        await logout()
        navigate({ to: '/card' })
      }}
      onBack={back}
    />
  )
}
