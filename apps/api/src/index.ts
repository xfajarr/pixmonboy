import { Elysia } from 'elysia'

import { chain } from './modules/chain'
import { faucet } from './modules/faucet'
import { health } from './modules/health'
import { runs } from './modules/runs'

/**
 * The API, as a value rather than a running server.
 *
 * This module never calls `.listen()`. It exports the Elysia instance so it
 * can be mounted two ways from the same code:
 *
 *   1. inside the web app, at `apps/web/src/routes/api.$.ts`, via
 *      `app.fetch(request)`. This is the demo path. One process, one deploy,
 *      no CORS, and nothing extra that can be down at 18:00 on stage.
 *   2. standalone, via `src/server.ts`, for `bun run --cwd apps/api dev` when
 *      you want to curl it without booting Vite.
 *
 * `prefix: '/api'` matches the catch-all route the web app mounts it under, so
 * a path is written once and means the same thing in both modes.
 */
export const app = new Elysia({ prefix: '/api' })
  .onError(({ code, error, status }) => {
    if (code === 'VALIDATION') return status(422, 'Invalid request')
    if (code === 'NOT_FOUND') return status(404, 'Not found')

    // Never leak an internal message to a client. The console screens have
    // canned fallbacks; a stack trace on screen is not one of them.
    console.error('[api]', code, error instanceof Error ? error.message : error)
    return status(500, 'Internal error')
  })
  .use(health)
  .use(chain)
  .use(faucet)
  .use(runs)

/** Consumed by Eden Treaty for end to end types. See `references/eden.md`. */
export type App = typeof app
