import { supabase } from '../lib/supabase.js'

export async function loadSubscription(uid) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, add_ons, status')
    .eq('user_id', uid)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { plan: data.plan, addOns: data.add_ons ?? [], status: data.status ?? null }
}
