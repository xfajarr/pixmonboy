import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  server: {
    // Any host. This looks lax and is the correct setting for THIS project on
    // THIS day: the console is demoed through a tunnel, `cloudflared` mints a
    // fresh random hostname on every start, and an allowlist of yesterday's
    // hostnames serves a plain-text "Blocked request" page instead of the game.
    //
    // It is not only the dev server. `vite preview` inherits `server.allowedHosts`
    // and the built `dist/server/server.js` starts no listener of its own, so
    // preview is the only way to serve the production build and it is behind
    // this same setting. There is no third path to a shareable URL.
    //
    // The app holds no secrets and no user funds; the deployer key lives in an
    // environment variable and never reaches the client. Tighten this to the
    // real hostname the moment there is a permanent one.
    allowedHosts: true,
  },
})

export default config
