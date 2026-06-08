// Single source of truth for password rules (mirrors the Supabase server policy:
// min 8 + lowercase + uppercase + digit). Used by signup and the anon->Pro upgrade.
export function validatePassword(pw) {
  if ((pw || '').length < 8) return 'Password must be at least 8 characters'
  if (!/[a-z]/.test(pw))     return 'Password must include a lowercase letter'
  if (!/[A-Z]/.test(pw))     return 'Password must include an uppercase letter'
  if (!/[0-9]/.test(pw))     return 'Password must include a number'
  return null
}
