import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isTenantActive, getTenantLifecycleStatus } from '../../api/_lib/tenantHelpers.js'

describe('tenantHelpers', () => {
  it('detects suspended tenant as inactive', () => {
    const config = { suspendedAt: '2026-01-01T00:00:00.000Z' }
    assert.equal(isTenantActive(config), false)
    assert.equal(getTenantLifecycleStatus(config), 'suspended')
  })

  it('detects expired tenant', () => {
    const config = {
      validUntil: '2020-01-01T00:00:00.000Z',
    }
    assert.equal(isTenantActive(config), false)
    assert.equal(getTenantLifecycleStatus(config), 'expired')
  })

  it('detects active tenant', () => {
    const config = {
      validFrom: '2020-01-01T00:00:00.000Z',
      validUntil: '2099-01-01T00:00:00.000Z',
    }
    assert.equal(isTenantActive(config), true)
    assert.equal(getTenantLifecycleStatus(config), 'active')
  })
})
