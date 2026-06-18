// Lapisan data workspaces — Supabase (tabel public.workspaces).
// Menggantikan penyimpanan workspace di localStorage. RLS membatasi tiap user
// hanya melihat workspace miliknya (user_id = auth.uid()).
import { supabase } from '../lib/supabase'
import { colorForId } from '../utils/workspace'

// Bentuk row Supabase → bentuk yang dipakai UI ({id, name, color, createdAt}).
function mapRow(r) {
  return {
    id: r.id,
    name: r.name,
    color: r.color || colorForId(r.id),
    createdAt: r.created_at,
  }
}

// True bila error karena kolom `color` belum ada (migration 0002 belum jalan).
function isMissingColorColumn(error) {
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    /color/i.test(error?.message || '') && /column|does not exist|schema cache/i.test(error?.message || '')
  )
}

export async function listWorkspaces() {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map(mapRow)
}

export async function createWorkspace({ name, color }) {
  const { data: au } = await supabase.auth.getUser()
  const uid = au?.user?.id
  if (!uid) throw new Error('Sesi tidak ditemukan. Coba login ulang.')

  const base = { user_id: uid, name: (name || '').trim() || 'Workspace Baru' }

  // Sertakan `color` bila kolomnya ada; bila belum (0002 belum dijalankan),
  // ulangi insert tanpa color agar pembuatan workspace tetap berhasil.
  let res = await supabase
    .from('workspaces')
    .insert({ ...base, color: color || null })
    .select('*')
    .single()
  if (res.error && isMissingColorColumn(res.error)) {
    res = await supabase.from('workspaces').insert(base).select('*').single()
  }
  if (res.error) throw res.error
  return mapRow(res.data)
}

export async function deleteWorkspace(id) {
  // Periods & products ikut terhapus via ON DELETE CASCADE di skema.
  const { error } = await supabase.from('workspaces').delete().eq('id', id)
  if (error) throw error
}
