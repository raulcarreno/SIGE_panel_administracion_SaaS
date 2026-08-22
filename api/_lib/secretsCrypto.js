import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const SALT = 'sige-panel-secrets-v1'

function getKey() {
  const secret = process.env.PANEL_SECRETS_KEY?.trim()
  if (!secret) {
    throw new Error('Missing PANEL_SECRETS_KEY for token encryption.')
  }
  return scryptSync(secret, SALT, 32)
}

export function encryptSecret(plainText) {
  if (!plainText?.trim()) return ''
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decryptSecret(encoded) {
  if (!encoded?.trim()) return ''
  const key = getKey()
  const buffer = Buffer.from(encoded, 'base64')
  const iv = buffer.subarray(0, IV_LENGTH)
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const data = buffer.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  return decrypted
}
