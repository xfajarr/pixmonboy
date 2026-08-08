import { Elysia, t } from 'elysia'

const startedAt = Date.now()

/**
 * Liveness. No dependencies, no network, no chain.
 *
 * It has to be able to answer while everything else is broken, which is the
 * only reason it is worth having on a six hour project.
 */
export const health = new Elysia({ name: 'health' }).get(
  '/health',
  () => ({ status: 'ok' as const, uptimeMs: Date.now() - startedAt }),
  {
    response: {
      200: t.Object({
        status: t.Literal('ok'),
        uptimeMs: t.Number(),
      }),
    },
    detail: { summary: 'Liveness probe' },
  },
)
