// Kode spark dari Pikat — sisi browser (28 Sep 2026).
// Alur: tarik (server menulis pikat_spark_inbox) → pratinjau tiap kode baru
// (tt_video_info_get, read-only) → tim Ads mencentang → ikat lewat bindSparkNow
// (baris approval bersumber PIKAT + read-back + Log Optimasi, kill switch berlaku).
import { supabase } from '../lib/supabase'
import { postJson as post } from '../lib/apiClient'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { fetchSparkInfo, bindSparkNow } from './gmvmaxSpark'

// Status yang masih menunggu keputusan tim Ads (tampil di tab utama).
export const OPEN_STATUSES = ['NEW', 'READY', 'INVALID', 'MISMATCH', 'FAILED']

const wsOrThrow = () => {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  return wsId
}

// Kolom non-rahasia saja — token tak di-grant ke browser (0064).
export async function getPikatLink() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return null
  const { data, error } = await supabase.from('pikat_links')
    .select('workspace_id, token_hint, pikat_workspace_name, connected_at, last_pulled_at, last_error')
    .eq('workspace_id', wsId).maybeSingle()
  if (error) throw error
  return data
}

export const connectPikat = (token) => post('/api/pikat/spark-codes', { workspace_id: wsOrThrow(), action: 'connect', token })
export const disconnectPikat = () => post('/api/pikat/spark-codes', { workspace_id: wsOrThrow(), action: 'disconnect' })
export const pullPikat = () => post('/api/pikat/spark-codes', { workspace_id: wsOrThrow(), action: 'pull' })
// Kirim status kotak masuk ke Pikat (Spark Center). Dihitung server dari database.
export const reportPikat = () => post('/api/pikat/spark-codes', { workspace_id: wsOrThrow(), action: 'report' })

// Kinerja iklan 7 snapshot terakhir untuk video di kotak masuk — video affiliate
// sering SUDAH dipakai GMV Max lewat izin afiliasi sebelum kodenya diikat.
export async function loadAdsStats(videoIds) {
  const wsId = wsOrThrow()
  const ids = [...new Set(videoIds.map(String))]
  const out = new Map()
  if (!ids.length) return out
  const { data: imps, error: e1 } = await supabase.from('gmvmax_imports')
    .select('id').eq('workspace_id', wsId).eq('is_current', true)
    .order('snapshot_date', { ascending: false, nullsFirst: false }).limit(7)
  if (e1) throw e1
  if (!imps?.length) return out
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('gmvmax_creatives')
      .select('video_id, cost, gross_revenue, auth_type')
      .in('import_id', imps.map(x => x.id)).in('video_id', ids.slice(i, i + 100))
      .eq('creative_type', 'Video').limit(5000)
    if (error) throw error
    for (const c of data || []) {
      const k = String(c.video_id)
      const o = out.get(k) || { cost: 0, revenue: 0, authTypes: new Set() }
      o.cost += Number(c.cost) || 0
      o.revenue += Number(c.gross_revenue) || 0
      if (c.auth_type) o.authTypes.add(c.auth_type)
      out.set(k, o)
    }
  }
  return out
}

export async function listInbox() {
  const { data, error } = await supabase.from('pikat_spark_inbox')
    .select('*').eq('workspace_id', wsOrThrow())
    .order('recorded_at', { ascending: false, nullsFirst: false })
    .limit(500)
  if (error) throw error
  return data || []
}

// Video yang sudah terikat menurut potret spark_auth terbaru dari worker —
// menangkap ikatan yang dibuat di luar kotak ini (tempel manual / Ads Manager).
export async function loadBoundVideoIds() {
  const wsId = wsOrThrow()
  const { data: last } = await supabase.from('gmvmax_spark_auth')
    .select('snapshot_date').eq('workspace_id', wsId)
    .order('snapshot_date', { ascending: false }).limit(1).maybeSingle()
  if (!last?.snapshot_date) return new Set()
  const { data } = await supabase.from('gmvmax_spark_auth')
    .select('item_id, ad_auth_status').eq('workspace_id', wsId).eq('snapshot_date', last.snapshot_date)
    .limit(5000)
  return new Set((data || []).filter(r => r.ad_auth_status !== 'EXPIRED').map(r => String(r.item_id)))
}

async function patchRow(id, patch) {
  const { error } = await supabase.from('pikat_spark_inbox')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('workspace_id', wsOrThrow())
  if (error) throw error
}

const pickItemId = (info) => info?.item_id || info?.item_info?.item_id || info?.video_info?.item_id || null
const pickTitle = (info) => info?.text || info?.item_info?.text || info?.video_info?.title || info?.title || ''
const pickAuthor = (info) => info?.user_name || info?.item_info?.user_name || info?.author_name || ''

// Keputusan pratinjau — murni, supaya aturannya teruji tanpa TikTok.
export function judgePreview(row, info, error, boundIds) {
  if (boundIds?.has(String(row.video_id))) return { status: 'ALREADY', preview: { note: 'sudah terikat ke ad account' } }
  if (error) return { status: 'INVALID', preview: { error: String(error).slice(0, 200) } }
  const itemId = pickItemId(info)
  const preview = { item_id: itemId, title: pickTitle(info).slice(0, 200), author: pickAuthor(info) }
  // TikTok tak selalu mengembalikan item_id pada info — tanpa itu tak bisa
  // dibuktikan beda, jadi dianggap cocok (sama dengan jalur tempel manual).
  if (itemId && String(itemId) !== String(row.video_id)) return { status: 'MISMATCH', preview }
  return { status: 'READY', preview }
}

// Pratinjau satu baris NEW lalu simpan hasilnya. Read-only terhadap TikTok.
export async function previewRow(row, boundIds) {
  let info = null, err = null
  if (!boundIds?.has(String(row.video_id))) {
    try { info = await fetchSparkInfo(row.spark_code) } catch (e) { err = e.message || String(e) }
  }
  const verdict = judgePreview(row, info, err, boundIds)
  await patchRow(row.id, verdict)
  return { ...row, ...verdict }
}

export async function bindRow(row) {
  const { data: userRes } = await supabase.auth.getUser()
  const decided = { decided_by: userRes?.user?.id ?? null, decided_at: new Date().toISOString() }
  try {
    const r = await bindSparkNow({
      authCode: row.spark_code,
      videoId: row.video_id,
      videoTitle: row.preview?.title || row.label || '',
      author: row.preview?.author || row.tiktok_username || '',
      source: 'PIKAT',
      reason: `Kode dari Pikat (${row.source || 'kreator'}${row.label ? ` · ${row.label}` : ''}) — @${row.tiktok_username || '?'}`,
    })
    await patchRow(row.id, { status: 'BOUND', approval_id: r?.approval_id ?? null, ...decided })
    return { ok: true, verified: r?.read_back?.verified === true }
  } catch (e) {
    await patchRow(row.id, { status: 'FAILED', preview: { ...(row.preview || {}), error: String(e.message || e).slice(0, 200) }, ...decided })
      .catch(() => {})
    return { ok: false, error: e.message || String(e) }
  }
}

export async function dismissRows(ids) {
  const { data: userRes } = await supabase.auth.getUser()
  const { error } = await supabase.from('pikat_spark_inbox')
    .update({ status: 'DISMISSED', decided_by: userRes?.user?.id ?? null, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in('id', ids).eq('workspace_id', wsOrThrow())
  if (error) throw error
}
