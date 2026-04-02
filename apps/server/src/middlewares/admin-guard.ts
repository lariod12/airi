import type { MiddlewareHandler } from 'hono'

import { createForbiddenError, createServiceUnavailableError, createUnauthorizedError } from '../utils/error'

const BEARER_PREFIX_RE = /^Bearer\s+/i

/**
 * Middleware that validates a shared admin API key via Bearer token.
 * Returns 503 if no admin key is configured (admin API disabled).
 */
export function adminGuard(adminApiKey: string | undefined): MiddlewareHandler {
  return async (c, next) => {
    if (!adminApiKey) {
      throw createServiceUnavailableError('Admin API is not configured', 'ADMIN_NOT_CONFIGURED')
    }

    const authHeader = c.req.header('Authorization')
    if (!authHeader) {
      throw createUnauthorizedError('Missing Authorization header')
    }

    const token = authHeader.replace(BEARER_PREFIX_RE, '')
    if (token !== adminApiKey) {
      throw createForbiddenError('Invalid admin API key')
    }

    await next()
  }
}
