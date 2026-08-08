/**
 * Standalone entrypoint, for development only.
 *
 * The demo does NOT run this. In the demo the same `app` is mounted inside the
 * web app's catch-all route, so there is exactly one process to start and one
 * thing to deploy. This file exists so you can curl the API without waiting
 * for Vite.
 */

import { app } from './index'

const port = Number(process.env.API_PORT ?? 3001)

app.listen(port, () => {
  console.log(`[api] http://localhost:${port}/api/health`)
})
