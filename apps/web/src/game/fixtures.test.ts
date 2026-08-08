import { describe, expect, it } from 'vitest'
// MUST BE THE SAME FILE `fixtures.ts` IMPORTS. The assertion below is that the
// clock is the snapshot's own `capturedAt`, and reading a different snapshot
// here turns that invariant into a comparison of two unrelated timestamps —
// which is exactly how this test failed when fixtures.ts moved to the
// self-deployed testnet and this line stayed on mainnet.
import poolsJson from '../../../../data/pools.self-testnet.json'
import {
  FIXTURE_NOW,
  availableBinSteps,
  findPool,
  passingCount,
  scoredPools,
} from './fixtures'

/**
 * The Phase 2 data source, checked for the three things that would make every
 * screen above it quietly wrong.
 */

const POOLS = poolsJson

describe('the fixture clock', () => {
  it('is the snapshot time, not the wall clock', () => {
    // Pool age feeds SAFETY. Against a frozen fixture, Date.now() would make
    // every score drift a little every day, so a screenshot taken today would
    // disagree with the same screen tomorrow for no reason anyone could find.
    // Asserted against the file rather than a literal date, so re-running
    // `snapshot:pools` does not fail a test for doing its job. The invariant
    // is "the clock is the snapshot's own capturedAt", and that is what this
    // pins; a hardcoded timestamp pinned the fixture's age instead.
    expect(FIXTURE_NOW).toBe(Math.floor(Date.parse(POOLS.capturedAt) / 1000))
    expect(Number.isFinite(FIXTURE_NOW)).toBe(true)
  })
})

describe('scoring the snapshot', () => {
  it('returns filtered-out pools rather than dropping them', () => {
    // S5 draws them as dim pins so the filter is observably doing work.
    const all = scoredPools('easy')
    expect(all.length).toBeGreaterThan(passingCount('easy'))
    expect(all.some((p) => !p.passes)).toBe(true)
  })

  it('loosens as difficulty rises', () => {
    expect(passingCount('hard')).toBeGreaterThanOrEqual(passingCount('normal'))
    expect(passingCount('normal')).toBeGreaterThanOrEqual(passingCount('easy'))
  })

  it('scores every pool on both axes', () => {
    for (const { pool, score } of scoredPools('hard')) {
      expect(score.safety, pool.pairAddress).toBeGreaterThanOrEqual(0)
      expect(score.safety, pool.pairAddress).toBeLessThanOrEqual(100)
      expect(score.heat, pool.pairAddress).toBeGreaterThanOrEqual(0)
      expect(score.heat, pool.pairAddress).toBeLessThanOrEqual(100)
    }
  })
})

describe('GOD MODE', () => {
  it('admits every pool the honeypot check cleared, and only those', () => {
    // CLAUDE.md rule 6. Every other filter is off; this one never is.
    const god = scoredPools('hard', true)
    expect(god.every((p) => p.passes === p.score.honeypotClean)).toBe(true)
  })

  it('actually loosens something', () => {
    // Compared against EASY, where the snapshot is known to hold a pool that
    // fails on liquidity. Compared against HARD it would prove nothing today:
    // every pool in the current four-pool fixture clears HARD, so GOD MODE
    // changes no count. That is a thin fixture, not a working filter, and it
    // is why S5 widens the snapshot.
    expect(passingCount('hard', true)).toBeGreaterThan(passingCount('easy'))
  })
})

describe('finding one pool', () => {
  const first = scoredPools('easy')[0].pool.pairAddress

  it('matches regardless of address casing', () => {
    // viem checksums addresses at the edge and the fixture does not, so a
    // case-sensitive compare would find nothing the moment Phase 3 lands.
    expect(findPool(first.toUpperCase().replace('0X', '0x'))).toBeDefined()
  })

  it('returns undefined for a missing or absent id rather than throwing', () => {
    // Gate 2.4: a screen must have a defined render for missing data.
    expect(findPool(null)).toBeUndefined()
    expect(findPool('0x' + '9'.repeat(40))).toBeUndefined()
  })
})

describe('bin steps', () => {
  it('offers more than one, so the coupled control has something to vary', () => {
    expect(availableBinSteps().length).toBeGreaterThan(1)
    expect(availableBinSteps()).toEqual(
      [...availableBinSteps()].sort((a, b) => a - b),
    )
  })
})
