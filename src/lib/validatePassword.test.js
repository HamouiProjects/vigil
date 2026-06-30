import { describe, it, expect } from 'vitest'
import { validatePassword } from './validatePassword.js'

describe('validatePassword (mirrors the Supabase server policy)', () => {
  it('rejects anything under 8 characters first', () => {
    expect(validatePassword('')).toMatch(/at least 8/)
    expect(validatePassword('Ab1')).toMatch(/at least 8/)
  })

  it('requires a lowercase letter', () => {
    expect(validatePassword('ALLUPPER1')).toMatch(/lowercase/)
  })

  it('requires an uppercase letter', () => {
    expect(validatePassword('alllower123')).toMatch(/uppercase/)
  })

  it('requires a digit', () => {
    expect(validatePassword('NoDigitsHere')).toMatch(/number/)
  })

  it('accepts a compliant password', () => {
    expect(validatePassword('ValidPass1')).toBe(null)
  })
})
