// Tool AI Assistant SellerOS — SEMUA read-only, semua lewat PostgREST atas
// nama pemanggil (RLS). Meniru pola src/lib/assistant-tools.ts di Pikat:
// ASSISTANT_TOOLS = definisi untuk model, TOOL_EXECUTORS = pelaksana.
//
// Pelaksana menerima ctx = { token, workspaceId } dan input dari model.
// Jawaban dijaga ringkas (limit, top-N, agregasi) karena tiap byte hasil tool
// dikirim balik ke model sebagai token.
import { restGet, restGetAll } from './rest.js'
import {
  summarizeQuadrant, pickProducts, compactRow, summarizeStore, summarizeGmvMax, monthKeyWib,
} from './aggregate.js'

const enc = encodeURIComponent
const clampInt = (v, lo, hi, dflt) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt }
const isMonth = (v) => typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)

// ── Kuadran & produk ─────────────────────────────────────────────────────────
async function listPeriods(ctx) {
  const rows = await restGet(ctx.token,
    `periods?workspace_id=eq.${ctx.workspaceId}&select=id,name,platform,period_value,period_type,start_date,end_date,settings&order=period_value.desc.nullslast,created_at.desc&limit=60`)
  return (rows || []).map(r => ({
    id: r.id, nama: r.name, platform: r.platform, periode: r.period_value, tipe: r.period_type,
    mulai: r.start_date, selesai: r.end_date, sumber_file: r.settings?.sourceFileName ?? null,
  }))
}

/** Cari baris periode: periode + platform (opsional); tanpa periode → terbaru. */
async function findPeriod(ctx, { period, platform }) {
  let q = `periods?workspace_id=eq.${ctx.workspaceId}&select=id,name,platform,period_value,settings&order=period_value.desc.nullslast,created_at.desc&limit=1`
  if (period) q += `&period_value=eq.${enc(period)}`
  if (platform) q += `&platform=eq.${enc(platform)}`
  const rows = await restGet(ctx.token, q)
  return rows?.[0] || null
}

const PRODUCT_COLS = 'name,traffic_value,conversion_value,quadrant,raw_data'
async function periodProducts(ctx, periodId) {
  return restGetAll(ctx.token, `products?period_id=eq.${periodId}&select=${PRODUCT_COLS}&order=name.asc`)
}

async function quadrantSummary(ctx, input) {
  const p = await findPeriod(ctx, input)
  if (!p) return { error: 'Periode tidak ditemukan. Cek list_periods.' }
  const rows = await periodProducts(ctx, p.id)
  return { periode: p.period_value, platform: p.platform, nama_periode: p.name, ...summarizeQuadrant(rows, p.settings || {}) }
}

async function quadrantProducts(ctx, input) {
  const p = await findPeriod(ctx, input)
  if (!p) return { error: 'Periode tidak ditemukan. Cek list_periods.' }
  const rows = await periodProducts(ctx, p.id)
  return {
    periode: p.period_value, platform: p.platform,
    ...pickProducts(rows, { quadrant: input.quadrant, sortBy: input.sort_by, limit: input.limit, search: input.search }),
  }
}

async function productTrend(ctx, input) {
  const q = String(input.search || '').trim()
  if (q.length < 2) return { error: 'Isi search minimal 2 huruf.' }
  const rows = await restGet(ctx.token,
    `products?select=${PRODUCT_COLS},periods!inner(period_value,platform,workspace_id)` +
    `&periods.workspace_id=eq.${ctx.workspaceId}&name=ilike.*${enc(q)}*&limit=200`)
  const out = (rows || []).map(r => ({ periode: r.periods?.period_value, platform: r.periods?.platform, ...compactRow(r) }))
    .sort((a, b) => (a.periode < b.periode ? 1 : -1))
  return { cocok: out.length, tren: out.slice(0, 60) }
}

// ── Kalkulator profit ────────────────────────────────────────────────────────
async function calcProducts(ctx, input) {
  let q = `calc_products?workspace_id=eq.${ctx.workspaceId}&select=name,data,updated_at&order=updated_at.desc&limit=${clampInt(input.limit, 1, 40, 20)}`
  if (input.search) q += `&name=ilike.*${enc(String(input.search))}*`
  const rows = await restGet(ctx.token, q)
  return (rows || []).map(r => {
    const d = r.data || {}
    const vars = Array.isArray(d.variations) ? d.variations : []
    return {
      nama: r.name, sku: d.sku ?? null, platform: d.platform ?? d.fees?.platform ?? null,
      target_margin_pct: d.targetMargin ?? null, target_roas: d.targetRoas ?? null,
      biaya: d.fees ? { iklan: d.fees.adCost ?? null, voucher: d.fees.voucher ?? null, ongkir: d.fees.ongkir ?? null } : null,
      variasi: vars.slice(0, 10).map(v => ({
        nama: v.name, hpp: v.hpp ?? null, harga_jual: v.jual ?? null, harga_coret: v.hargaCoret ?? null,
        harga_campaign: v.jualCampaign ?? null, harga_flash: v.jualFlash ?? null,
        margin_kotor_pct: v.jual && v.hpp ? Math.round(((v.jual - v.hpp) / v.jual) * 1000) / 10 : null,
      })),
      catatan: 'margin_kotor_pct = (jual-hpp)/jual sebelum biaya admin/ongkir/iklan',
    }
  })
}

// ── Performa Toko ────────────────────────────────────────────────────────────
async function storePerformance(ctx, input) {
  const meta = await restGet(ctx.token,
    `store_file_blobs?workspace_id=eq.${ctx.workspaceId}&select=file_name,source,months,count&order=saved_at.asc`)
  if (!meta?.length) return { error: 'Belum ada data Performa Toko yang diimpor.' }
  const months = [...new Set(meta.flatMap(f => f.months || []))].sort()
  let month = isMonth(input.month) ? input.month : months[months.length - 1]
  if (!months.includes(month)) return { error: `Bulan ${month} tidak ada. Bulan tersedia: ${months.join(', ')}` }
  let q = `store_file_blobs?workspace_id=eq.${ctx.workspaceId}&select=file_name,source,lines&months=cs.${enc(JSON.stringify([month]))}`
  if (input.source === 'shopee' || input.source === 'tiktok') q += `&source=eq.${input.source}`
  const files = await restGet(ctx.token, q)
  const lines = (files || []).flatMap(f => f.lines || [])
  const s = summarizeStore(lines, { month })
  return { bulan_tersedia: months, sumber: input.source || 'semua', file: (files || []).length, ...s }
}

// ── Campaign & voucher ───────────────────────────────────────────────────────
async function campaigns(ctx, input) {
  const rows = await restGet(ctx.token,
    `campaigns?workspace_id=eq.${ctx.workspaceId}&select=name,platform,description,start_date,end_date,periods,items,voucher_config,parent_campaign&order=start_date.desc.nullslast&limit=60`)
  const today = monthKeyWib(Date.now()) + '-' + new Date(Date.now() + 7 * 3600e3).toISOString().slice(8, 10)
  const status = (c) => !c.start_date ? 'tanpa_tanggal' : c.end_date && c.end_date < today ? 'selesai' : c.start_date > today ? 'akan_datang' : 'berjalan'
  let out = (rows || []).map(c => {
    const items = Array.isArray(c.items) ? c.items : []
    const vouchers = Array.isArray(c.voucher_config?.vouchers) ? c.voucher_config.vouchers : []
    return {
      nama: c.name, platform: c.platform, status: status(c), mulai: c.start_date, selesai: c.end_date,
      induk: c.parent_campaign ?? null, deskripsi: c.description ? String(c.description).slice(0, 160) : null,
      jumlah_periode: Array.isArray(c.periods) ? c.periods.length : 0,
      jumlah_produk: items.length,
      contoh_produk: items.slice(0, 5).map(i => ({ nama: i.name, sku: i.sku ?? null, harga: i.price ?? null })),
      voucher: vouchers.slice(0, 5), target_margin_pct: c.voucher_config?.targetMargin ?? null,
    }
  })
  if (input.status && input.status !== 'semua') out = out.filter(c => c.status === input.status)
  return { total: out.length, campaign: out.slice(0, clampInt(input.limit, 1, 30, 15)) }
}

async function vouchers(ctx) {
  const rows = await restGet(ctx.token,
    `vouchers?workspace_id=eq.${ctx.workspaceId}&select=name,discount_type,discount_value,max_discount,min_purchase,product_ids&order=updated_at.desc&limit=40`)
  return (rows || []).map(v => ({
    nama: v.name, tipe: v.discount_type, nilai: v.discount_value, maks_diskon: v.max_discount, min_belanja: v.min_purchase,
    jumlah_produk: Array.isArray(v.product_ids) ? v.product_ids.length : 0,
  }))
}

// ── GMV Max ──────────────────────────────────────────────────────────────────
async function gmvmaxSummary(ctx, input) {
  const days = clampInt(input.days, 1, 30, 7)
  const rows = await restGet(ctx.token,
    `gmvmax_daily_facts?workspace_id=eq.${ctx.workspaceId}&select=store_id,fact_date,facts,comparisons,generated_at&order=fact_date.desc,generated_at.desc&limit=${days * 3}`)
  if (!rows?.length) return { error: 'Belum ada data harian GMV Max (worker belum sync atau belum ada import).' }
  return summarizeGmvMax(rows, { days })
}

async function gmvmaxTopCreatives(ctx, input) {
  const imp = await restGet(ctx.token,
    `gmvmax_imports?workspace_id=eq.${ctx.workspaceId}&is_current=eq.true&select=id,snapshot_date&order=snapshot_date.desc&limit=1`)
  const cur = imp?.[0]
  if (!cur) return { error: 'Belum ada snapshot GMV Max.' }
  const metric = ['cost', 'roas', 'gross_revenue', 'sku_orders', 'impressions'].includes(input.metric) ? input.metric : 'gross_revenue'
  const limit = clampInt(input.limit, 1, 20, 10)
  let q = `gmvmax_creatives?import_id=eq.${cur.id}&select=video_id,video_title,tiktok_account,campaign_name,status,cost,sku_orders,gross_revenue,roas,impressions,ctr,cvr&order=${metric}.desc.nullslast&limit=${limit}`
  if (input.status) q += `&status=eq.${enc(String(input.status))}`
  const rows = await restGet(ctx.token, q)
  return {
    snapshot: cur.snapshot_date, urut_by: metric,
    kreatif: (rows || []).map(r => ({
      video_id: r.video_id, judul: r.video_title ? String(r.video_title).slice(0, 80) : null, akun: r.tiktok_account,
      campaign: r.campaign_name, status: r.status, belanja: r.cost, pesanan: r.sku_orders, gmv: r.gross_revenue,
      roas: r.roas, tayangan: r.impressions, ctr: r.ctr, cvr: r.cvr,
    })),
  }
}

async function gmvmaxDecision(ctx) {
  const latest = await restGet(ctx.token,
    `gmvmax_skill_outputs?workspace_id=eq.${ctx.workspaceId}&select=output_date&order=output_date.desc&limit=1`)
  const date = latest?.[0]?.output_date
  if (!date) return { error: 'Belum ada vonis harian GMV Max (generate keputusan belum jalan).' }
  const rows = await restGet(ctx.token,
    `gmvmax_skill_outputs?workspace_id=eq.${ctx.workspaceId}&output_date=eq.${date}&select=skill_code,status,severity,confidence,payload,dismissed_at,snoozed_until&order=skill_code.asc&limit=20`)
  const skills = (rows || []).map(r => {
    const p = r.payload || {}
    const base = {
      skill: r.skill_code, status: r.status, tingkat: r.severity, keyakinan: r.confidence,
      judul: p.title ?? null, ringkasan: p.summary ? String(p.summary).slice(0, 300) : null,
      diabaikan: !!r.dismissed_at, ditunda_sampai: r.snoozed_until ?? null,
    }
    if (Array.isArray(p.primary_actions)) {
      base.aksi_utama = p.primary_actions.slice(0, 8).map(a => ({
        judul: a.title, prioritas: a.priority, target: `${a.target_scope_type}:${a.target_scope_id}`,
        penjelasan: a.explanation ? String(a.explanation).slice(0, 240) : null,
        dampak: a.expected_impact ?? null, risiko: a.risk ?? null, butuh_approval: a.approval_required ?? null,
      }))
      base.aksi_terblokir = (p.blocked_actions || []).length
    } else if (Array.isArray(p.recommendations)) {
      base.rekomendasi = p.recommendations.slice(0, 5).map(x => (typeof x === 'string' ? x : x.title || x.summary || JSON.stringify(x).slice(0, 160)))
    }
    return base
  })
  return { tanggal: date, catatan: 'Semua vonis bersifat rekomendasi; eksekusi selalu lewat antrean approval di UI.', skills }
}

async function gmvmaxExperiments(ctx, input) {
  let q = `gmvmax_experiments?workspace_id=eq.${ctx.workspaceId}&select=experiment_type,creative_video_id,product_id,campaign_id,treatment,start_at,status,conclusion,confidence,notes,checkpoints,contaminated&order=start_at.desc&limit=${clampInt(input.limit, 1, 30, 15)}`
  if (input.status) q += `&status=eq.${enc(String(input.status).toUpperCase())}`
  const rows = await restGet(ctx.token, q)
  return (rows || []).map(e => ({
    tipe: e.experiment_type, video_id: e.creative_video_id, produk_id: e.product_id, campaign_id: e.campaign_id,
    perlakuan: e.treatment ? String(e.treatment).slice(0, 160) : null, mulai: e.start_at, status: e.status,
    kesimpulan: e.conclusion, keyakinan: e.confidence, terkontaminasi: !!e.contaminated,
    checkpoint_terakhir: Array.isArray(e.checkpoints) && e.checkpoints.length ? e.checkpoints[e.checkpoints.length - 1] : null,
    catatan: e.notes ? String(e.notes).slice(0, 160) : null,
  }))
}

async function boostSessions(ctx, input) {
  const days = clampInt(input.days, 1, 60, 14)
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const rows = await restGet(ctx.token,
    `gmvmax_boost_sessions?workspace_id=eq.${ctx.workspaceId}&snapshot_date=gte.${since}&select=snapshot_date,campaign_name,session_id,bid_type,budget,item_id,spu_id,schedule_start_time,schedule_end_time,status&order=snapshot_date.desc&limit=400`)
  const m = new Map()
  for (const r of rows || []) if (!m.has(r.session_id)) m.set(r.session_id, r) // urut desc → yang pertama = terbaru
  return [...m.values()].slice(0, 30).map(r => ({
    sesi: r.session_id, campaign: r.campaign_name, jenis: r.bid_type === 'CREATIVE_NO_BID' ? 'Creative Boost' : r.bid_type === 'NO_BID' ? 'Max Delivery' : r.bid_type,
    budget: r.budget, video_id: r.item_id, produk_id: r.spu_id, mulai: r.schedule_start_time, selesai: r.schedule_end_time,
    status: r.status, snapshot_terakhir: r.snapshot_date,
  }))
}

// ── Definisi untuk model ─────────────────────────────────────────────────────
const periodProps = {
  period: { type: 'string', description: "Periode 'YYYY-MM' dari list_periods. Kosongkan untuk periode terbaru." },
  platform: { type: 'string', enum: ['shopee', 'tiktok'], description: 'Marketplace. Kosongkan bila hanya ada satu.' },
}

export const ASSISTANT_TOOLS = [
  { name: 'list_periods', description: 'Daftar periode (bulan) data kuadran produk yang tersimpan per marketplace, terbaru dulu. Panggil dulu bila user menyebut bulan tertentu.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_quadrant_summary', description: 'Ringkasan kuadran produk satu periode: jumlah produk, pengunjung, penjualan per kuadran (Q1-Q4), ambang traffic/konversi, dan 5 produk penjualan tertinggi.', input_schema: { type: 'object', properties: periodProps } },
  { name: 'get_quadrant_products', description: 'Daftar produk satu periode, bisa disaring per kuadran dan diurutkan. Untuk pertanyaan "produk mana yang ..." (traffic tinggi konversi rendah = quadrant 3, dst).', input_schema: { type: 'object', properties: { ...periodProps, quadrant: { type: 'integer', enum: [1, 2, 3, 4] }, sort_by: { type: 'string', enum: ['penjualan', 'pengunjung', 'konversi', 'pesanan'] }, search: { type: 'string', description: 'Potongan nama produk' }, limit: { type: 'integer', description: 'Maks 30, default 15' } } } },
  { name: 'get_product_trend', description: 'Riwayat satu produk (dicari dari potongan nama) lintas periode: pengunjung, konversi, penjualan, kuadran per bulan.', input_schema: { type: 'object', properties: { search: { type: 'string', description: 'Potongan nama produk, minimal 2 huruf' } }, required: ['search'] } },
  { name: 'get_calc_products', description: 'Produk di Kalkulator profit: HPP, harga jual normal/campaign/flash per variasi, target margin, asumsi biaya iklan/voucher/ongkir.', input_schema: { type: 'object', properties: { search: { type: 'string' }, limit: { type: 'integer' } } } },
  { name: 'get_store_performance', description: "Performa Toko dari ekspor pesanan marketplace untuk satu bulan: GMV/omzet, pesanan, unit, pembeli, AOV, pembatalan, per marketplace, per minggu, top produk & provinsi. Panggil dua kali untuk membandingkan dua bulan.", input_schema: { type: 'object', properties: { month: { type: 'string', description: "'YYYY-MM'. Kosongkan untuk bulan terbaru; jawaban juga memuat daftar bulan tersedia." }, source: { type: 'string', enum: ['shopee', 'tiktok'] } } } },
  { name: 'get_campaigns', description: 'Campaign/promo yang tercatat: status (berjalan/akan_datang/selesai), tanggal, jumlah & contoh produk, harga campaign, voucher, target margin.', input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['berjalan', 'akan_datang', 'selesai', 'semua'] }, limit: { type: 'integer' } } } },
  { name: 'get_vouchers', description: 'Daftar voucher toko yang disimpan: tipe diskon, nilai, maksimum, minimum belanja, jumlah produk.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_gmvmax_summary', description: 'Ringkasan iklan GMV Max TikTok N hari terakhir per hari: belanja, GMV, pesanan, ROAS/ROI, tayangan, klik, CTR, CVR, jumlah campaign aktif, budget & pemakaiannya, plus perbandingan vs rata-rata 7 hari.', input_schema: { type: 'object', properties: { days: { type: 'integer', description: '1-30, default 7' } } } },
  { name: 'get_gmvmax_top_creatives', description: 'Video/kreatif GMV Max teratas dari snapshot terbaru, diurutkan menurut metrik pilihan.', input_schema: { type: 'object', properties: { metric: { type: 'string', enum: ['gross_revenue', 'cost', 'roas', 'sku_orders', 'impressions'] }, status: { type: 'string', description: 'mis. DELIVERING, LEARNING, NOT_DELIVERING' }, limit: { type: 'integer' } } } },
  { name: 'get_gmvmax_decision', description: 'Vonis harian "Aksi Hari Ini" GMV Max terbaru: aksi utama yang direkomendasikan sistem, tingkat & keyakinan, per skill.', input_schema: { type: 'object', properties: {} } },
  { name: 'get_gmvmax_experiments', description: 'Eksperimen GMV Max (uji kreatif, boost manual, dll): status RUNNING/CONCLUDED/STOPPED, kesimpulan, checkpoint terakhir.', input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['RUNNING', 'CONCLUDED', 'STOPPED'] }, limit: { type: 'integer' } } } },
  { name: 'get_boost_sessions', description: 'Sesi boost (Max Delivery / Creative Boost) yang tertangkap dari TikTok N hari terakhir: budget, jadwal, video/produk, status.', input_schema: { type: 'object', properties: { days: { type: 'integer', description: '1-60, default 14' } } } },
]

export const TOOL_EXECUTORS = {
  list_periods: listPeriods,
  get_quadrant_summary: quadrantSummary,
  get_quadrant_products: quadrantProducts,
  get_product_trend: productTrend,
  get_calc_products: calcProducts,
  get_store_performance: storePerformance,
  get_campaigns: campaigns,
  get_vouchers: vouchers,
  get_gmvmax_summary: gmvmaxSummary,
  get_gmvmax_top_creatives: gmvmaxTopCreatives,
  get_gmvmax_decision: gmvmaxDecision,
  get_gmvmax_experiments: gmvmaxExperiments,
  get_boost_sessions: boostSessions,
}
