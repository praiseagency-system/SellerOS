// Kode spark dari Pikat — sisi browser (28 Sep 2026).
// Alur: tarik (server menulis pikat_spark_inbox) → pratinjau tiap kode baru
// (tt_video_info_get, read-only) → tim Ads mencentang → ikat lewat bindSparkNow
// (baris approval bersumber PIKAT + read-back + Log Optimasi, kill switch berlaku).
import { supabase } from '../lib/supabase'
import { postJson as post } from '../lib/apiClient'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { fetchSparkInfo, proposeSparkBind } from './gmvmaxSpark'

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
// Panen kode ad account + permintaan kode (F3/F4) — panggilan terpisah dari tarikan.
export const PIKAT_HARVEST_EVENT = 'pikat:harvested'
export async function harvestPikat() {
  const r = await post('/api/pikat/spark-codes', { workspace_id: wsOrThrow(), action: 'harvest' })
  // Pipeline boost ikut diubah server (status Pikat, Kode tersedia, Terpasang) → segarkan.
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PIKAT_HARVEST_EVENT, { detail: r }))
  return r
}

// Kinerja iklan 7 snapshot terakhir untuk video di kotak masuk — video affiliate
// sering SUDAH dipakai GMV Max lewat izin afiliasi sebelum kodenya diikat.
export async function loadAdsStats(videoIds) {
  const wsId = wsOrThrow()
  const ids = [...new Set(videoIds.map(String))]
  const out = new Map()
  if (!ids.length) return out
  const { data: imps, error: e1 } = await supabase.from('gmvmax_imports')
    .select('id, snapshot_date').eq('workspace_id', wsId).eq('is_current', true)
    .order('snapshot_date', { ascending: false, nullsFirst: false }).limit(7)
  if (e1) throw e1
  if (!imps?.length) return out
  // Urutan snapshot (0 = terbaru) — status tayang diambil dari snapshot paling baru.
  const urutan = new Map(imps.map((x, i) => [x.id, i]))
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('gmvmax_creatives')
      .select('import_id, video_id, cost, gross_revenue, sku_orders, status, auth_type')
      .in('import_id', imps.map(x => x.id)).in('video_id', ids.slice(i, i + 100))
      .eq('creative_type', 'Video').limit(5000)
    if (error) throw error
    for (const c of data || []) {
      const k = String(c.video_id)
      const o = out.get(k) || { cost: 0, revenue: 0, orders: 0, authTypes: new Set(), status: null, statusRank: Infinity }
      o.cost += Number(c.cost) || 0
      o.revenue += Number(c.gross_revenue) || 0
      o.orders += Number(c.sku_orders) || 0
      if (c.auth_type) o.authTypes.add(c.auth_type)
      const rank = urutan.get(c.import_id) ?? Infinity
      if (c.status && rank < o.statusRank) { o.status = c.status; o.statusRank = rank }
      out.set(k, o)
    }
  }
  return out
}

export async function listInbox() {
  const { data, error } = await supabase.from('pikat_spark_inbox')
    .select('*').eq('workspace_id', wsOrThrow())
    .order('recorded_at', { ascending: false, nullsFirst: false })
    .limit(1000)                                   // = batas tarikan & batas PostgREST
  if (error) throw error
  return syncWithApprovals(data || [])
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

// Ajukan ikatan ke 🔔 (approval PENDING bersumber PIKAT). Baris tetap READY dengan
// approval_id terisi = "menunggu di lonceng"; syncWithApprovals yang memindahkannya
// ke BOUND/FAILED setelah approval diputuskan & dieksekusi di 🔔.
export async function bindRow(row) {
  const { data: userRes } = await supabase.auth.getUser()
  try {
    const ap = await proposeSparkBind({
      authCode: row.spark_code,
      videoId: row.video_id,
      videoTitle: row.preview?.title || row.label || '',
      author: row.preview?.author || row.tiktok_username || '',
      reason: `Kode dari Pikat (${row.source || 'kreator'}${row.label ? ` · ${row.label}` : ''}) — @${row.tiktok_username || '?'}`,
    })
    await patchRow(row.id, { approval_id: ap.id, decided_by: userRes?.user?.id ?? null, decided_at: new Date().toISOString() })
    return { ok: true, queued: true }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

// Keputusan 🔔 → status kotak masuk. Murni, supaya aturannya teruji.
export function statusFromApproval(ap) {
  if (!ap) return { approval_id: null }                       // approval hilang → ajukan ulang
  if (ap.status === 'EXECUTED') return { status: 'BOUND' }
  if (ap.status === 'FAILED') return { status: 'FAILED', preview_error: ap.execution_result?.error || 'eksekusi gagal' }
  if (ap.status === 'REJECTED' || ap.status === 'EXPIRED') return { approval_id: null }
  return null                                                  // PENDING / APPROVED: masih berjalan
}

// Samakan baris "menunggu di lonceng" dengan status approval-nya.
export async function syncWithApprovals(rows) {
  const tunggu = rows.filter(r => r.approval_id && r.status === 'READY')
  if (!tunggu.length) return rows
  const { data, error } = await supabase.from('gmvmax_approvals')
    .select('id, status, execution_result').eq('workspace_id', wsOrThrow())
    .in('id', tunggu.map(r => r.approval_id))
  if (error) return rows
  const apOf = new Map((data || []).map(a => [a.id, a]))
  const out = new Map()
  for (const r of tunggu) {
    const ubah = statusFromApproval(apOf.get(r.approval_id))
    if (!ubah) continue
    const { preview_error, ...patch } = ubah
    if (preview_error) patch.preview = { ...(r.preview || {}), error: String(preview_error).slice(0, 200) }
    await patchRow(r.id, patch).catch(() => {})
    out.set(r.id, { ...r, ...patch })
  }
  return rows.map(r => out.get(r.id) || r)
}

export async function dismissRows(ids) {
  const { data: userRes } = await supabase.auth.getUser()
  const { error } = await supabase.from('pikat_spark_inbox')
    .update({ status: 'DISMISSED', decided_by: userRes?.user?.id ?? null, decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in('id', ids).eq('workspace_id', wsOrThrow())
  if (error) throw error
}
