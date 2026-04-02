import type { BillingService } from '../../services/billing/billing-service'
import type { ConfigKVService } from '../../services/config-kv'

import { Hono } from 'hono'
import { integer, minValue, number, object, pipe, safeParse, string } from 'valibot'

import { adminGuard } from '../../middlewares/admin-guard'
import { createBadRequestError } from '../../utils/error'

const FluxGrantSchema = object({
  userId: string(),
  amount: pipe(number(), integer(), minValue(1)),
  description: string(),
})

/**
 * Admin API routes for runtime config management and manual flux grants.
 * All routes require a valid admin API key via Bearer token.
 */
export function createAdminRoutes(
  configKV: ConfigKVService,
  billingService: BillingService,
  adminApiKey: string | undefined,
) {
  return new Hono()
    .use('*', adminGuard(adminApiKey))
    .get('/config', async (c) => {
      const keys = [
        'FLUX_PER_REQUEST',
        'INITIAL_USER_FLUX',
        'FLUX_PACKAGES',
        'FLUX_PER_1K_TOKENS',
        'FLUX_PER_1K_CHARS_TTS',
        'MIN_CHARGE_TTS',
        'MAX_CHECKOUT_AMOUNT_CENTS',
        'GATEWAY_BASE_URL',
        'DEFAULT_CHAT_MODEL',
        'DEFAULT_TTS_MODEL',
        'AUTH_RATE_LIMIT_MAX',
        'AUTH_RATE_LIMIT_WINDOW_SEC',
        'STRIPE_PAYMENT_METHODS',
        'STRIPE_PAYMENT_METHOD_OPTIONS',
      ] as const

      const entries: Record<string, unknown> = {}
      for (const key of keys) {
        entries[key] = await configKV.getOptional(key)
      }

      return c.json(entries)
    })
    .get('/config/:key', async (c) => {
      const key = c.req.param('key') as Parameters<ConfigKVService['getOptional']>[0]
      const value = await configKV.getOptional(key)
      return c.json({ key, value })
    })
    .put('/config/:key', async (c) => {
      const key = c.req.param('key') as Parameters<ConfigKVService['set']>[0]
      const body = await c.req.json()
      await configKV.set(key, body.value)
      return c.json({ key, value: body.value, updated: true })
    })
    .post('/flux/grant', async (c) => {
      const body = await c.req.json()
      const result = safeParse(FluxGrantSchema, body)

      if (!result.success) {
        throw createBadRequestError('Invalid grant request', 'INVALID_REQUEST', result.issues)
      }

      const { userId, amount, description } = result.output
      const creditResult = await billingService.creditFlux({
        userId,
        amount,
        description,
        source: 'admin.grant',
      })

      return c.json({
        userId,
        amount,
        balanceBefore: creditResult.balanceBefore,
        balanceAfter: creditResult.balanceAfter,
      })
    })
}
