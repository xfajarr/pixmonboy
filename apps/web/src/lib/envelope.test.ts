import { describe, expect, it } from 'vitest'
import {
  ageSeconds,
  cached,
  combine,
  fallback,
  live,
  mapEnvelope,
  needsBadge,
  unavailable,
} from './envelope'

describe('freshness travels with the value', () => {
  it('only live data renders without a badge', () => {
    expect(needsBadge(live(1))).toBe(false)
    expect(needsBadge(cached(1, 100))).toBe(true)
    expect(needsBadge(fallback(1, 100))).toBe(true)
    expect(needsBadge(unavailable(1, 'RPC down'))).toBe(true)
  })

  it('every non-live envelope carries a note for the user', () => {
    // PRD.md section 12: presenting cached data as live is the dishonesty this
    // type exists to prevent, so a badge without an explanation is not enough.
    expect(cached(1, 100).note).toBeTruthy()
    expect(fallback(1, 100).note).toBeTruthy()
    expect(unavailable(1, 'RPC down').note).toBe('RPC down')
  })

  it('unavailable still carries a value, so no screen has a spinner as its end state', () => {
    const e = unavailable([] as Array<string>, 'nothing to show')
    expect(e.data).toEqual([])
    expect(ageSeconds(e)).toBe(0)
  })
})

describe('mapEnvelope preserves trust', () => {
  it('scoring a cached list produces a cached result', () => {
    const pools = cached([1, 2, 3], 1_000)
    const scored = mapEnvelope(pools, (xs) => xs.map((x) => x * 10))
    expect(scored.data).toEqual([10, 20, 30])
    expect(scored.freshness).toBe('cached')
    expect(scored.fetchedAt).toBe(1_000)
    expect(scored.note).toBe(pools.note)
  })
})

describe('combine takes the worse of two sources', () => {
  it('live plus fallback is fallback', () => {
    const r = combine(live('a', 5_000), fallback('b', 1_000), (a, b) => a + b)
    expect(r.data).toBe('ab')
    expect(r.freshness).toBe('fallback')
  })

  it('live plus live stays live', () => {
    expect(combine(live(1, 10), live(2, 20), (a, b) => a + b).freshness).toBe(
      'live',
    )
  })

  it('reports the age of the oldest real read', () => {
    expect(
      combine(live(1, 9_000), cached(2, 3_000), (a, b) => a + b).fetchedAt,
    ).toBe(3_000)
  })

  it('ignores a zero timestamp rather than reading it as 1970', () => {
    const r = combine(live(1, 9_000), unavailable(0, 'down'), (a, b) => a + b)
    expect(r.fetchedAt).toBe(9_000)
    expect(r.freshness).toBe('unavailable')
  })

  it('reports zero when neither side ever read anything', () => {
    const r = combine(
      unavailable(0, 'down'),
      unavailable(0, 'also down'),
      (a, b) => a + b,
    )
    expect(r.fetchedAt).toBe(0)
  })
})

describe('ageSeconds', () => {
  it('floors to whole seconds and never goes negative', () => {
    expect(ageSeconds(live(1, 10_000), 15_900)).toBe(5)
    expect(ageSeconds(live(1, 20_000), 10_000)).toBe(0)
  })
})
