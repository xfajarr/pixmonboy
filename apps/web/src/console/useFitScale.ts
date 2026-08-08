import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Scale factor that fits `box` inside `stage`.
 *
 * INTEGER FIRST, and that is not fussiness. The 480x320 screen sits inside the
 * console, so whatever scales the console scales the pixel art. A fractional
 * factor makes some source pixels two device pixels wide and others three,
 * which is the same "pecah" that ruined the first sprite cut, one level up.
 *
 * So: try 3x, 2x, 1x. Only when even 1x does not fit do we fall back to a
 * continuous scale, because a phone at 390px cannot show a 568px console at 1x
 * and half a black screen is worse than slight resampling. That fallback is a
 * documented concession, not an accident.
 */
const LADDER = [3, 2, 1] as const

export function useFitScale(
  stageRef: RefObject<HTMLElement | null>,
  boxRef: RefObject<HTMLElement | null>,
): number {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const stage = stageRef.current
    const box = boxRef.current
    if (!stage || !box) return

    const measure = () => {
      // offsetWidth and offsetHeight ignore transforms, so measuring the box
      // does not feed the scale we just applied back into the calculation.
      const bw = box.offsetWidth
      const bh = box.offsetHeight
      if (bw === 0 || bh === 0) return

      const available = stage.getBoundingClientRect()
      // A phone has no room to spend on a margin. 8px of breathing room on a
      // 412px screen is already 2% of the console's width, and the console
      // being as large as it can be is the entire point on the device most
      // people will open this on.
      const padding = available.width < 520 ? 8 : 32
      const sw = available.width - padding
      const sh = available.height - padding

      const fitted = LADDER.find((n) => bw * n <= sw && bh * n <= sh)
      setScale(fitted ?? Math.min(sw / bw, sh / bh))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    observer.observe(box)

    // The pixel font arrives after first paint and it sets the wordmark's line
    // box, so the first measurement is of a console that is not yet its final
    // height. ResizeObserver does fire on the reflow, but only if the swap
    // actually changes the box by a whole pixel; asking fonts.ready directly
    // is the guarantee rather than the hope.
    if ('fonts' in document) void document.fonts.ready.then(measure)

    // A mobile URL bar sliding away resizes the VISUAL viewport without
    // necessarily resizing any element the observer is watching. This is the
    // event that always fires for it.
    const vv = window.visualViewport
    vv?.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)

    return () => {
      observer.disconnect()
      vv?.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [stageRef, boxRef])

  return scale
}
