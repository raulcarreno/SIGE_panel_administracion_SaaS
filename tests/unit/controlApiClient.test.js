import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { controlApiRequest } from '../../api/_lib/controlApiClient.js'

describe('controlApiClient', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sends bearer authorization header', async () => {
    let capturedHeaders
    globalThis.fetch = async (_url, options) => {
      capturedHeaders = options.headers
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ tenantSlug: 'demo' }),
      }
    }

    const result = await controlApiRequest({
      baseUrl: 'https://demo.example.com',
      token: 'token-123',
      path: '/api/control/status',
    })

    assert.equal(capturedHeaders.Authorization, 'Bearer token-123')
    assert.equal(result.tenantSlug, 'demo')
  })

  it('maps unauthorized responses to CONTROL_UNAUTHORIZED', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'Unauthorized' }),
    })

    await assert.rejects(
      () =>
        controlApiRequest({
          baseUrl: 'https://demo.example.com',
          token: 'bad',
          path: '/api/control/status',
        }),
      (error) => {
        assert.equal(error.code, 'CONTROL_UNAUTHORIZED')
        return true
      },
    )
  })
})
