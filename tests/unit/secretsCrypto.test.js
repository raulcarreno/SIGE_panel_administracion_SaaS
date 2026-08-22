import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { encryptSecret, decryptSecret } from '../../api/_lib/secretsCrypto.js'

describe('secretsCrypto', () => {
  const originalKey = process.env.PANEL_SECRETS_KEY

  before(() => {
    process.env.PANEL_SECRETS_KEY = 'test-panel-secrets-key-32chars!!'
  })

  after(() => {
    process.env.PANEL_SECRETS_KEY = originalKey
  })

  it('encrypts and decrypts control tokens', () => {
    const plain = 'super-secret-control-token'
    const encrypted = encryptSecret(plain)
    assert.notEqual(encrypted, plain)
    assert.equal(decryptSecret(encrypted), plain)
  })
})
