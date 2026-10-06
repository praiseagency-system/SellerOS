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
import { dayOne, wibDateOf, contaminationInWindow } from './skills/experimentWindows.mjs'

const DAY = 86400000
const dstr = (ms) => new Date(ms).toISOString().slice(0, 10)
const addIso = (iso, n) => dstr(Date.parse(`${iso}T00:00:00Z`) + n * DAY)

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
// Dalam hari WIB — sama dengan hari ke-1 jendela vonis. Dulu tanggal UTC, sehingga
// aksi pukul 00.00–06.59 WIB kehilangan hari tepat sebelum perlakuan.
export function baselineWindow(startMs) {
  const day1 = dstr(startMs + 7 * 3600000)
  return { baseline_start: addIso(day1, -7), baseline_end: addIso(day1, -1) }
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
// Minggu bukan bukti boost-nya berhasil. Eksperimen begini ditandai; vonisnya
// tetap dihitung tetapi DIBATASI (lihat experimentWindows.classifyWindows).
//
// JENDELA = jendela vonis yang sama: hari ke-1..7 WIB (dayOne .. +6). Dulu
// batasnya start_at + 7×24 jam dalam tanggal UTC, sehingga perubahan di hari
// ke-8 — sering justru TINDAK LANJUT pemilik atas vonis hari ke-7 — ikut
// menandai dan menurunkan vonis yang sudah final.
//   • setelan campaign: potret berstempel D memuat perubahan antara pagi D dan
//     pagi D+1 → dihitung bila D ≤ hari ke-7. Batas bawah tetap tanggal UTC
//     start_at: potret itu memuat perlakuannya sendiri.
//   • aksi lain: dieksekusi SETELAH start_at dan tanggal WIB-nya ≤ hari ke-7.
// Yang diperiksa: RUNNING dan CONCLUDED (evaluator menghitung keduanya) yang
// jendelanya berakhir — ATAU barisnya dibuat — paling lama MARK_GRACE_DAYS hari
// lalu: potret setelan yang ditambal belakangan masih tertangkap, eksperimen
// yang dibuka surut tetap diperiksa, dan bacaan tidak tumbuh selamanya.
// Potret setelan bisa bolong / parsial, jadi: perubahan yang rentang diff-nya
// memuat stempel hari mulai dianggap perlakuannya sendiri, dan "campaign baru"
// (campaign absen sehari dari potret) bukan bukti tercampur.
const MARK_GRACE_DAYS = 14

// PostgREST memotong diam-diam di ±1000 baris → selalu berhalaman & berurutan.
async function pageAll(build) {
  const out = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await build().range(f, f + 999)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function markContamination({ sb, workspaceId, now = Date.now() }) {
  let exps
  try {
    exps = await pageAll(() => sb.from('gmvmax_experiments')
      .select('id,campaign_id,creative_video_id,start_at,source_approval_id,contaminated,contamination,status,created_at')
      .eq('workspace_id', workspaceId).in('status', ['RUNNING', 'CONCLUDED']).order('id', { ascending: true }))
  } catch (error) {
    if (/does not exist|find the table|column/i.test(error.message || '')) return { marked: 0, cleared: 0, absent: true }
    throw error
  }
  if (!exps.length) return { marked: 0, cleared: 0 }
  const stamp = new Date(now).toISOString()

  // 1) Bersihkan tanda lama yang SELURUH kejadiannya di luar hari ke-1..7
  //    (warisan jendela lama). Hanya dari bukti yang tersimpan — tanpa bacaan.
  let cleared = 0
  for (const e of exps) {
    if (!e.contaminated) continue
    const k = contaminationInWindow(e)
    if (!k || k.kept.length === k.total) continue
    const patch = k.kept.length
      ? { contamination: { jendela: [k.day1, k.day7], kejadian: k.kept }, updated_at: stamp }
      : { contaminated: false, contamination: null, updated_at: stamp }
    const { error: ue } = await sb.from('gmvmax_experiments').update(patch).eq('workspace_id', workspaceId).eq('id', e.id)
    if (ue) continue
    if (!k.kept.length) { e.contaminated = false; e.contamination = null; cleared++ }
  }

  // 2) Tandai yang baru.
  const today = wibDateOf(stamp)
  const cand = []
  for (const e of exps) {
    if (e.contaminated) continue
    const s = Date.parse(e.start_at), day1 = dayOne(e)
    if (!Number.isFinite(s) || !day1) continue
    const day7 = addIso(day1, 6)
    const born = wibDateOf(e.created_at)
    if (addIso(day7, MARK_GRACE_DAYS) < today && !(born && addIso(born, MARK_GRACE_DAYS) >= today)) continue
    cand.push({ e, s, day1, day7, winFrom: dstr(s) })
  }
  if (!cand.length) return { marked: 0, cleared }
  const earliest = Math.min(...cand.map(c => c.s))

  // Sumber gangguan 1: perubahan setelan campaign (dari mana pun asalnya).
  const cs = await pageAll(() => sb.from('gmvmax_campaign_settings')
    .select('*').eq('workspace_id', workspaceId).gte('snapshot_date', dstr(earliest - DAY))
    .order('snapshot_date', { ascending: true }).order('id', { ascending: true }))
  const byDate = new Map()
  for (const r of cs) {
    if (!byDate.has(r.snapshot_date)) byDate.set(r.snapshot_date, [])
    byDate.get(r.snapshot_date).push(r)
  }
  const dates = [...byDate.keys()].sort()
  const settingChanges = []
  for (let i = 1; i < dates.length; i++) {
    for (const ch of diffSettings(byDate.get(dates[i - 1]), byDate.get(dates[i]))) {
      if (ch.field === '_new') continue
      settingChanges.push({ ...ch, date: dates[i], prev: dates[i - 1] })
    }
  }

  // Sumber gangguan 2: approval LAIN yang dieksekusi di jendela yang sama.
  const aps = await pageAll(() => sb.from('gmvmax_approvals')
    .select('id,action_type,target,executed_at').eq('workspace_id', workspaceId).eq('status', 'EXECUTED')
    .gte('executed_at', new Date(earliest).toISOString()).order('id', { ascending: true }))

  let marked = 0
  for (const { e, s, day1, day7, winFrom } of cand) {
    const hits = []
    for (const ch of settingChanges) {
      if (!e.campaign_id || ch.campaign_id !== e.campaign_id) continue
      // hari-H = perlakuannya sendiri; bila potret hari-H bolong, perubahan itu
      // baru terlihat di potret berikutnya (rentang diff-nya memuat hari-H).
      if (ch.date <= winFrom || ch.prev < winFrom || ch.date > day7) continue
      hits.push({ jenis: 'setelan_campaign', tanggal: ch.date, bidang: ch.label, dari: ch.from, jadi: ch.to })
    }
    for (const a of aps) {
      if (a.id === e.source_approval_id) continue
      const t = Date.parse(a.executed_at)
      if (!Number.isFinite(t) || t <= s) continue
      const tgl = wibDateOf(a.executed_at)
      if (!tgl || tgl > day7) continue
      const sameCampaign = e.campaign_id && String(a.target?.campaign_id) === e.campaign_id
      const sameVideo = e.creative_video_id && String(a.target?.video_id) === e.creative_video_id
      if (sameCampaign || sameVideo) hits.push({ jenis: 'aksi_lain', tanggal: tgl, aksi: a.action_type })
    }
    if (hits.length) {
      const { error: ue } = await sb.from('gmvmax_experiments')
        .update({ contaminated: true, contamination: { jendela: [day1, day7], kejadian: hits }, updated_at: stamp })
        .eq('workspace_id', workspaceId).eq('id', e.id)
      if (!ue) marked++
    }
  }
  return { marked, cleared }
}

// ── JEMBATAN 2 — sesi boost DI LUAR APLIKASI → eksperimen ────────────────────
//
// Jembatan 1 di atas hanya mengenal aksi yang lewat tombol 🔔. Creative Boost yang
// dikerjakan langsung di Seller Centre TIDAK pernah membuat baris approval, jadi
// ia tak pernah membuka eksperimen — padahal itu justru aksi yang paling sering
// dipakai. Sumbernya di sini adalah potret harian `gmvmax_boost_sessions`.
//
// ANGGARAN WAKTU (penting saat membaca checkpoint): snapshot_date memakai hari
// bisnis WIB, sedangkan computeCheckpoints menganggat hari dari potongan UTC
// `start_at`. Untuk boost yang mulai lewat tengah malam WIB (00:00–07:00) kedua
// hal itu berbeda satu hari, dan justru menguntungkan: H+1 mendarat tepat di hari
// WIB pertama boost berjalan. Untuk boost siang/malam, H+1 = hari penuh pertama.
// Baseline SELALU dihitung dalam hari WIB supaya tak pernah menabrak hari
// perlakuan. Diverifikasi atas 3 sesi nyata 29 Agu 2026 (01:30–01:34 WIB).
import { jakartaDateString, dateMinusDays } from './runtime/jakartaDate.mjs'

const ABSENT = /does not exist|find the table|column|schema cache/i
// Sesi yang sama boleh dianggap "sudah tercatat" bila ada eksperimen dgn subjek
// sama yang mulai dalam 6 jam — itu jejak boost yang dijalankan LEWAT aplikasi
// (approval → eksperimen), bukan kejadian kedua.
const NEAR_MS = 6 * 3600 * 1000
const rp = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`

// Baseline 7 hari WIB penuh, berakhir sehari sebelum hari boost.
export function baselineWindowWib(startMs) {
  const day = jakartaDateString(startMs)
  return { baseline_start: dateMinusDays(day, 7), baseline_end: dateMinusDays(day, 1) }
}

// Sesi → rencana eksperimen. CREATIVE_NO_BID tanpa item_id sengaja TIDAK dibuka:
// subjeknya tak diketahui, dan eksperimen tanpa subjek akan mengukur video yang
// salah. Lebih baik satu sesi tak tercatat daripada satu vonis yang keliru.
export function planFromSession(s) {
  if (!s) return null
  const campaign_id = s.campaign_id ? String(s.campaign_id) : null
  const product_id = s.spu_id != null ? String(s.spu_id) : null
  const video_id = s.item_id != null ? String(s.item_id) : null
  const asal = 'dijalankan di Seller Centre'

  if (s.bid_type === 'CREATIVE_NO_BID') {
    if (!video_id) return null
    return {
      experiment_type: 'MANUAL_BOOST',
      creative_video_id: video_id, product_id, campaign_id,
      treatment: `Creative Boost ${rp(s.budget)}/hari — ${asal}`,
    }
  }
  if (s.bid_type === 'NO_BID') {
    return {
      experiment_type: 'ACCELERATE_TESTING',
      creative_video_id: null, product_id, campaign_id,
      treatment: `Max Delivery ${rp(s.budget)}/hari — ${asal}`,
    }
  }
  return null
}

// Satu sesi muncul di SETIAP potret harian selama ia berjalan. Ambil penampakan
// pertama (tanggal mulainya benar), tapi item_id dari potret mana pun yang
// memilikinya — baris sebelum 31 Agu 2026 ditulis sebelum endpoint detail dipanggil.
export function dedupeSessions(rows = []) {
  const by = new Map()
  for (const r of rows) {
    const cur = by.get(r.session_id)
    if (!cur) by.set(r.session_id, { ...r })
    else if (!cur.item_id && r.item_id) cur.item_id = r.item_id
  }
  return [...by.values()]
}

// Sudah ada eksperimen untuk perlakuan yang sama? (mis. boost yang dijalankan
// lewat aplikasi sudah membuka eksperimen dari approval-nya).
export function alreadyCovered(exps, { plan, startMs, sessionId }) {
  return (exps || []).some(e => {
    if (e.source_session_id && e.source_session_id === sessionId) return true
    if (e.experiment_type !== plan.experiment_type) return false
    const subjekSama = plan.creative_video_id
      ? e.creative_video_id === plan.creative_video_id
      : (!e.creative_video_id && e.campaign_id === plan.campaign_id)
    if (!subjekSama) return false
    const t = Date.parse(e.start_at)
    return Number.isFinite(t) && Math.abs(t - startMs) <= NEAR_MS
  })
}

export async function openExperimentsFromSessions({
  sb, workspaceId, storeId, now = Date.now(), lookbackDays = 60,
}) {
  const { data: raw, error } = await sb.from('gmvmax_boost_sessions')
    .select('*').eq('workspace_id', workspaceId)
    .gte('snapshot_date', dstr(now - lookbackDays * DAY)).order('snapshot_date')
  if (error) {
    if (ABSENT.test(error.message || '')) return { opened: 0, absent: true }
    throw new Error(`baca sesi boost gagal: ${error.message}`)
  }
  if (!raw?.length) return { opened: 0, skipped: 0, noSubject: 0 }

  const { data: exps, error: e2 } = await sb.from('gmvmax_experiments')
    .select('*').eq('workspace_id', workspaceId)
  if (e2) {
    if (ABSENT.test(e2.message || '')) return { opened: 0, absent: true }
    throw new Error(`baca eksperimen gagal: ${e2.message}`)
  }

  const rows = []
  let skipped = 0, noSubject = 0
  for (const s of dedupeSessions(raw)) {
    const plan = planFromSession(s)
    if (!plan) { if (s.bid_type === 'CREATIVE_NO_BID') noSubject++; else skipped++; continue }
    const startMs = Date.parse(s.schedule_start_time)
    if (!Number.isFinite(startMs)) { skipped++; continue }
    if (alreadyCovered(exps, { plan, startMs, sessionId: s.session_id })) { skipped++; continue }
    rows.push({
      workspace_id: workspaceId,
      store_id: String(storeId),
      source_session_id: s.session_id,
      start_at: new Date(startMs).toISOString(),
      ...baselineWindowWib(startMs),
      ...plan,
      status: 'RUNNING',
      notes: `Terdeteksi dari potret harian sesi boost (${s.campaign_name || s.campaign_id}) — bukan dari tombol persetujuan.`,
    })
  }
  if (!rows.length) return { opened: 0, skipped, noSubject }

  let { error: e3 } = await sb.from('gmvmax_experiments').insert(rows)
  // Kolom asal-usul baru ada di migrasi 0057. Belum di-apply → tetap buka
  // eksperimennya (dedup natural key sudah menahan duplikat), jangan menahan
  // seluruh fitur hanya karena satu kolom provenance.
  if (e3 && ABSENT.test(e3.message || '')) {
    ({ error: e3 } = await sb.from('gmvmax_experiments')
      .insert(rows.map(({ source_session_id, ...r }) => r)))
  }
  if (e3) throw new Error(`buka eksperimen dari sesi gagal: ${e3.message}`)
  return { opened: rows.length, skipped, noSubject }
}
