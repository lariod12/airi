import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../../utils/error'
import { adminGuard } from '../admin-guard'

function createTestApp(apiKey: string | undefined) {
  const app = new Hono()
    .use('*', adminGuard(apiKey))
    .get('/test', c => c.json({ ok: true }))

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({
        error: err.errorCode,
        message: err.message,
        details: err.details,
      }, err.statusCode)
    }
    return c.json({ error: 'Internal Server Error', message: err.message }, 500)
  })

  return app
}

describe('adminGuard', () => {
  it('should return 503 when no admin key is configured', async () => {
    const app = createTestApp(undefined)
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer some-key' },
    })
    expect(res.status).toBe(503)
  })

  it('should return 401 when no Authorization header is provided', async () => {
    const app = createTestApp('secret-key')
    const res = await app.request('/test')
    expect(res.status).toBe(401)
  })

  it('should return 403 when wrong key is provided', async () => {
    const app = createTestApp('secret-key')
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer wrong-key' },
    })
    expect(res.status).toBe(403)
  })

  it('should pass when correct key is provided', async () => {
    const app = createTestApp('secret-key')
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer secret-key' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
