import { supabase } from '../lib/supabase.js'

export async function listSources(uid) {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createSource(uid, { type, identifier, label, meta }) {
  const { data, error } = await supabase
    .from('sources')
    .upsert(
      { user_id: uid, type, identifier, label, meta: meta ?? {} },
      { onConflict: 'user_id,type,identifier', ignoreDuplicates: false },
    )
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteSource(uid, id) {
  const { error } = await supabase
    .from('sources')
    .delete()
    .eq('user_id', uid)
    .eq('id', id)
  if (error) throw error
}
