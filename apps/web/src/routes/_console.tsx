import { Outlet, createFileRoute } from '@tanstack/react-router'
import { Console } from '../console/Console'
import { brand } from '../config/brand'

/**
 * The console shell, mounted ONCE for every screen underneath it.
 *
 * Pathless on purpose. `/play/tracker` is still `/play/tracker`; this route
 * only owns the chrome.
 *
 * Why a layout rather than a <Console> per route: a route component unmounts
 * when you navigate away, and <Console> owns ConsoleInputProvider. Per-route
 * shells would tear down the input store, drop held keys, and reset the volume
 * on every screen change. The console is hardware. Hardware does not reboot
 * between screens.
 */
export const Route = createFileRoute('/_console')({ component: Shell })

function Shell() {
  return (
    <Console wordmark={brand.CONSOLE_NAME}>
      <Outlet />
    </Console>
  )
}
