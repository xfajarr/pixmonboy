import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useConsoleIntent } from '../../console/useConsoleInput'
import { brand, characters } from '../../config/brand'
import {
  BinStrip,
  Chart,
  Dialog,
  Field,
  List,
  Marquee,
  Meter,
  Panel,
  Pin,
  PixelText,
  Row,
  Scanlines,
  Sprite,
  Stat,
  Sunk,
  Tabs,
  Toggle,
  Value,
} from '../../ui'
import type { BinState } from '../../ui'
import type { CharacterId } from '../../config/brand'

export const Route = createFileRoute('/_console/gallery')({
  component: Gallery,
})

const SERIES = [
  100, 101, 103, 102, 105, 108, 106, 109, 112, 111, 115, 118, 116, 113, 110,
  108, 111, 114, 117, 121,
]

const BINS: Array<{ state: BinState; fill: number }> = [
  { state: 'out', fill: 0.2 },
  { state: 'out', fill: 0.3 },
  { state: 'in-range', fill: 0.5 },
  { state: 'in-range', fill: 0.7 },
  { state: 'in-range', fill: 0.9 },
  { state: 'active', fill: 1 },
  { state: 'in-range', fill: 0.85 },
  { state: 'in-range', fill: 0.6 },
  { state: 'in-range', fill: 0.4 },
  { state: 'empty', fill: 0.25 },
  { state: 'empty', fill: 0.15 },
  { state: 'out', fill: 0.1 },
]

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'safe', label: 'Safe' },
  { id: 'hot', label: 'Hot' },
] as const

const CHARACTER_IDS = Object.keys(characters) as Array<CharacterId>

/**
 * The primitive gallery. Gate 1.4.
 *
 * Every component on one screen, at real size, inside the real console. It is
 * not a storybook: it is the thing you look at to answer "does this system hold
 * together" in five seconds, and it lives at a route so it is testable on a
 * phone at 1x rather than zoomed on a laptop.
 */
function Gallery() {
  const [selected, setSelected] = useState(0)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all')
  const [scanlines, setScanlines] = useState(false)
  const [character, setCharacter] = useState(0)

  useConsoleIntent((intent) => {
    if (intent === 'DOWN') setSelected((n) => Math.min(3, n + 1))
    if (intent === 'UP') setSelected((n) => Math.max(0, n - 1))
    if (intent === 'RIGHT') setCharacter((n) => (n + 1) % CHARACTER_IDS.length)
    if (intent === 'LEFT') {
      setCharacter((n) => (n - 1 + CHARACTER_IDS.length) % CHARACTER_IDS.length)
    }
    if (intent === 'A') setScanlines((s) => !s)
    if (intent === 'START') setTab((t) => (t === 'all' ? 'safe' : 'all'))
  })

  const characterId = CHARACTER_IDS[character]

  return (
    <>
      <Scanlines on={scanlines} />
      <div className="bg-screen h-full w-full overflow-auto p-3">
        <div className="flex items-baseline justify-between">
          <PixelText role="title" upper>
            Primitives
          </PixelText>
          <PixelText role="micro" tone="dim" upper>
            {characters[characterId].label}
          </PixelText>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Panel flush>
            <List label="Pools">
              {['CHOG / USDC', 'MON / USDC', 'YAKI / MON', 'DAK / USDC'].map(
                (name, i) => (
                  <Row
                    key={name}
                    selected={i === selected}
                    disabled={i === 3}
                    onSelect={() => setSelected(i)}
                  >
                    <Pin
                      kind={i === 3 ? 'blocked' : i === 2 ? 'hot' : 'safe'}
                    />
                    <span className="flex-1">{name}</span>
                    <span className="tabular-nums">{412 - i * 90}K</span>
                  </Row>
                ),
              )}
            </List>
          </Panel>

          <Panel className="flex flex-col gap-2">
            <Meter value={78} label="Safety" />
            <Meter value={31} label="Heat" />
            <div className="flex gap-4">
              <Stat label="Fees">
                <Value amount={12.4} prefix="$" decimals={2} signed />
              </Stat>
              <Stat label="Damage">
                <Value amount={-3.1} prefix="$" decimals={2} signed />
              </Stat>
            </div>
          </Panel>

          <Panel className="flex flex-col gap-2">
            <PixelText role="micro" tone="dim" upper>
              Bins
            </PixelText>
            <BinStrip bins={BINS} />
            <Chart
              series={SERIES}
              width={200}
              height={64}
              band={{ low: 104, high: 118 }}
            />
          </Panel>

          <div className="flex flex-col gap-2">
            <Tabs tabs={TABS} active={tab} onChange={setTab} />
            <Panel className="flex flex-col gap-2">
              <Field value="DISK 01" focused maxLength={12} />
              <Toggle
                on={scanlines}
                label="Scanlines"
                onChange={setScanlines}
              />
              <Sunk>
                <PixelText role="micro" tone="dim" upper>
                  Sunk well
                </PixelText>
              </Sunk>
            </Panel>
          </div>

          <div className="col-span-2">
            <Dialog
              speaker={characters[characterId].label}
              portrait={<Sprite character={characterId} animation="idle" />}
            >
              Left and right change character. A toggles scanlines. Down and up
              move the cursor. Every one of those works on the keyboard, the
              touch pad, and a gamepad.
            </Dialog>
          </div>

          <div className="border-edge bg-warn col-span-2 border px-2 py-1">
            <Marquee seconds={10}>
              {`${brand.ALERT_NAME}: price is approaching the edge of your range`}
            </Marquee>
          </div>

          <div className="col-span-2 flex items-end gap-4">
            <Sprite character={characterId} animation="run" />
            <Sprite character={characterId} animation="jump" />
            <Sprite character={characterId} animation="sit" />
            <Sprite character={characterId} animation="alert" />
            <Sprite character={characterId} animation="happy" />
          </div>
        </div>
      </div>
    </>
  )
}
