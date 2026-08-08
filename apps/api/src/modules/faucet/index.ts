import { Elysia, t } from 'elysia'

import { FaucetService } from './service'

const faucetResult = t.Object({
  funded: t.Boolean(),
  txHash: t.Nullable(t.String()),
  amountMon: t.Nullable(t.String()),
  balanceMon: t.Nullable(t.String()),
  reason: t.Nullable(t.String()),
  remainingDrips: t.Number(),
})

const faucetStatus = t.Object({
  enabled: t.Boolean(),
  chainId: t.Number(),
  dripMon: t.String(),
  remainingDrips: t.Number(),
  reason: t.Nullable(t.String()),
})

/**
 * Controller. Always 200, same as `/runs`: a screen branches on `funded`, never
 * on a status code, so "the faucet is off" and "the faucet worked" reach the
 * caller through the same shape.
 */
export const faucet = new Elysia({ name: 'faucet', prefix: '/faucet' })
  .model({ 'Faucet.result': faucetResult, 'Faucet.status': faucetStatus })
  .get('/status', () => FaucetService.status(), {
    response: { 200: 'Faucet.status' },
    detail: { summary: 'Can the faucet drip right now' },
  })
  .post('/', ({ body }) => FaucetService.drip(body.address), {
    body: t.Object({ address: t.String() }),
    response: { 200: 'Faucet.result' },
    detail: {
      summary: 'Send a new wallet enough gas for its first two writes',
    },
  })
