import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'
import { treaty } from '@elysiajs/eden'

import { app } from '@pixmon-boy/api'

/**
 * The API, mounted inside the console's own server.
 *
 * This is the official Elysia + TanStack Start integration: Elysia handles the
 * request via `app.fetch`, inside a Start server route. It matters for exactly
 * one reason, and it is the rule at the top of CLAUDE.md.
 *
 *   Nothing goes in the demo path that can fail on stage.
 *
 * A second Elysia process would be a second thing to start, a second thing to
 * deploy, a second URL to get wrong, and a second thing that can be down at
 * 18:00. Mounted, it is the same process as the screens. If the console is up,
 * the API is up, by construction.
 *
 * `apps/api` is still a real, separate workspace with its own entrypoint, so
 * `bun run dev:api` gives you a standalone server to curl during development.
 * Same code, two mount points, one deployable.
 */

const handle = ({ request }: { request: Request }) => app.fetch(request)

/**
 * Eden Treaty, resolved differently on each side.
 *
 * On the server it calls the Elysia instance directly, so an SSR render pays
 * no HTTP round trip at all. On the client it goes over fetch to the same
 * origin, which is why there is no CORS configuration anywhere in this repo.
 */
export const getApi = createIsomorphicFn()
  .server(() => treaty(app).api)
  .client(() => treaty<typeof app>(window.location.origin).api)

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
})
