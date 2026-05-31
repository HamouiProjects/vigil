import { supabase } from '../lib/supabase.js'

function rowToWorkspace(r) {
  return {
    id: r.local_id,
    name: r.name,
    widgets: Array.isArray(r.widgets) ? r.widgets : [],
    layout: Array.isArray(r.layout) ? r.layout : [],
  }
}

export async function loadWorkspaces(uid) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', uid)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []).map(rowToWorkspace)
}

export async function saveWorkspaces(uid, workspaces) {
  const rows = workspaces.map((ws, i) => ({
    user_id: uid,
    local_id: ws.id,
    name: ws.name,
    layout: ws.layout ?? [],
    widgets: ws.widgets ?? [],
    settings: {},
    position: i,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length) {
    const { error } = await supabase
      .from('workspaces')
      .upsert(rows, { onConflict: 'user_id,local_id' })
    if (error) throw error
  }

  const { data: existing, error: selErr } = await supabase
    .from('workspaces')
    .select('local_id')
    .eq('user_id', uid)
  if (selErr) throw selErr

  const currentIds = new Set(workspaces.map(ws => ws.id))
  const removed = (existing ?? []).map(r => r.local_id).filter(id => !currentIds.has(id))
  if (removed.length) {
    const { error: delErr } = await supabase
      .from('workspaces')
      .delete()
      .eq('user_id', uid)
      .in('local_id', removed)
    if (delErr) throw delErr
  }
}
