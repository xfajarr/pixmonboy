import { describe, expect, it } from 'vitest'
import { createSim, nudge, recordRebalance, step, summarize } from './sim'
import type { Pool } from '../types/domain'

/**
 * A fixture pool, not a fixture import from data/. This file is not testing
 * whether the committed snapshot parses, only whether the walk built on top
 * of a Pool shape behaves. Wiring it to the real fixture would make every
 * assertion here hostage to someone editing data/pools.fixture.json for an
 * unrelated reason.
 */
const POOL: Pool = {
  pairAddress: '0x1111111111111111111111111111111111111111',
  tokenX: {
    address: '0x1111111111111111111111111111111111111111',
    symbol: 'CHOG',
    decimals: 18,
  },
  tokenY: {
    address: '0x2222222222222222222222222222222222222222',
    symbol: 'USDC',
    decimals: 6,
  },
  binStep: 25,
  activeBinId: 8_388_608,
  tvlUsd: 100_000,
  volume24hUsd: 20_000,
  createdAt: 0,
  createdAtIsExact: true,
  lpConcentration: 0.1,
  realizedVol24h: 0.4,
}

const AMOUNT = 100

describe('createSim + step, determinism', () => {
  it('the same pool produces the same opening state every time', () => {
    const a = createSim(
      POOL,
      POOL.activeBinId - 20,
      POOL.activeBinId + 20,
      AMOUNT,
    )
    const b = createSim(
      POOL,
      POOL.activeBinId - 20,
      POOL.activeBinId + 20,
      AMOUNT,
    )
    expect(a).toEqual(b)
  })

  it('the same seed produces the same sequence, every call', () => {
    // Two independent trajectories from the same starting point. If step()
    // read the clock or Math.random(), these would diverge; they must not,
    // because the out-of-range moment has to be reproducible on stage.
    const lower = POOL.activeBinId - 20
    const upper = POOL.activeBinId + 20

    let a = createSim(POOL, lower, upper, AMOUNT)
    let b = createSim(POOL, lower, upper, AMOUNT)

    for (let i = 0; i < 25; i += 1) {
      a = step(a, POOL, lower, upper, AMOUNT)
      b = step(b, POOL, lower, upper, AMOUNT)
    }

    expect(a).toEqual(b)
  })
})

describe('fees and damage, mutually exclusive', () => {
  // A range placed nowhere near the active bin. A single step's random walk
  // is a handful of bins at most (see sim.ts's stepVol maths), nowhere close
  // to the 1000-bin gap here, so the position stays out of range for the
  // whole test without depending on which way the walk happens to go.
  const lower = POOL.activeBinId + 1_000
  const upper = POOL.activeBinId + 2_000

  it('fees do not accrue by even a fraction while out of range', () => {
    let state = createSim(POOL, lower, upper, AMOUNT)
    expect(state.feesEarnedUsd).toBe(0)

    for (let i = 0; i < 10; i += 1) {
      state = step(state, POOL, lower, upper, AMOUNT)
      expect(state.feesEarnedUsd).toBe(0)
    }
  })

  it('damage accrues while out of range and is stored positive', () => {
    let state = createSim(POOL, lower, upper, AMOUNT)
    expect(state.damageUsd).toBe(0)

    for (let i = 0; i < 10; i += 1) {
      const previous = state.damageUsd
      state = step(state, POOL, lower, upper, AMOUNT)
      expect(state.damageUsd).toBeGreaterThan(previous)
    }
    expect(state.damageUsd).toBeGreaterThan(0)
  })
})

describe('nudge', () => {
  it('walks the active bin toward the edge and, applied enough times, exits the range', () => {
    const lower = POOL.activeBinId - 10
    const upper = POOL.activeBinId + 10
    let state = createSim(POOL, lower, upper, AMOUNT)

    expect(state.activeBinId).toBeGreaterThanOrEqual(lower)
    expect(state.activeBinId).toBeLessThanOrEqual(upper)

    // Walk toward the upper edge, decisively, the way SELECT does on stage.
    for (let i = 0; i < 6; i += 1) {
      state = nudge(state, 1, 3)
    }

    expect(state.activeBinId).toBeGreaterThan(upper)
  })

  it('does not touch fees, damage, elapsed time, or history', () => {
    const lower = POOL.activeBinId - 10
    const upper = POOL.activeBinId + 10
    const before = createSim(POOL, lower, upper, AMOUNT)
    const after = nudge(before, 1, 3)

    expect(after.feesEarnedUsd).toBe(before.feesEarnedUsd)
    expect(after.damageUsd).toBe(before.damageUsd)
    expect(after.elapsedSeconds).toBe(before.elapsedSeconds)
    expect(after.history).toEqual(before.history)
    expect(after.seed).toBe(before.seed)
  })
})

describe('history', () => {
  it('stays capped', () => {
    const lower = POOL.activeBinId - 20
    const upper = POOL.activeBinId + 20
    let state = createSim(POOL, lower, upper, AMOUNT)

    for (let i = 0; i < 60; i += 1) {
      state = step(state, POOL, lower, upper, AMOUNT)
      expect(state.history.length).toBeLessThanOrEqual(30)
    }
    expect(state.history.length).toBe(30)
  })
})

describe('the run summary S8 reports on', () => {
  const LOW = POOL.activeBinId - 20
  const HIGH = POOL.activeBinId + 20

  it('a run that never ticked reports 0%, not NaN', () => {
    // Gate 2.4: the zero-tick state is a real render, so it must be a real
    // number. 0/0 would put NaN% on the results screen.
    expect(summarize(createSim(POOL, LOW, HIGH, AMOUNT)).timeInRangePct).toBe(0)
  })

  it('counts every tick, and counts the in-range ones separately', () => {
    let sim = createSim(POOL, LOW, HIGH, AMOUNT)
    for (let i = 0; i < 10; i += 1) sim = step(sim, POOL, LOW, HIGH, AMOUNT)

    expect(sim.totalTicks).toBe(10)
    expect(sim.ticksInRange).toBeLessThanOrEqual(sim.totalTicks)
    expect(summarize(sim).timeInRangePct).toBeCloseTo(
      (sim.ticksInRange / 10) * 100,
    )
  })

  it('a streak broken by going out of range does not carry into the next one', () => {
    // Walked out of range by hand rather than waiting for the RNG to do it,
    // so the assertion is about the counter and not about the walk.
    let sim = createSim(POOL, LOW, HIGH, AMOUNT)
    sim = step(sim, POOL, LOW, HIGH, AMOUNT)
    const afterOne = sim.streakSeconds

    sim = nudge(sim, 1, 100)
    sim = step(sim, POOL, LOW, HIGH, AMOUNT)

    expect(sim.streakSeconds).toBe(0)
    expect(sim.bestStreakSeconds).toBe(afterOne)
  })

  it('net is fees less damage, and damage stays positive in the summary', () => {
    let sim = createSim(POOL, LOW, HIGH, AMOUNT)
    sim = nudge(sim, 1, 100)
    for (let i = 0; i < 5; i += 1) sim = step(sim, POOL, LOW, HIGH, AMOUNT)

    const run = summarize(sim)
    expect(run.damageUsd).toBeGreaterThan(0)
    expect(run.netUsd).toBeCloseTo(run.feesEarnedUsd - run.damageUsd)
  })

  it('recordRebalance counts, and charges for the swap it just did', () => {
    const before = createSim(POOL, LOW, HIGH, AMOUNT)
    const after = recordRebalance(before, AMOUNT)

    expect(after.rebalances).toBe(1)
    // PRD.md 8.5 point 2: a rebalance is never free. A count without a cost
    // would teach a beginner that churning out of trouble is free, which is
    // the exact belief that makes autopilot lose money in a choppy market.
    expect(after.damageUsd).toBeGreaterThan(before.damageUsd)
    // And nothing else moves. The price did not change because the player
    // pressed a button; only the position around it did.
    expect({ ...after, rebalances: 0, damageUsd: before.damageUsd }).toEqual(
      before,
    )
  })

  it('makes repeated rebalancing cost more than doing it once', () => {
    // The honest shape of the lesson: each rescue is cheap, a habit is not.
    let churned = createSim(POOL, LOW, HIGH, AMOUNT)
    for (let i = 0; i < 6; i += 1) churned = recordRebalance(churned, AMOUNT)
    const once = recordRebalance(createSim(POOL, LOW, HIGH, AMOUNT), AMOUNT)

    expect(churned.damageUsd).toBeGreaterThan(once.damageUsd * 5)
  })
})
