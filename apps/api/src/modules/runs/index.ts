import { Elysia } from 'elysia'

import { recordRunBody, recordRunResult, writeStatus } from './model'
import { RunsService } from './service'

/**
 * Controller. HTTP only; the chain write lives in `service.ts`.
 *
 * Both routes answer 200 whether or not writing is possible. A screen branches
 * on `recorded`, never on a status code, so a disabled flag and a healthy
 * server look the same to the caller: fine, and nothing written.
 */
export const runs = new Elysia({ name: 'runs', prefix: '/runs' })
  .model({ 'Runs.result': recordRunResult, 'Runs.status': writeStatus })
  .get('/status', () => RunsService.status(), {
    response: { 200: 'Runs.status' },
    detail: { summary: 'Can a run be written to chain right now' },
  })
  .post('/', ({ body }) => RunsService.record(body), {
    body: recordRunBody,
    response: { 200: 'Runs.result' },
    detail: { summary: 'Write a finished run to DiskRegistry, keeper-signed' },
  })
