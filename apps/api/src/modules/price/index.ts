import { Elysia, t } from 'elysia'

import { liveMonPrice } from './service'

/**
 * The live MON price, read from the demo pair on Monad mainnet.
 *
 * Controller. HTTP only, business logic lives in `service.ts`. The response is
 * a discriminated union so a screen can tell a live read from a stale one
 * without catching an exception, which is the repo's rule: nothing on screen
 * may break because an RPC had a bad afternoon.
 */
export const price = new Elysia({ name: 'price', prefix: '/price' }).get(
  '/mon',
  async () => liveMonPrice(),
  {
    response: {
      200: t.Union([
        t.Object({
          ok: t.Literal(true),
          priceUsd: t.Number(),
          /** Unix ms when the price was read. */
          at: t.Number(),
        }),
        t.Object({
          ok: t.Literal(false),
          priceUsd: t.Number(),
          at: t.Number(),
          stale: t.Literal(true),
        }),
        t.Object({
          ok: t.Literal(false),
          reason: t.String(),
        }),
      ]),
    },
    detail: { summary: 'The live MON price, read from Liquidity Book' },
  },
)
