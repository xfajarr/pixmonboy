import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  gatesFor,
  mainnetProfile,
  profiles,
  selfTestnetProfile,
} from '../config/thresholds'
import { zMomentumSnapshot, zPoolsFixture } from './domain'
import type { Difficulty } from './domain'

function readFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../../data/${name}`, import.meta.url)),
      'utf8',
    ),
  )
}

/**
 * Gate 0.4. A fixture that drifts from its type must fail here rather than
 * produce a screen that works on fake data and breaks on real data.
 */
describe('every fixture parses against its schema', () => {
  it('pools.fixture.json is a valid mainnet pool set', () => {
    const parsed = zPoolsFixture.parse(readFixture('pools.fixture.json'))
    expect(parsed.profile).toBe('mainnet')
    expect(parsed.pools.length).toBeGreaterThanOrEqual(3)
  })

  it('pools.self-testnet.fixture.json is a valid self-deployed pool set', () => {
    const parsed = zPoolsFixture.parse(
      readFixture('pools.self-testnet.fixture.json'),
    )
    expect(parsed.profile).toBe('self-testnet')
  })

  it('momentum.json is a valid snapshot', () => {
    const parsed = zMomentumSnapshot.parse(readFixture('momentum.json'))
    expect(parsed.entries.length).toBeGreaterThan(0)
  })
})

describe('fixtures cover the cases the UI has to render', () => {
  const mainnet = zPoolsFixture.parse(readFixture('pools.fixture.json'))

  it('includes a token with 6 decimals and one with 18', () => {
    // SMART-CONTRACTS.md 12.3 item 1. If every fixture token were 18 decimals,
    // a hardcoded assumption would pass every test and break on mainnet USDC.
    const all = mainnet.pools.flatMap((p) => [p.tokenX, p.tokenY])
    expect(new Set(all.map((t) => t.decimals))).toEqual(new Set([6, 18]))
  })

  it('includes a pool with null lpConcentration and null volatility', () => {
    // ERD.md section 3 warns lpConcentration may be unobtainable on Monad.
    // The UI must have a fixture where it is absent, or that path is untested.
    expect(mainnet.pools.some((p) => p.lpConcentration === null)).toBe(true)
    expect(mainnet.pools.some((p) => p.realizedVol24h === null)).toBe(true)
  })

  it('includes a pool that will fail the EASY gates', () => {
    const gates = gatesFor('easy', mainnetProfile)
    expect(mainnet.pools.some((p) => p.tvlUsd < gates.minTvlUsd)).toBe(true)
  })

  it('includes a pool young enough to exercise the age term', () => {
    // Every pool being older than the saturation point makes poolAge a
    // constant 100, which means the term is never actually tested and a bug
    // in it would ship.
    const young = mainnet.pools.filter(
      (p) => 1_785_000_000 - p.createdAt < mainnetProfile.ageSaturationSeconds,
    )
    expect(young.length).toBeGreaterThan(0)
    expect(mainnet.pools.length).toBeGreaterThan(young.length)
  })

  it('spans bin steps, so the coupled control has something to vary', () => {
    expect(new Set(mainnet.pools.map((p) => p.binStep)).size).toBeGreaterThan(1)
  })
})

describe('scoring profiles', () => {
  it('weights sum to 1 in every profile', () => {
    for (const profile of Object.values(profiles)) {
      const safety = Object.values(profile.safetyWeights).reduce(
        (a, b) => a + b,
        0,
      )
      const heat = Object.values(profile.heatWeights).reduce((a, b) => a + b, 0)
      expect(safety, `${profile.id} safety weights`).toBeCloseTo(1, 10)
      expect(heat, `${profile.id} heat weights`).toBeCloseTo(1, 10)
    }
  })

  it('uses identical weights across profiles, only magnitudes differ', () => {
    // The model is the claim we defend to a judge. It must not be quietly
    // different on the chain we actually demo on.
    expect(selfTestnetProfile.safetyWeights).toEqual(
      mainnetProfile.safetyWeights,
    )
    expect(selfTestnetProfile.heatWeights).toEqual(mainnetProfile.heatWeights)
  })

  it('scales depth thresholds down for a self-seeded pool', () => {
    // The trap in SMART-CONTRACTS.md 12.3 item 2 is that one profile's floor
    // silently zeroes another path's pools. The magnitudes moved when the
    // mainnet profile was recalibrated against the real Monad market, so this
    // asserts the ORDERING that makes the trap impossible rather than two
    // numbers that were true on the day it was written.
    expect(selfTestnetProfile.depthFloorUsd).toBeLessThan(
      mainnetProfile.depthFloorUsd,
    )
    expect(selfTestnetProfile.depthCeilingUsd).toBeLessThan(
      mainnetProfile.depthCeilingUsd,
    )
    // A pool at the self-seeded floor must still be scoreable there and must
    // NOT be scoreable at the mainnet floor. That is the whole trap.
    const seeded = selfTestnetProfile.depthFloorUsd + 1
    expect(seeded).toBeLessThan(mainnetProfile.depthFloorUsd)
  })

  it('turnover is banded, not monotonic', () => {
    for (const profile of Object.values(profiles)) {
      expect(profile.turnoverIdealLow).toBeLessThan(profile.turnoverIdealHigh)
      expect(profile.turnoverIdealHigh).toBeLessThan(profile.turnoverDeadAbove)
    }
  })

  it('never degrades momentum to zero', () => {
    // A missing scrape must not read as "nobody is talking about this".
    for (const profile of Object.values(profiles)) {
      expect(profile.momentumNeutral).toBe(50)
    }
  })
})

describe('gates', () => {
  const tiers: Array<Difficulty> = ['easy', 'normal', 'hard']

  it('keeps the honeypot check on at every tier, in every profile', () => {
    // CLAUDE.md rule 6. Never disabled, including in GOD MODE, which is a
    // modifier on HARD rather than a fourth tier.
    for (const profile of Object.values(profiles)) {
      for (const tier of tiers) {
        expect(gatesFor(tier, profile).honeypotCheck).toBe(true)
      }
    }
  })

  it('loosens monotonically from easy to hard', () => {
    const [easy, normal, hard] = tiers.map((t) => gatesFor(t, mainnetProfile))
    expect(easy.minTvlUsd).toBeGreaterThan(normal.minTvlUsd)
    expect(normal.minTvlUsd).toBeGreaterThan(hard.minTvlUsd)
    expect(easy.minSafety).toBeGreaterThan(normal.minSafety)
    expect(normal.minSafety).toBeGreaterThan(hard.minSafety)
    expect(easy.maxHeat).toBeLessThan(normal.maxHeat)
    expect(normal.maxHeat).toBeLessThan(hard.maxHeat)
  })

  it('restricts EASY to strong quote assets only', () => {
    const easy = gatesFor('easy', mainnetProfile)
    expect(easy.allowedQuoteSymbols).toEqual(mainnetProfile.strongQuotes)
    expect(easy.allowedQuoteSymbols).not.toContain('WETH')
  })

  it('admits the seeded testnet pools at EASY', () => {
    // If this fails, the demo shows an empty tracker on our own deployment
    // while being perfectly correct. That is the failure mode this whole
    // profile mechanism exists to prevent.
    const gates = gatesFor('easy', selfTestnetProfile)
    const seeded = zPoolsFixture.parse(
      readFixture('pools.self-testnet.fixture.json'),
    )
    for (const pool of seeded.pools) {
      expect(pool.tvlUsd, pool.pairAddress).toBeGreaterThan(gates.minTvlUsd)
    }
  })
})
