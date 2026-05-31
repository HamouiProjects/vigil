import { supabase } from '../lib/supabase.js'

export async function ensureSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  if (session?.user?.id) return session.user.id

  const { data, error: signErr } = await supabase.auth.signInAnonymously()
  if (signErr) throw signErr
  if (!data.user?.id) throw new Error('Anonymous sign-in failed')
  return data.user.id
}
