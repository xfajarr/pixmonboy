import { Elysia, t } from 'elysia'

import { chainSummary } from './model'
import { ChainService } from './service'

/**
 * Controller. HTTP only, business logic lives in `service.ts`.
 *
 * Named so Elysia deduplicates it if more than one instance mounts it, per the
 * elysiajs skill's deduplication rule.
 */
export const chain = new Elysia({ name: 'chain', prefix: '/chain' })
  .model({ 'Chain.summary': chainSummary })
  .get('/', () => ChainService.current(), {
    response: { 200: 'Chain.summary' },
    detail: { summary: 'The chain this build targets' },
  })
  .get('/all', () => ChainService.all(), {
    response: { 200: t.Array(chainSummary) },
    detail: { summary: 'Every chain we have verified addresses for' },
  })
  .get('/:key', ({ params: { key } }) => ChainService.byKey(key), {
    params: t.Object({
      key: t.Union([t.Literal('mainnet'), t.Literal('testnet')]),
    }),
    response: { 200: 'Chain.summary' },
    detail: { summary: 'One chain by key' },
  })
