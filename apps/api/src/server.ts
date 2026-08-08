/**
 * Standalone entrypoint, for development only.
 *
 * The demo does NOT run this. In the demo the same `app` is mounted inside the
 * web app's catch-all route, so there is exactly one process to start and one
 * thing to deploy. This file exists so you can curl the API without waiting
 * for Vite.
 */

/**
 * THE WORKSPACE ENV IS LOADED BY THE `dev` SCRIPT, not by this file.
 *
 * Bun auto-loads a `.env`, but from the CURRENT WORKING DIRECTORY, and this
 * server runs with cwd `apps/api` while the file lives at the workspace root.
 * Without it the faucet reports itself switched off for want of a keeper key
 * that is sitting in `.env.local` — exactly the bug the web app had until
 * `apps/web/vite.config.ts` grew its own fix.
 *
 * `--env-file` in package.json rather than a loader here, because this module
 * is one `import` away from `index.ts`, which the WEB app also imports. An
 * import-time side effect that fills `process.env` would then race Vite's copy
 * of the same job, and the winner would depend on module resolution order.
 * A flag on the process that owns the problem has no such reach.
 */

import { app } from './index'

const port = Number(process.env.API_PORT ?? 3001)

app.listen(port, () => {
  console.log(`[api] http://localhost:${port}/api/health`)
})
