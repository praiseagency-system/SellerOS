// Riwayat thread AI Assistant — Supabase langsung dari browser (tabel
// public.ai_conversations, migrasi 0059). RLS menjamin hanya thread milik user
// ini di workspace yang ia anggotai yang terbaca. Pengiriman pesan sendiri lewat
// fungsi serverless api/assistant/chat (butuh kunci model).
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { normalizeTitle, sanitizeMessages } from '../utils/assistantThread'

const META = 'id, title, updated_at'

export async function listThreads() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return []
  const { data, error } = await supabase
    .from('ai_conversations').select(META).eq('workspace_id', wsId)
    .order('updated_at', { ascending: false }).limit(50)
  if (error) throw error
  return (data || []).map(r => ({ id: r.id, title: r.title, updatedAt: r.updated_at }))
}

/** Thread terbaru (dibuka saat panel pertama dimuat). null bila belum ada. */
export async function latestThread() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return null
  const { data, error } = await supabase
    .from('ai_conversations').select(`${META}, messages`).eq('workspace_id', wsId)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data ? { id: data.id, title: data.title, messages: sanitizeMessages(data.messages) } : null
}

export async function getThread(id) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return null
  const { data, error } = await supabase
    .from('ai_conversations').select(`${META}, messages`).eq('workspace_id', wsId).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? { id: data.id, title: data.title, messages: sanitizeMessages(data.messages) } : null
}

/** Ganti nama. updated_at SENGAJA tidak disentuh (tak ada trigger) supaya urutan sidebar tak melompat. */
export async function renameThread(id, rawTitle) {
  const title = normalizeTitle(rawTitle)
  if (!title) return null
  const { data, error } = await supabase
    .from('ai_conversations').update({ title }).eq('id', id).select('title').maybeSingle()
  if (error) throw error
  return data?.title ?? null
}

export async function deleteThread(id) {
  const { error } = await supabase.from('ai_conversations').delete().eq('id', id)
  if (error) throw error
  return true
}
