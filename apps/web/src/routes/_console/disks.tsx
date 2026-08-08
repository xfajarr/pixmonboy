import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
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
 */
function DiskSelectRoute() {
  const navigate = useNavigate()
  const { openDisk, chooseDifficulty } = useSession()
  const disks = useMemo(() => saveDisks(), [])

  return (
    <DiskSelect
      cardAddress={useSession((s) => s.cardAddress)}
      disks={disks}
      maxDisks={MAX_DISKS}
      onOpen={(diskId) => {
        const disk = disks.find((d) => d.diskId === diskId)
        if (!disk) return
        openDisk(diskId)
        chooseDifficulty(disk.difficulty, disk.godMode)
        navigate({ to: '/cartridges' })
      }}
      onBack={() => navigate({ to: '/card' })}
    />
  )
}
