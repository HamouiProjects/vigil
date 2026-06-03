// src/utils/theme.js — theme preference: 'system' | 'light' | 'dark'
// Source of truth = Supabase auth user_metadata.theme; localStorage is a first-paint cache only.
import { supabase } from '../lib/supabase.js'

const KEY = 'vigil_theme'
const VALID = ['system', 'light', 'dark']
let mql = null
let onSystemChange = null

export function getThemePref() {
  try { const v = localStorage.getItem(KEY); return VALID.includes(v) ? v : 'system' } catch { return 'system' }
}

function resolve(pref) {
  if (pref === 'light' || pref === 'dark') return pref
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
}

function applyResolved(pref) {
  document.documentElement.setAttribute('data-theme', resolve(pref))
}

function ensureSystemListener(pref) {
  if (!window.matchMedia) return
  if (!mql) mql = window.matchMedia('(prefers-color-scheme: dark)')
  if (onSystemChange) { mql.removeEventListener('change', onSystemChange); onSystemChange = null }
  if (pref === 'system') {
    onSystemChange = () => applyResolved('system')
    mql.addEventListener('change', onSystemChange)
  }
}

// Called once at startup (the inline boot script in index.html already set an initial data-theme).
export function initTheme() {
  const pref = getThemePref()
  applyResolved(pref)
  ensureSystemListener(pref)
}

// Setter: persist locally + apply + (optionally) write to the account.
export function setThemePref(pref, { persistRemote = true } = {}) {
  if (!VALID.includes(pref)) pref = 'system'
  try { localStorage.setItem(KEY, pref) } catch {}
  applyResolved(pref)
  ensureSystemListener(pref)
  if (persistRemote) { supabase.auth.updateUser({ data: { theme: pref } }).catch(() => {}) }
  return pref
}

// After the session loads, reconcile the account's saved pref (account = source of truth).
export function reconcileRemotePref(remotePref) {
  if (!VALID.includes(remotePref)) return
  if (remotePref !== getThemePref()) {
    try { localStorage.setItem(KEY, remotePref) } catch {}
    applyResolved(remotePref)
    ensureSystemListener(remotePref)
  }
}
