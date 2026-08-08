import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  gatesFor,
  mainnetProfile,
  selfTestnetProfile,
} from '../../config/thresholds'
import { zPoolsFixture } from '../../types/domain'
import { GATE_COPY, evaluateGates } from './gates'
import {
  liquidityDepthScore,
  momentumScore,
  poolAgeScore,
  quoteQualityScore,
  realizedVolScore,
  scorePool,
  turnoverScore,
} from './score'
import type { GateFailure } from './gates'
import type { Pool } from '../../types/domain'

const fixture = zPoolsFixture.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL('../../../../../data/pools.fixture.json', import.meta.url),
      ),
      'utf8',
    ),
  ),
)

const NOW = 1_785_000_000
const pools = fixture.pools
const chog = pools[0]

function score(
  pool: Pool,
  overrides: Partial<Parameters<typeof scorePool>[0]> = {},
) {
  return scorePool(
    {
      pool,
      momentum: {
        symbol: pool.tokenX.symbol,
        score: 70,
        mentions: 10,
        velocity: 1,
      },
      momentumAgeSeconds: 3600,
      honeypotClean: true,
      nowSeconds: NOW,
      ...overrides,
    },
    mainnetProfile,
  )
}

describe('liquidity depth is log scaled', () => {
  it('is 0 at or below the floor and 100 at or above the ceiling', () => {
    expect(liquidityDepthScore(0, mainnetProfile)).toBe(0)
    expect(
      liquidityDepthScore(mainnetProfile.depthFloorUsd, mainnetProfile),
    ).toBe(0)
    expect(
      liquidityDepthScore(mainnetProfile.depthCeilingUsd * 2, mainnetProfile),
    ).toBe(100)
  })

  it('separates small pools far more than large ones', () => {
    // The whole reason for the log. Linear scaling would make every pool below
    // the largest one look identical, which is exactly the screen we are
    // trying not to build.
    const smallGap =
      liquidityDepthScore(100_000, mainnetProfile) -
      liquidityDepthScore(50_000, mainnetProfile)
    const largeGap =
      liquidityDepthScore(4_050_000, mainnetProfile) -
      liquidityDepthScore(4_000_000, mainnetProfile)
    expect(smallGap).toBeGreaterThan(largeGap * 5)
  })

  it('rises monotonically', () => {
    let previous = -1
    for (const tvl of [30_000, 60_000, 200_000, 900_000, 3_000_000]) {
      const s = liquidityDepthScore(tvl, mainnetProfile)
      expect(s).toBeGreaterThanOrEqual(previous)
      previous = s
    }
  })

  it('scores a self-seeded pool sensibly under its own profile', () => {
    // SMART-CONTRACTS.md 12.3 item 2. Under the WRONG profile a pool scores
    // zero and the tracker renders empty while being perfectly correct.
    // Expressed against each profile's own floor, because the mainnet
    // magnitudes were recalibrated against the real Monad market and a literal
    // dollar figure would pin the calibration rather than the property.
    // Zero under the wrong profile, non-zero under the right one. It used to
    // assert >50 on the self-seeded side, which stopped being satisfiable when
    // the mainnet floor came down to Monad's real scale: 500 now sits BELOW the
    // point where the self-seeded curve reaches 50, so no single figure can be
    // under one and over the other. The trap being pinned is "the wrong profile
    // silently zeroes a real pool", and that is exactly what these two lines
    // say without over-specifying the curve.
    const belowMainnetFloor = mainnetProfile.depthFloorUsd - 1
    expect(liquidityDepthScore(belowMainnetFloor, mainnetProfile)).toBe(0)
    expect(
      liquidityDepthScore(belowMainnetFloor, selfTestnetProfile),
    ).toBeGreaterThan(0)
  })
})

describe('pool age saturates', () => {
  it('is 0 for a pool created now and 100 past saturation', () => {
    expect(poolAgeScore(0, mainnetProfile)).toBe(0)
    expect(poolAgeScore(-100, mainnetProfile)).toBe(0)
    expect(
      poolAgeScore(mainnetProfile.ageSaturationSeconds * 3, mainnetProfile),
    ).toBe(100)
  })
})

describe('quote quality is a lookup', () => {
  it('rewards the strong quotes and punishes unknown tokens', () => {
    expect(quoteQualityScore('USDC', mainnetProfile)).toBe(100)
    expect(quoteQualityScore('WETH', mainnetProfile)).toBe(60)
    expect(quoteQualityScore('SOMERANDOMTOKEN', mainnetProfile)).toBe(20)
  })
})

describe('turnover is banded, not monotonic', () => {
  const tvl = 100_000

  it('peaks inside the band', () => {
    const ideal = turnoverScore(tvl * 0.5, tvl, mainnetProfile)
    expect(ideal).toBe(100)
  })

  it('falls off on BOTH sides', () => {
    // A monotonic score would rank the most dangerous pool in the list as the
    // best one, which is the opposite of what this product is for.
    const dead = turnoverScore(tvl * 0.01, tvl, mainnetProfile)
    const frantic = turnoverScore(tvl * 8, tvl, mainnetProfile)
    const ideal = turnoverScore(tvl * 0.5, tvl, mainnetProfile)

    expect(dead).toBeLessThan(ideal)
    expect(frantic).toBeLessThan(ideal)
    expect(frantic).toBe(0)
  })

  it('is not monotonic across the whole range, provably', () => {
    const samples = [0.01, 0.1, 0.5, 1.0, 2, 4, 8].map((t) =>
      turnoverScore(tvl * t, tvl, mainnetProfile),
    )
    const rising = samples.some((s, i) => i > 0 && s > samples[i - 1])
    const falling = samples.some((s, i) => i > 0 && s < samples[i - 1])
    expect(rising && falling).toBe(true)
  })

  it('returns 0 rather than dividing by zero on an empty pool', () => {
    expect(turnoverScore(1000, 0, mainnetProfile)).toBe(0)
  })
})

describe('volatility', () => {
  it('returns neutral when history is too short to measure', () => {
    expect(realizedVolScore(null, mainnetProfile)).toBe(50)
  })

  it('clamps at both ends', () => {
    expect(realizedVolScore(0, mainnetProfile)).toBe(0)
    expect(realizedVolScore(99, mainnetProfile)).toBe(100)
  })
})

describe('momentum degrades to neutral, never to zero', () => {
  it('is neutral when the token has no entry', () => {
    // Zero would be a claim that nobody is talking about it, which we cannot
    // support from a missing file. CLAUDE.md rule 1.
    const result = momentumScore(undefined, 0, mainnetProfile)
    expect(result.score).toBe(50)
    expect(result.degraded).toBe(true)
  })

  it('is neutral when the snapshot is stale', () => {
    const entry = { symbol: 'CHOG', score: 95, mentions: 1, velocity: 1 }
    const fresh = momentumScore(entry, 3600, mainnetProfile)
    const stale = momentumScore(
      entry,
      mainnetProfile.momentumStaleAfterSeconds + 1,
      mainnetProfile,
    )

    expect(fresh.score).toBe(95)
    expect(fresh.degraded).toBe(false)
    expect(stale.score).toBe(50)
    expect(stale.degraded).toBe(true)
  })

  it('flags degradation so the UI can say so', () => {
    const scored = score(chog, { momentum: undefined })
    expect(scored.momentumDegraded).toBe(true)
  })
})

describe('scorePool', () => {
  it('returns every score inside 0 to 100', () => {
    for (const pool of pools) {
      const s = score(pool)
      for (const [key, value] of Object.entries(s)) {
        if (typeof value !== 'number') continue
        expect(value, `${pool.tokenX.symbol}.${key}`).toBeGreaterThanOrEqual(0)
        expect(value, `${pool.tokenX.symbol}.${key}`).toBeLessThanOrEqual(100)
      }
    }
  })

  it('redistributes the concentration weight when it is unreadable', () => {
    // ERD.md section 3. An unknown must never look like a bad score, because a
    // bad score removes the pool from the game entirely.
    const withConcentration = { ...chog, lpConcentration: 0.5 }
    const without = { ...chog, lpConcentration: null }

    const a = score(withConcentration)
    const b = score(without)

    // With a mid concentration the two should be close, and crucially the
    // unreadable one must not be dragged toward zero.
    expect(b.safety).toBeGreaterThan(a.safety - 20)
    expect(b.safety).toBeGreaterThan(0)
  })

  it('scores a deep, old, USDC-quoted pool above a thin new one', () => {
    const deep = score(pools[1])
    const thin = score(pools[3])
    expect(deep.safety).toBeGreaterThan(thin.safety)
  })

  it('reports the terms, not just the totals', () => {
    // The tracker explains a score by showing its parts. An opaque number is
    // exactly the intimidating artifact this product removes.
    const s = score(chog)
    expect(s.liquidityDepth).toBeGreaterThan(0)
    expect(s.poolAge).toBeGreaterThan(0)
    expect(s.quoteQuality).toBe(100)
  })

  it('is deterministic, so the same pool always scores the same', () => {
    // CLAUDE.md rule 1 in its enforceable form. A score that varies between
    // two calls on identical inputs is reading something it did not declare,
    // and the only interesting thing it could be reading is the clock.
    // Determinism is also what lets a judge check the number by hand.
    const first = score(chog)
    const second = score(chog)
    expect(second).toEqual(first)
  })

  it('has no hidden clock', () => {
    // `now` is an argument. If the module read Date.now() itself, freezing the
    // argument would not freeze the output.
    const frozen = scorePool(
      {
        pool: chog,
        momentum: undefined,
        momentumAgeSeconds: 0,
        honeypotClean: true,
        nowSeconds: NOW,
      },
      mainnetProfile,
    )
    const later = scorePool(
      {
        pool: chog,
        momentum: undefined,
        momentumAgeSeconds: 0,
        honeypotClean: true,
        nowSeconds: NOW,
      },
      mainnetProfile,
    )
    expect(later).toEqual(frozen)

    // And moving `now` forward DOES move the age term, proving the argument is
    // the only source of time. Uses the young pool, because an old one is
    // already saturated at 100 and could not rise.
    const young = pools[3]
    const beforeAging = scorePool(
      {
        pool: young,
        momentum: undefined,
        momentumAgeSeconds: 0,
        honeypotClean: true,
        nowSeconds: NOW,
      },
      mainnetProfile,
    )
    const aged = scorePool(
      {
        pool: young,
        momentum: undefined,
        momentumAgeSeconds: 0,
        honeypotClean: true,
        nowSeconds: NOW + 60 * 60 * 24 * 90,
      },
      mainnetProfile,
    )
    expect(beforeAging.poolAge).toBeLessThan(100)
    expect(aged.poolAge).toBeGreaterThan(beforeAging.poolAge)
  })
})

describe('gates run before scores and are absolute', () => {
  const easy = gatesFor('easy', mainnetProfile)
  const hard = gatesFor('hard', mainnetProfile)

  it('collects every failure, not just the first', () => {
    // "This pool is too new" when it is also a honeypot is the least useful
    // true thing a screen can say.
    const bad: Pool = { ...pools[3], createdAt: NOW - 60, tvlUsd: 100 }
    const result = evaluateGates(
      bad,
      { ...score(bad), honeypotClean: false },
      easy,
      NOW,
    )

    expect(result.passed).toBe(false)
    expect(result.failures).toContain('tvl-too-low')
    expect(result.failures).toContain('too-new')
    expect(result.failures).toContain('honeypot')
    expect(result.failures.length).toBeGreaterThan(2)
  })

  it('fails a honeypot at EVERY difficulty, including hard', () => {
    // CLAUDE.md rule 6. The honeypot check is never disabled, including in
    // GOD MODE, which is a modifier on hard rather than a fourth tier.
    for (const gates of [easy, gatesFor('normal', mainnetProfile), hard]) {
      const result = evaluateGates(
        chog,
        { ...score(chog), honeypotClean: false },
        gates,
        NOW,
      )
      expect(result.failures).toContain('honeypot')
      expect(result.passed).toBe(false)
    }
  })

  it('admits more pools at hard than at easy', () => {
    const atEasy = pools.filter(
      (p) => evaluateGates(p, score(p), easy, NOW).passed,
    ).length
    const atHard = pools.filter(
      (p) => evaluateGates(p, score(p), hard, NOW).passed,
    ).length
    expect(atHard).toBeGreaterThanOrEqual(atEasy)
  })

  it('rejects a quote token the tier does not allow', () => {
    const weird: Pool = {
      ...chog,
      tokenY: { ...chog.tokenY, symbol: 'SKETCH' },
    }
    const result = evaluateGates(weird, score(weird), easy, NOW)
    expect(result.failures).toContain('quote-not-allowed')
  })

  it('rejects a pool that is too hot for the tier', () => {
    const result = evaluateGates(chog, { ...score(chog), heat: 99 }, easy, NOW)
    expect(result.failures).toContain('heat-too-high')
  })

  it('has copy for every failure, and none of it scolds', () => {
    const all: Array<GateFailure> = [
      'tvl-too-low',
      'too-new',
      'quote-not-allowed',
      'honeypot',
      'safety-too-low',
      'heat-too-low',
      'heat-too-high',
    ]
    for (const failure of all) {
      expect(GATE_COPY[failure], failure).toBeTruthy()
      expect(GATE_COPY[failure].length).toBeGreaterThan(10)
      expect(GATE_COPY[failure]).not.toMatch(/—/)
    }
  })
})
