import type { BillingService } from '../../services/billing/billing-service'
import type { ConfigKVService } from '../../services/config-kv'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAdminRoutes } from '.'
import { ApiError } from '../../utils/error'

const ADMIN_KEY = 'test-admin-key'

function authHeaders() {
  return { Authorization: `Bearer ${ADMIN_KEY}` }
}

function createMockConfigKV(store: Record<string, unknown> = {}): ConfigKVService {
  return {
    getOptional: vi.fn(async (key: string) => store[key] ?? null),
    getOrThrow: vi.fn(async (key: string) => {
      if (store[key] === undefined)
        throw new Error(`Config key "${key}" is not set`)
      return store[key]
    }),
    get: vi.fn(async (key: string) => {
      if (store[key] === undefined)
        throw new Error(`Config key "${key}" is not set`)
      return store[key]
    }),
    set: vi.fn(async (key: string, value: unknown) => {
      store[key] = value
    }),
  } as any
}

function createMockBillingService(overrides: Partial<BillingService> = {}): BillingService {
  return {
    creditFlux: vi.fn(async () => ({ balanceBefore: 100, balanceAfter: 200 })),
    consumeFluxForLLM: vi.fn(),
    creditFluxFromStripeCheckout: vi.fn(),
    creditFluxFromInvoice: vi.fn(),
    ...overrides,
  } as any
}

function createTestApp(configKV?: ConfigKVService, billingService?: BillingService, adminKey?: string | undefined) {
  const app = new Hono()
    .route(
      '/admin',
      createAdminRoutes(
        configKV ?? createMockConfigKV(),
        billingService ?? createMockBillingService(),
        adminKey ?? ADMIN_KEY,
      ),
    )

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

describe('admin routes', () => {
  describe('gET /admin/config', () => {
    it('should list all config keys with values', async () => {
      const configKV = createMockConfigKV({ FLUX_PER_REQUEST: 10, DEFAULT_CHAT_MODEL: 'gpt-4' })
      const app = createTestApp(configKV)

      const res = await app.request('/admin/config', { headers: authHeaders() })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('FLUX_PER_REQUEST', 10)
      expect(body).toHaveProperty('DEFAULT_CHAT_MODEL', 'gpt-4')
      // Keys not in store should be null
      expect(body).toHaveProperty('INITIAL_USER_FLUX', null)
    })

    it('should return 401 without auth header', async () => {
      const app = createTestApp()
      const res = await app.request('/admin/config')
      expect(res.status).toBe(401)
    })
  })

  describe('gET /admin/config/:key', () => {
    it('should return a single config value', async () => {
      const configKV = createMockConfigKV({ FLUX_PER_REQUEST: 42 })
      const app = createTestApp(configKV)

      const res = await app.request('/admin/config/FLUX_PER_REQUEST', { headers: authHeaders() })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ key: 'FLUX_PER_REQUEST', value: 42 })
    })

    it('should return null for unset key', async () => {
      const configKV = createMockConfigKV()
      const app = createTestApp(configKV)

      const res = await app.request('/admin/config/GATEWAY_BASE_URL', { headers: authHeaders() })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ key: 'GATEWAY_BASE_URL', value: null })
    })
  })

  describe('pUT /admin/config/:key', () => {
    it('should set a config value', async () => {
      const configKV = createMockConfigKV()
      const app = createTestApp(configKV)

      const res = await app.request('/admin/config/FLUX_PER_REQUEST', {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 15 }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ key: 'FLUX_PER_REQUEST', value: 15, updated: true })
      expect(configKV.set).toHaveBeenCalledWith('FLUX_PER_REQUEST', 15)
    })
  })

  describe('pOST /admin/flux/grant', () => {
    it('should grant flux to a user', async () => {
      const billingService = createMockBillingService({
        creditFlux: vi.fn(async () => ({ balanceBefore: 50, balanceAfter: 150 })),
      })
      const app = createTestApp(undefined, billingService)

      const res = await app.request('/admin/flux/grant', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user-1', amount: 100, description: 'Test grant' }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({
        userId: 'user-1',
        amount: 100,
        balanceBefore: 50,
        balanceAfter: 150,
      })
      expect(billingService.creditFlux).toHaveBeenCalledWith({
        userId: 'user-1',
        amount: 100,
        description: 'Test grant',
        source: 'admin.grant',
      })
    })

    it('should reject invalid input (missing userId)', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/flux/grant', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 100, description: 'No user' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('INVALID_REQUEST')
    })

    it('should reject invalid input (non-integer amount)', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/flux/grant', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user-1', amount: 3.5, description: 'Bad amount' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('INVALID_REQUEST')
    })

    it('should reject invalid input (zero amount)', async () => {
      const app = createTestApp()

      const res = await app.request('/admin/flux/grant', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user-1', amount: 0, description: 'Zero' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('INVALID_REQUEST')
    })
  })
})
