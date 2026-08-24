import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_WEB_PRESENTATION_PATTERNS,
  evaluateTenantPathDiff,
  isPresentationPath,
  matchesPresentationPattern,
} from '../../api/_lib/tenantPathGuard.js'

describe('tenantPathGuard', () => {
  it('matches presentation globs', () => {
    assert.equal(matchesPresentationPattern('src/styles/a.css', 'src/styles/**'), true)
    assert.equal(matchesPresentationPattern('src/hooks/useChat.js', 'src/styles/**'), false)
    assert.equal(
      isPresentationPath('src/config/stockImages.js', DEFAULT_WEB_PRESENTATION_PATTERNS),
      true,
    )
    assert.equal(isPresentationPath('src/App.jsx', DEFAULT_WEB_PRESENTATION_PATTERNS), false)
  })

  it('rejects any ERP divergence', () => {
    const result = evaluateTenantPathDiff('erp', ['src/styles/master.css'])
    assert.equal(result.ok, false)
    assert.deepEqual(result.forbidden, ['src/styles/master.css'])
  })

  it('allows empty ERP diff', () => {
    assert.equal(evaluateTenantPathDiff('erp', []).ok, true)
  })

  it('allows only Web presentation paths', () => {
    assert.equal(
      evaluateTenantPathDiff('web', [
        'src/styles/x.css',
        'src/components/Hero.jsx',
        'public/logo.png',
      ]).ok,
      true,
    )
    const bad = evaluateTenantPathDiff('web', ['src/hooks/useChat.js', 'src/styles/x.css'])
    assert.equal(bad.ok, false)
    assert.deepEqual(bad.forbidden, ['src/hooks/useChat.js'])
  })
})
