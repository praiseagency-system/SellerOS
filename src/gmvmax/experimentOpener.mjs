// JEMBATAN 1 — approval yang EXECUTED → eksperimen terbuka sendiri.
//
// Selama ini gmvmax_experiments kosong (0 baris) karena eksperimen HANYA bisa
// dibuat manual lewat AI Insight → tab Eksperimen, dan tak pernah ada yang
// membuatnya. Akibatnya evaluator harian (experimentEval) melewati nol baris
// tiap pagi: mesin pengukurnya menyala tapi tak ada yang diukur.
//
// Sengaja dijalankan DI WORKER, bukan di browser saat approval dieksekusi:
//   - idempoten (unique index source_approval_id) & tahan browser ditutup
//   - otomatis menyapu aksi LAMA yang sudah telanjur tereksekusi (backfill surut)
//   - satu tempat, bukan tersebar di tiap jalur eksekusi
//
// Read-only ke TikTok (tidak memanggilnya sama sekali); menulis HANYA ke
// gmvmax_experiments. Non-fatal di pemanggil.
import { diffSettings } from './campaignSettings.mjs'

const DAY = 86400000
const dstr = (ms) => new Date(ms).toISOString().slice(0, 10)

// Aksi → jenis eksperimen + subjek yang diukur. Aksi yang TIDAK memulai
// perlakuan baru (uji, ubah/hentikan sesi) sengaja tak membuka eksperimen:
// SESSION_UPDATE/DELETE mengubah perlakuan yang eksperimennya sudah ada.
const SKIP = new Set(['TEST', 'SESSION_UPDATE', 'SESSION_DELETE'])

export function planFromApproval(ap) {
  if (!ap || SKIP.has(ap.action_type)) return null
  const t = ap.target || {}
  const pv = ap.proposed_value || {}
  const campaignId = t.campaign_id ? String(t.campaign_id) : null
  const videoId = t.video_id ? String(t.video_id) : null
  const spu = pv?.session?.product_list?.[0]?.spu_id ?? pv?.items?.[0]?.spu_id_list?.[0] ?? null
  const productId = spu != null ? String(spu) : null

  switch (ap.action_type) {
    case 'SESSION_CREATE': {
      const boost = pv?.session?.bid_type === 'CREATIVE_NO_BID'
      return {
        experiment_type: boost ? 'MANUAL_BOOST' : 'ACCELERATE_TESTING',
        creative_video_id: boost ? videoId : null,
        product_id: productId, campaign_id: campaignId,
        treatment: `${boost ? 'Creative Boost' : 'Max Delivery'} Rp${Number(pv.budget || 0).toLocaleString('id-ID')}/hari, ${pv.jam || 24} jam`,
      }
    }
    case 'CREATIVE_EXCLUDE':
      return {
        experiment_type: 'CREATIVE_EXCLUSION',
        creative_video_id: videoId, product_id: productId, campaign_id: campaignId,
        treatment: pv.action === 'ADD' ? 'Video dipulihkan ke rotasi' : 'Video dikeluarkan dari rotasi',
      }
    case 'SPARK_BIND':
      return {
        experiment_type: 'NEW_CREATIVE_TEST',
        creative_video_id: videoId, product_id: productId, campaign_id: campaignId,
        treatment: 'Kode spark dipasang — video masuk kolam auto-selection',
      }
    case 'PRODUCTS_UPDATE':
      return {
        experiment_type: 'PRODUCT_CREATIVE_TEST',
        creative_video_id: null, product_id: null, campaign_id: campaignId,
        treatment: 'Susunan produk campaign diubah',
      }
    case 'BUDGET_UPDATE':
      return {
        experiment_type: 'OTHER_APPROVED',
        creative_video_id: null, product_id: null, campaign_id: campaignId,
        treatment: `Budget ${JSON.stringify(ap.current_value?.budget ?? null)} → ${JSON.stringify(pv.budget ?? null)}`,
      }
    case 'ROI_UPDATE':
      return {
        experiment_type: 'OTHER_APPROVED',
        creative_video_id: null, product_id: null, campaign_id: campaignId,
        treatment: `Target ROAS ${JSON.stringify(ap.current_value?.roas_bid ?? null)} → ${JSON.stringify(pv.roas_bid ?? null)}`,
      }
    case 'STATUS_UPDATE':
      return {
        experiment_type: 'OTHER_APPROVED',
        creative_video_id: null, product_id: null, campaign_id: campaignId,
        treatment: `Status campaign → ${pv.operation_status ?? '?'}`,
      }
    case 'SPARK_UNBIND':
      return {
        experiment_type: 'OTHER_APPROVED',
        creative_video_id: videoId, product_id: productId, campaign_id: campaignId,
        treatment: 'Ikatan kode spark dilepas',
      }
    default:
      return null
  }
}

// Baseline WAJIB dinyatakan (aturan migrasi 0031): 7 hari penuh SEBELUM aksi
// dijalankan, berakhir sehari sebelumnya supaya hari-H tak ikut mencemari.
export function baselineWindow(startMs) {
  return { baseline_start: dstr(startMs - 7 * DAY), baseline_end: dstr(startMs - DAY) }
}

// Buka eksperimen untuk semua approval EXECUTED yang belum punya eksperimen.
export async function openExperimentsFromApprovals({ sb, workspaceId, storeId, now = Date.now() }) {
  const { data: aps, error } = await sb.from('gmvmax_approvals')
    .select('*').eq('workspace_id', workspaceId).eq('status', 'EXECUTED')
  if (error) throw new Error(`baca approvals gagal: ${error.message}`)
  if (!aps?.length) return { opened: 0, skipped: 0 }

  const { data: exist, error: e2 } = await sb.from('gmvmax_experiments')
    .select('source_approval_id').eq('workspace_id', workspaceId).not('source_approval_id', 'is', null)
  if (e2) {
    // Tabel/kolom belum ada (migrasi 0048 belum dijalankan) → diam, jangan gagal.
    if (/does not exist|find the table|column/i.test(e2.message || '')) return { opened: 0, absent: true }
    throw new Error(`baca eksperimen gagal: ${e2.message}`)
  }
  const done = new Set((exist || []).map(r => r.source_approval_id))

  const rows = []
  let skipped = 0
  for (const ap of aps) {
    if (done.has(ap.id)) continue
    const plan = planFromApproval(ap)
    if (!plan) { skipped++; continue }
    const startMs = Date.parse(ap.executed_at || ap.decided_at || ap.created_at)
    if (!Number.isFinite(startMs)) { skipped++; continue }
    rows.push({
      workspace_id: workspaceId,
      store_id: String(storeId),
      source_approval_id: ap.id,
      start_at: new Date(startMs).toISOString(),
      ...baselineWindow(startMs),
      ...plan,
      status: 'RUNNING',
      notes: ap.reason || null,
    })
  }
  if (!rows.length) return { opened: 0, skipped }

  const { error: e3 } = await sb.from('gmvmax_experiments').insert(rows)
  if (e3) throw new Error(`buka eksperimen gagal: ${e3.message}`)
  return { opened: rows.length, skipped }
}

// ── Penanda TERCAMPUR ───────────────────────────────────────────────────────
// Kalau ada perubahan LAIN yang mendarat di dalam jendela pengukuran, kita tidak
// bisa tahu sebab hasilnya yang mana. Contoh nyata: boost sebuah video hari Senin,
// lalu budget campaign-nya dinaikkan lewat Ads Manager hari Rabu. Hasil bagus di
// Minggu bukan bukti boost-nya berhasil. Eksperimen begini ditandai dan TIDAK
// dipakai menyimpulkan apa pun — lebih baik kehilangan satu data daripada
// mempelajari sebab yang keliru.
export async function markContamination({ sb, workspaceId, now = Date.now() }) {
  const { data: exps, error } = await sb.from('gmvmax_experiments')
    .select('id,campaign_id,creative_video_id,start_at,source_approval_id,contaminated')
    .eq('workspace_id', workspaceId).eq('status', 'RUNNING')
  if (error) {
    if (/does not exist|find the table|column/i.test(error.message || '')) return { marked: 0, absent: true }
    throw error
  }
  if (!exps?.length) return { marked: 0 }

  const earliest = Math.min(...exps.map(e => Date.parse(e.start_at)).filter(Number.isFinite))
  const from = dstr(earliest - DAY)

  // Sumber gangguan 1: perubahan setelan campaign (dari mana pun asalnya).
  const { data: cs } = await sb.from('gmvmax_campaign_settings')
    .select('*').eq('workspace_id', workspaceId).gte('snapshot_date', from).order('snapshot_date')
  const byDate = new Map()
  for (const r of cs || []) {
    if (!byDate.has(r.snapshot_date)) byDate.set(r.snapshot_date, [])
    byDate.get(r.snapshot_date).push(r)
  }
  const dates = [...byDate.keys()].sort()
  const settingChanges = []
  for (let i = 1; i < dates.length; i++) {
    for (const ch of diffSettings(byDate.get(dates[i - 1]), byDate.get(dates[i]))) {
      settingChanges.push({ ...ch, date: dates[i] })
    }
  }

  // Sumber gangguan 2: approval LAIN yang dieksekusi di jendela yang sama.
  const { data: aps } = await sb.from('gmvmax_approvals')
    .select('id,action_type,target,executed_at').eq('workspace_id', workspaceId).eq('status', 'EXECUTED')

  let marked = 0
  for (const e of exps) {
    if (e.contaminated) continue
    const s = Date.parse(e.start_at)
    if (!Number.isFinite(s)) continue
    const endMs = Math.min(now, s + 7 * DAY)
    const winFrom = dstr(s), winTo = dstr(endMs)
    const hits = []

    for (const ch of settingChanges) {
      if (!e.campaign_id || ch.campaign_id !== e.campaign_id) continue
      if (ch.date <= winFrom || ch.date > winTo) continue   // hari-H = perlakuannya sendiri
      hits.push({ jenis: 'setelan_campaign', tanggal: ch.date, bidang: ch.label, dari: ch.from, jadi: ch.to })
    }
    for (const a of aps || []) {
      if (a.id === e.source_approval_id) continue
      const t = Date.parse(a.executed_at)
      if (!Number.isFinite(t) || t <= s || t > endMs) continue
      const sameCampaign = e.campaign_id && String(a.target?.campaign_id) === e.campaign_id
      const sameVideo = e.creative_video_id && String(a.target?.video_id) === e.creative_video_id
      if (sameCampaign || sameVideo) {
        hits.push({ jenis: 'aksi_lain', tanggal: dstr(t), aksi: a.action_type })
      }
    }

    if (hits.length) {
      const { error: ue } = await sb.from('gmvmax_experiments')
        .update({ contaminated: true, contamination: { jendela: [winFrom, winTo], kejadian: hits }, updated_at: new Date(now).toISOString() })
        .eq('id', e.id)
      if (!ue) marked++
    }
  }
  return { marked }
}
