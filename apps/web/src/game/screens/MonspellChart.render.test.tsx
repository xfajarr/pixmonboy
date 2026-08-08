// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { renderScreen } from '../../test/harness'
import { MonspellChart } from './MonspellChart'
import type { MonspellChartProps } from './MonspellChart'

const WINDOW = { low: 0.02, high: 0.021 }

function renderChart(overrides: Partial<MonspellChartProps> = {}) {
  return renderScreen(
    <MonspellChart
      characterId={overrides.characterId ?? 'molandak'}
      priceUsd={'priceUsd' in overrides ? overrides.priceUsd! : 0.0205}
      running={overrides.running ?? false}
      lastDirection={overrides.lastDirection ?? 'flat'}
      window={'window' in overrides ? overrides.window! : WINDOW}
      jailLine={'jailLine' in overrides ? overrides.jailLine! : null}
    />,
  )
}

const trace = (container: HTMLElement) => container.querySelector('polyline')

/**
 * The trace is the thing the screen is named after. These pin the behaviour
 * that is invisible in a screenshot and easy to break: what gets recorded, what
 * gets skipped, and that a runaway price stays on the glass.
 */
describe('the price trace', () => {
  it('draws nothing until there are two readings to draw a line between', () => {
    const { container } = renderChart({ priceUsd: 0.0205 })
    expect(trace(container)).toBeNull()
  })

  it('appears once the price has actually moved', () => {
    const { container, rerenderScreen } = renderChart({ priceUsd: 0.0205 })
    rerenderScreen(
      <MonspellChart
        characterId="molandak"
        priceUsd={0.0206}
        running={false}
        lastDirection="up"
        window={WINDOW}
        jailLine={null}
      />,
    )
    expect(trace(container)).not.toBeNull()
    expect(trace(container)?.getAttribute('points')?.split(' ')).toHaveLength(2)
  })

  it('ignores a repeated reading, because Pyth republishes slower than we poll', () => {
    // The route polls three times a second; the feed updates a few times a
    // minute. Recording every response would fill the window with duplicates
    // and push the real movement off the left edge within seconds.
    const { container, rerenderScreen } = renderChart({ priceUsd: 0.0205 })
    const same = (
      <MonspellChart
        characterId="molandak"
        priceUsd={0.0205}
        running={false}
        lastDirection="flat"
        window={WINDOW}
        jailLine={null}
      />
    )
    rerenderScreen(same)
    rerenderScreen(same)

    expect(trace(container)).toBeNull()
  })

  it('keeps a runaway price on the glass instead of drawing off the screen', () => {
    // The window is frozen at round start, so a price that escapes it maps to a
    // y outside the field. Unclamped, the line would draw over the header or
    // past the bottom edge of a screen that cannot scroll.
    const { container, rerenderScreen } = renderChart({ priceUsd: 0.0205 })
    rerenderScreen(
      <MonspellChart
        characterId="molandak"
        priceUsd={9}
        running={false}
        lastDirection="up"
        window={WINDOW}
        jailLine={null}
      />,
    )

    const ys = trace(container)
      ?.getAttribute('points')
      ?.split(' ')
      .map((p) => Number(p.split(',')[1]))

    expect(ys).toBeDefined()
    for (const y of ys ?? []) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(168)
    }
  })
})

describe('what the screen still says in words', () => {
  it('shows dots rather than a number before the first reading lands', () => {
    const { getByText } = renderChart({ priceUsd: null })
    expect(getByText('.....')).toBeInTheDocument()
  })

  it('prints the live price when there is one', () => {
    const { getByText } = renderChart({ priceUsd: 0.0205 })
    expect(getByText('$0.02050')).toBeInTheDocument()
  })
})
