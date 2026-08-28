// Campaign Control (Execute Layer E3) — budget / Target ROI / pause-aktifkan.
// SEMUA aksi lewat antrean 🔔 (beda dgn spark yang langsung): nilai uangnya
// besar, jadi ajukan → tinjau kartu (before→after + alasan) → Setujui → eksekusi
// campaign_gmv_max_update / campaign_status_update → read-back info_get.
// Pagar di sini (bukan cuma UI): bounds % kenaikan budget + cooldown per campaign.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { getConnection } from './tiktokConnection'
import { addActionLog } from './gmvmaxActionLog'
import { createApproval, getExecutionSettings } from './gmvmaxApprovals'

async function requireConn() {
  const conn = await getConnection()
  if (!conn?.access_token) throw new Error('TikTok Ads belum tersambung untuk workspace ini.')
  if (!conn?.advertiser_id) throw new Error('Advertiser belum dipilih (Pengaturan → Integrasi).')
  return conn
}

// Cooldown: adakah aksi campaign yang SUDAH dieksekusi/disetujui dalam N menit
// terakhir untuk campaign yang sama? (PENDING tak dihitung — belum terjadi.)
async function assertCooldown(campaignId, settings) {
  const wsId = getCurrentWorkspaceId()
  const mins = settings.cooldown_minutes ?? 360
  if (!mins) return
  const since = new Date(Date.now() - mins * 60_000).toISOString()
  const { data, error } = await supabase.from('gmvmax_approvals')
    .select('id, action_type, decided_at')
    .eq('workspace_id', wsId)
    .in('action_type', ['BUDGET_UPDATE', 'ROI_UPDATE', 'STATUS_UPDATE'])
    .in('status', ['APPROVED', 'EXECUTED'])
    .eq('target->>campaign_id', String(campaignId))
    .gte('decided_at', since)
    .limit(1)
  if (error) throw error
  if (data?.length) {
    const last = new Date(data[0].decided_at)
    const readyAt = new Date(last.getTime() + mins * 60_000)
    throw new Error(`Cooldown aktif untuk campaign ini — aksi terakhir ${last.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}, bisa lagi ${readyAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.`)
  }
}

// Ajukan ubah budget harian. Bound: kenaikan ≤ max_budget_increase_pct.
export async function requestBudgetChange({ campaignId, campaignName, currentBudget, newBudget, reason = null, evidence = null }) {
  const settings = await getExecutionSettings()
  const cur = Number(currentBudget) || 0
  const next = Number(newBudget)
  if (!Number.isFinite(next) || next <= 0) throw new Error('Budget baru tidak valid.')
  const maxPct = settings.max_budget_increase_pct ?? 50
  if (cur > 0 && next > cur * (1 + maxPct / 100)) {
    throw new Error(`Kenaikan melebihi batas ${maxPct}%/hari (maks ${Math.floor(cur * (1 + maxPct / 100)).toLocaleString('id-ID')}). Ubah batas di Pengaturan → Eksekusi bila memang perlu.`)
  }
  await assertCooldown(campaignId, settings)
  return createApproval({
    actionType: 'BUDGET_UPDATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { budget: cur },
    proposedValue: { budget: next },
    reason, evidence,
    source: 'MANUAL', risk: next > cur ? 'MEDIUM' : 'LOW',
  })
}

// Ajukan ubah Target ROI (roas_bid, maks 1 desimal — aturan API).
export async function requestRoiChange({ campaignId, campaignName, currentRoi, newRoi, reason = null, evidence = null }) {
  const settings = await getExecutionSettings()
  const next = Math.round(Number(newRoi) * 10) / 10
  if (!Number.isFinite(next) || next <= 0) throw new Error('Target ROI baru tidak valid.')
  await assertCooldown(campaignId, settings)
  return createApproval({
    actionType: 'ROI_UPDATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { roas_bid: currentRoi != null ? Number(currentRoi) : null },
    proposedValue: { roas_bid: next },
    reason, evidence,
    // Menurunkan target = melonggarkan delivery = spend naik → MEDIUM.
    source: 'MANUAL', risk: currentRoi != null && next < Number(currentRoi) ? 'MEDIUM' : 'LOW',
  })
}

// Katalog produk eligible GMV Max toko ini (utk dialog kelola produk).
// gmv_max_ads_status: UNOCCUPIED = bisa ditambah; OCCUPIED = dipakai campaign lain.
export async function fetchStoreProducts() {
  const conn = await requireConn()
  if (!conn.store_id) throw new Error('store_id koneksi kosong — cek Pengaturan → Integrasi.')
  const r = await post('/api/gmvmax/tt-video', {
    access_token: conn.access_token, advertiser_id: conn.advertiser_id,
    op: 'store_products', store_id: conn.store_id,
  })
  return r.products || []
}

// Ajukan ubah daftar produk campaign. API menerima daftar LENGKAP baru —
// delta (± produk) disimpan di approval supaya kartunya bisa menampilkan
// perubahan, bukan 2 daftar panjang.
export async function requestProductsChange({ campaignId, campaignName, currentIds = [], newIds = [], addedNames = [], removedNames = [], reason = null }) {
  const cur = [...new Set(currentIds.map(String))]
  const next = [...new Set(newIds.map(String))]
  if (next.length === 0) throw new Error('Minimal 1 produk — untuk mematikan campaign gunakan Pause.')
  if (next.length > 400) throw new Error('Maksimal 400 produk per campaign (aturan API).')
  const same = cur.length === next.length && [...cur].sort().every((v, i) => v === [...next].sort()[i])
  if (same) throw new Error('Tidak ada perubahan produk.')
  const settings = await getExecutionSettings()
  await assertCooldown(campaignId, settings)
  const removed = cur.filter(id => !next.includes(id))
  return createApproval({
    actionType: 'PRODUCTS_UPDATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { produk: cur.length },
    proposedValue: { produk: next.length, item_group_ids: next },
    reason,
    evidence: {
      ditambah: addedNames.length ? addedNames : next.filter(id => !cur.includes(id)),
      dicabut: removedNames.length ? removedNames : removed,
    },
    source: 'MANUAL',
    // Mencabut produk menghentikan iklan produk itu di campaign — risiko lebih tinggi.
    risk: removed.length ? 'MEDIUM' : 'LOW',
  })
}

// Ajukan pause/aktifkan. DELETE sengaja TIDAK pernah tersedia.
export async function requestStatusChange({ campaignId, campaignName, currentStatus, newStatus, reason = null }) {
  if (!['ENABLE', 'DISABLE'].includes(newStatus)) throw new Error('Status hanya boleh ENABLE/DISABLE.')
  const settings = await getExecutionSettings()
  await assertCooldown(campaignId, settings)
  return createApproval({
    actionType: 'STATUS_UPDATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { operation_status: currentStatus || null },
    proposedValue: { operation_status: newStatus },
    reason,
    source: 'MANUAL', risk: newStatus === 'DISABLE' ? 'MEDIUM' : 'LOW',
  })
}

// Ajukan exclude (REMOVE) / pulihkan (ADD) satu video dari rotasi campaign.
// TANPA cooldown campaign (aksi level creative, bukan setting). Evidence angka
// video ikut kartu 🔔. spuId wajib utk campaign Product (aturan API).
export async function requestCreativeExclude({ campaignId, campaignName, videoId, videoTitle = '', tiktokAccount = '', spuId = null, mode = 'REMOVE', evidence = null, reason = null }) {
  if (!videoId) throw new Error('videoId wajib.')
  if (!['REMOVE', 'ADD'].includes(mode)) throw new Error('mode hanya REMOVE/ADD.')
  return createApproval({
    actionType: 'CREATIVE_EXCLUDE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName, video_id: String(videoId), video_title: videoTitle },
    currentValue: { rotasi: mode === 'REMOVE' ? 'ikut' : 'excluded' },
    proposedValue: {
      rotasi: mode === 'REMOVE' ? 'excluded' : 'ikut',
      action: mode,
      items: [{ item_id: String(videoId), spu_id_list: spuId ? [String(spuId)] : [] }],
    },
    reason: reason || (mode === 'REMOVE'
      ? `Keluarkan video @${tiktokAccount || '?'} dari rotasi ${campaignName}.`
      : `Pulihkan video @${tiktokAccount || '?'} ke rotasi ${campaignName}.`),
    evidence,
    source: 'MANUAL',
    risk: mode === 'REMOVE' ? 'MEDIUM' : 'LOW',
  })
}

// ── E4b: Sesi boost (Max Delivery / Creative Boost) ─────────────────────────
// Pagar best-practice resmi ditegakkan DI SINI: budget min ≈ US$10 (Rp160rb),
// jendela default 24 jam maks 72 jam, Creative Boost hanya utk video yang
// eligible (validasi status di UI; API menolak AUTH_NEEDED/EXCLUDED/dll).
// Batas bawah budget sesi per JENIS (IDR). Dok publik: US$10 utk keduanya,
// tapi Ads Manager memberlakukan minimum lokal yang berbeda per fitur —
// angka di bawah dikalibrasi dari UI Ads Manager (ubah di sini bila berubah).
// Status materi yang TIDAK bisa di-boost — API menolaknya karena kreatifnya
// belum/tak lagi bisa dipakai. Ditulis sebagai daftar-TOLAK supaya status baru
// otomatis boostable kecuali memang masuk sini. Creative Boost SENDIRI berlaku
// untuk video yang sudah Tayang & Learning, bukan hanya yang belum jalan.
export const BOOST_BLOCKED_STATUS = ['AUTHORIZATION_NEEDED', 'EXCLUDED', 'REJECTED', 'UNAVAILABLE']

export const SESSION_MIN_BUDGET_IDR = {
  MAX_DELIVERY: 100000,   // kalibrasi dari UI Ads Manager (user, 2026-08-26)
  CREATIVE_BOOST: 50000,  // idem
}
// API menerima "YYYY-MM-DD HH:MM:SS" dalam UTC+0 (tertulis eksplisit di skema
// session_create). Pengguna memilih waktu lokal; konversi terjadi di sini.
const toUtc = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
export const MAX_SESSION_HOURS = 72

// Batas jadwal sesi. ASIMETRIS, dan bukan pilihan kita:
//   Max Delivery  (NO_BID)          → schedule_start_time DIDUKUNG, boleh mulai nanti.
//   Creative Boost (CREATIVE_NO_BID) → skema menyebut SCHEDULE_START_END berarti
//     "antara WAKTU SEKARANG dan schedule_end_time". Start tak bisa dimundurkan;
//     hanya akhirnya yang bisa ditentukan.
export const SUPPORTS_START_TIME = { MAX_DELIVERY: true, CREATIVE_BOOST: false }

export async function requestBoostSession({
  kind, campaignId, campaignName, storeId, spuId, itemId = null, videoTitle = '',
  budget, hours = 24, startAt = null, endAt = null, reason = null, evidence = null,
}) {
  // kind: 'MAX_DELIVERY' | 'CREATIVE_BOOST'
  if (!['MAX_DELIVERY', 'CREATIVE_BOOST'].includes(kind)) throw new Error('kind tidak dikenal.')
  if (!spuId) throw new Error('SPU produk wajib.')
  if (kind === 'CREATIVE_BOOST' && !itemId) throw new Error('videoId wajib untuk Creative Boost.')
  const b = Number(budget)
  const minB = SESSION_MIN_BUDGET_IDR[kind]
  if (!Number.isFinite(b) || b < minB) throw new Error(`Budget ${kind === 'MAX_DELIVERY' ? 'Max Delivery' : 'Creative Boost'} minimal Rp ${minB.toLocaleString('id-ID')}/hari.`)

  const now = Date.now()

  // Waktu MULAI — hanya Max Delivery. Skema: "start time cannot be earlier than
  // the current time". Beri kelonggaran 2 menit supaya waktu yang dipilih tepat
  // "sekarang" tidak keburu basi saat approval disetujui.
  let startMs = null
  if (startAt != null && SUPPORTS_START_TIME[kind]) {
    startMs = startAt instanceof Date ? startAt.getTime() : Date.parse(startAt)
    if (!Number.isFinite(startMs)) throw new Error('Waktu mulai tidak terbaca.')
    if (startMs < now - 2 * 60 * 1000) throw new Error('Waktu mulai tidak boleh di masa lalu.')
    if (startMs <= now) startMs = null   // "sekarang" → biarkan API memakai default
  }

  // Waktu SELESAI — eksplisit bila diberikan, kalau tidak dihitung dari `hours`.
  const anchor = startMs ?? now
  let endMs
  if (endAt != null) {
    endMs = endAt instanceof Date ? endAt.getTime() : Date.parse(endAt)
    if (!Number.isFinite(endMs)) throw new Error('Waktu selesai tidak terbaca.')
  } else {
    endMs = anchor + Math.min(Math.max(Number(hours) || 24, 1), MAX_SESSION_HOURS) * 3600 * 1000
  }
  if (endMs <= anchor) throw new Error('Waktu selesai harus setelah waktu mulai.')
  const durasiJam = (endMs - anchor) / 3600000
  if (durasiJam > MAX_SESSION_HOURS) {
    throw new Error(`Jendela sesi maksimal ${MAX_SESSION_HOURS} jam (dipilih ${Math.round(durasiJam)} jam). Pagar ini milik kita sendiri, bukan TikTok — vonis eksperimen dinilai di H+3.`)
  }
  const h = Math.round(durasiJam * 10) / 10
  const end = toUtc(new Date(endMs))
  const settings = await getExecutionSettings()
  await assertCooldown(campaignId, settings)
  return createApproval({
    actionType: 'SESSION_CREATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName, video_id: itemId ? String(itemId) : null, video_title: videoTitle || null },
    currentValue: { sesi: 'tidak ada' },
    proposedValue: {
      sesi: kind, budget: b, jam: h,
      mulai: startMs ? new Date(startMs).toISOString() : 'sekarang',
      selesai: new Date(endMs).toISOString(),
      store_id: String(storeId),
      session: {
        bid_type: kind === 'MAX_DELIVERY' ? 'NO_BID' : 'CREATIVE_NO_BID',
        budget: b,
        product_list: [{ spu_id: String(spuId) }],
        schedule_type: 'SCHEDULE_START_END',
        schedule_end_time: end,
        // Hanya Max Delivery yang menerima start di masa depan (lihat SUPPORTS_START_TIME).
        ...(startMs ? { schedule_start_time: toUtc(new Date(startMs)) } : {}),
        ...(itemId ? { item_id: String(itemId) } : {}),
      },
    },
    reason: reason || (kind === 'MAX_DELIVERY'
      ? `Max Delivery ${h} jam utk 1 produk — prioritas volume di atas ROI (budget terpisah, tanpa ROI protection).`
      : `Creative Boost ${h} jam utk 1 video — beli data uji utk video yang belum diuji algoritma.`),
    evidence,
    source: 'MANUAL',
    risk: 'HIGH', // tanpa jaring ROI — selalu ditinjau sadar-sadar
  })
}

// Ajukan ubah sesi aktif: budget baru dan/atau perpanjang jendela (jam dari sekarang).
export async function requestSessionUpdate({ campaignId, campaignName, storeId, sessionId, kind, label = '', currentBudget = null, newBudget = null, extendHours = null }) {
  if (!sessionId) throw new Error('session_id wajib.')
  const patch = {}
  if (newBudget != null) {
    const b = Number(newBudget)
    const minB = SESSION_MIN_BUDGET_IDR[kind] ?? SESSION_MIN_BUDGET_IDR.CREATIVE_BOOST
    if (!Number.isFinite(b) || b < minB) throw new Error(`Budget minimal Rp ${minB.toLocaleString('id-ID')}/hari.`)
    patch.budget = b
  }
  if (extendHours != null) {
    const h = Math.min(Math.max(Number(extendHours) || 24, 1), 72)
    patch.schedule_type = 'SCHEDULE_START_END'
    patch.schedule_end_time = toUtc(new Date(Date.now() + h * 3600 * 1000))
  }
  if (!Object.keys(patch).length) throw new Error('Tidak ada perubahan.')
  return createApproval({
    actionType: 'SESSION_UPDATE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { sesi: label || sessionId, ...(currentBudget != null ? { budget: Number(currentBudget) } : {}) },
    proposedValue: { ...(patch.budget != null ? { budget: patch.budget } : {}), ...(patch.schedule_end_time ? { 's/d': patch.schedule_end_time } : {}), store_id: String(storeId), session_id: String(sessionId), session: patch },
    reason: 'Ubah sesi boost yang sedang berjalan.',
    source: 'MANUAL', risk: patch.budget != null && currentBudget != null && patch.budget > Number(currentBudget) ? 'HIGH' : 'MEDIUM',
  })
}

export async function requestSessionStop({ campaignId, campaignName, sessionId, label = '' }) {
  if (!sessionId) throw new Error('session_id wajib.')
  return createApproval({
    actionType: 'SESSION_DELETE',
    target: { campaign_id: String(campaignId), campaign_name: campaignName },
    currentValue: { sesi: label || sessionId },
    proposedValue: { sesi: 'dihentikan', session_id: String(sessionId) },
    reason: 'Hentikan sesi boost.',
    source: 'MANUAL', risk: 'LOW',
  })
}

// Daftar sesi aktif satu campaign (read-only, utk strip sesi di detail).
export async function fetchSessions(campaignId) {
  const conn = await requireConn()
  const r = await post('/api/gmvmax/tt-video', {
    access_token: conn.access_token, advertiser_id: conn.advertiser_id,
    op: 'session_list', campaign_id: String(campaignId),
  })
  return r.sessions || []
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let j
  try { j = JSON.parse(text) } catch { throw new Error(`balasan non-JSON (${res.status})`) }
  if (!res.ok || j.error) { const e = new Error(j.error_description || j.error || `gagal (${res.status})`); e.payload = j; throw e }
  return j
}

// Eksekusi aksi campaign untuk baris approval APPROVED (dipanggil ApprovalBell).
export async function executeCampaignAction(approvalRow) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const conn = await requireConn()
  const campaignId = approvalRow?.target?.campaign_id
  if (!campaignId) throw new Error('Approval tidak membawa campaign_id.')

  const params = { advertiser_id: conn.advertiser_id, campaign_id: campaignId }
  if (approvalRow.action_type === 'BUDGET_UPDATE') params.budget = approvalRow.proposed_value?.budget
  if (approvalRow.action_type === 'ROI_UPDATE') params.roas_bid = approvalRow.proposed_value?.roas_bid
  if (approvalRow.action_type === 'STATUS_UPDATE') params.operation_status = approvalRow.proposed_value?.operation_status
  if (approvalRow.action_type === 'PRODUCTS_UPDATE') params.item_group_ids = approvalRow.proposed_value?.item_group_ids
  if (approvalRow.action_type === 'CREATIVE_EXCLUDE') {
    params.action = approvalRow.proposed_value?.action
    params.items = approvalRow.proposed_value?.items
  }
  if (approvalRow.action_type === 'SESSION_CREATE') {
    params.store_id = approvalRow.proposed_value?.store_id
    params.session = approvalRow.proposed_value?.session
  }
  if (approvalRow.action_type === 'SESSION_UPDATE') {
    params.store_id = approvalRow.proposed_value?.store_id
    params.session_id = approvalRow.proposed_value?.session_id
    params.session = approvalRow.proposed_value?.session
  }
  if (approvalRow.action_type === 'SESSION_DELETE') {
    params.session_id = approvalRow.proposed_value?.session_id
  }

  let result = null, failMsg = null
  try {
    result = await post('/api/gmvmax/execute', {
      access_token: conn.access_token,
      action_type: approvalRow.action_type,
      approval_id: approvalRow.id,
      params,
    })
  } catch (e) { failMsg = e.message }

  const status = failMsg ? 'FAILED' : 'EXECUTED'
  await supabase.from('gmvmax_approvals')
    .update({
      status, executed_at: new Date().toISOString(),
      execution_result: failMsg ? { error: failMsg } : { apply: result.apply_result, read_back: result.read_back },
    })
    .eq('id', approvalRow.id).eq('workspace_id', wsId)

  try {
    const fmt = (v) => (v && typeof v === 'object') ? Object.entries(v).map(([k, x]) => `${k}:${x}`).join(' ') : String(v)
    const rb = result?.read_back
    await addActionLog({
      actionTag: approvalRow.action_type,
      body: failMsg
        ? `[AUTO] Eksekusi GAGAL: ${approvalRow.action_type} · ${approvalRow.target?.campaign_name || campaignId} · ${failMsg}`
        : `[AUTO] Dieksekusi: ${approvalRow.action_type} · ${approvalRow.target?.campaign_name || campaignId} · ${fmt(approvalRow.current_value)} → ${fmt(approvalRow.proposed_value)}${rb?.verified === true ? ' · read-back COCOK ✓' : rb?.verified === false ? ' · read-back BELUM cocok (cek Ads Manager)' : ''}`,
    })
  } catch { /* log gagal tak mengubah hasil */ }

  if (failMsg) { const e = new Error(failMsg); e.failed = true; throw e }
  return result
}
