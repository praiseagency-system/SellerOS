/* eslint-disable react-refresh/only-export-components */
// Context modul GMV Max — model SINGLE-DAY (additive).
// Tiap upload = 1 snapshot berisi angka HARI ITU (bukan kumulatif). Angka hari =
// isi file langsung; total bulan / window = JUMLAH hari. Pemilihan: pilih BULAN
// (+ "Semua"), lalu window (Hari ini / 3 / 7 hari / Bulan ini) menentukan berapa
// hari terakhir yang diagregasi untuk semua tabel. Tren = angka per-hari langsung
// (dari `totals` ringkas tiap snapshot, tanpa selisih). Creatives dimuat hanya
// untuk hari-hari dalam window (+ pembanding) agar hemat memori.
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { parseGmvMaxFile, fmtSnapshotLabel } from '../utils/parseGmvMax'
import { listImports, loadCreatives, saveImport, deleteImport } from '../data/gmvmaxImports'
import { getThresholds, saveThresholds } from '../data/gmvmaxSettings'
import { listNotes, upsertNote, deleteNote } from '../data/gmvmaxNotes'
import { listActionLog, addActionLog, deleteActionLog } from '../data/gmvmaxActionLog'
import { listBoost, upsertBoost, deleteBoost } from '../data/gmvmaxBoost'
import { loadVideoMeta, saveVideoMeta } from '../data/gmvmaxVideoMeta'
import { listProducts } from '../data/calcProducts'
import { enrichVideos } from '../utils/gmvmaxEnrich'
import { DEFAULT_THRESHOLDS } from '../utils/gmvmaxClassify'
import {
  rollupVideos, rollupCampaigns, rollupCreators, rollupHooks, rollupProducts, rollupProductsCard, dashboardSummary,
  rollupChannels, channelDailyTrend,
} from '../utils/gmvmaxRollup'
import { insightCards, actionPlan, winningFramework } from '../utils/gmvmaxInsights'

const Ctx = createContext(null)
export function useGmvMax() { return useContext(Ctx) }

// Total per tipe creative (Video vs Product card vs semua) untuk sekumpulan baris.
function typeTotalsOf(rows) {
  const z = () => ({ cost: 0, revenue: 0, orders: 0 })
  const v = z(), c = z()
  for (const r of rows) {
    const t = r.creativeType === 'Product card' ? c : v
    t.cost += r.cost || 0
    t.revenue += r.grossRevenue || 0
    t.orders += r.skuOrders || 0
  }
  const roas = o => (o.cost > 0 ? o.revenue / o.cost : null)
  const all = { cost: v.cost + c.cost, revenue: v.revenue + c.revenue, orders: v.orders + c.orders }
  return { video: { ...v, roas: roas(v) }, card: { ...c, roas: roas(c) }, all: { ...all, roas: roas(all) } }
}

const MONTHS_FULL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const monthKey = i => (i.period_month || i.snapshot_date || '').slice(0, 7)
const sd = i => i.snapshot_date || ''
function monthLabel(mk) {
  const m = mk && mk.match(/^(\d{4})-(\d{2})/)
  return m ? `${MONTHS_FULL[+m[2] - 1]} ${m[1]}` : (mk || '—')
}
function prevMonthOf(mk) {
  const m = mk && mk.match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, 1))
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 7)
}
const windowLabelOf = w => (w === 'month' ? 'Bulan ini' : w === 1 ? 'Hari ini' : `${w} hari terakhir`)

// ── Date range (picker harian/mingguan/bulanan/custom) ────────────────────────
const addDaysISO = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const daysBetweenISO = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000)
function fmtRangeLabel(start, end) {
  if (!start || !end) return null
  if (start === end) return fmtSnapshotLabel(start) || start
  return `${fmtSnapshotLabel(start) || start} – ${fmtSnapshotLabel(end) || end}`
}

// Window agregasi: berapa hari terakhir yang dijumlahkan. 'month' = semua hari.
export const WINDOWS = [
  { d: 1, label: 'Hari ini', short: '1h' },
  { d: 3, label: '3 hari', short: '3h' },
  { d: 7, label: '7 hari', short: '7h' },
  { d: 'month', label: 'Bulan ini', short: 'Bln' },
]

export function GmvMaxProvider({ children }) {
  const [imports, setImports] = useState([])   // snapshot harian (ringkas, tanpa creatives)
  const [creatives, setCreatives] = useState([])
  const [creativesLoading, setCreativesLoading] = useState(false) // re-fetch saat ganti rentang
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [notes, setNotes] = useState({})
  const [actionLog, setActionLog] = useState([])
  const [boost, setBoost] = useState({})
  const [productNames, setProductNames] = useState({})
  const [meta, setMeta] = useState({})
  const [enriching, setEnriching] = useState(null)
  const [period, setPeriod] = useState(null)    // null=bulan terbaru | 'all' | monthKey
  const [windowDays, setWindowDays] = useState('month') // 1 | 3 | 7 | 'month'
  const [customRange, setCustomRange] = useState(null)  // { start, end, key } | null (mode date-range picker)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    const [imps, th, nts, log, bst, prods] = await Promise.all([
      listImports(), getThresholds(), listNotes(), listActionLog().catch(() => []),
      listBoost().catch(() => ({})), listProducts().catch(() => []),
    ])
    setImports(imps)
    setThresholds(th)
    setNotes(nts)
    setActionLog(log)
    setBoost(bst)
    const nameMap = {}
    for (const p of prods) {
      const code = p.kode_produk || p.catalog?.productCode
      if (code) nameMap[String(code).trim()] = p.name
    }
    setProductNames(nameMap)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try { await reload() } catch (e) { if (active) setError(e.message) }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [reload])

  // ── Bulan & window ──────────────────────────────────────────────────────────
  const months = useMemo(() => {
    const map = new Map()
    for (const i of imports) { const k = monthKey(i); if (k && !map.has(k)) map.set(k, { key: k, label: monthLabel(k) }) }
    return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
  }, [imports])

  const selectedMonth = period === 'all' ? null
    : (period && period !== 'all' ? period : (months[0]?.key || null))

  // ── Date range picker: batas data, preset, default ──────────────────────────
  const dateBounds = useMemo(() => {
    const ds = imports.map(sd).filter(Boolean).sort()
    return ds.length ? { min: ds[0], max: ds[ds.length - 1] } : null
  }, [imports])

  const rangePresets = useMemo(() => {
    if (!dateBounds) return []
    const { max, min } = dateBounds
    return [
      { key: 'today', label: 'Terbaru (1 hari)', start: max, end: max },
      { key: '7d', label: '7 hari terakhir', start: addDaysISO(max, -6), end: max },
      { key: '30d', label: '30 hari', start: addDaysISO(max, -29), end: max },
      { key: 'month', label: 'Bulan ini', start: `${max.slice(0, 7)}-01`, end: max },
      { key: 'all', label: 'Semua', start: min, end: max },
    ]
  }, [dateBounds])

  // Rentang efektif = pilihan user (customRange) atau default bulan berjalan
  // (s/d snapshot terbaru). Turunan, bukan set-state-in-effect.
  const effectiveRange = useMemo(() => {
    if (customRange) return customRange
    if (dateBounds) return { start: `${dateBounds.max.slice(0, 7)}-01`, end: dateBounds.max, key: 'month' }
    return null
  }, [customRange, dateBounds])

  // Hari (snapshot) dalam scope terpilih, urut tanggal naik.
  const scopeDays = useMemo(() => {
    const asc = (a, b) => (sd(a) < sd(b) ? -1 : 1)
    if (effectiveRange) return imports
      .filter(i => i.snapshot_date && i.snapshot_date >= effectiveRange.start && i.snapshot_date <= effectiveRange.end)
      .sort(asc)
    return imports
      .filter(i => i.snapshot_date && (period === 'all' || monthKey(i) === selectedMonth))
      .sort(asc)
  }, [imports, period, selectedMonth, effectiveRange])

  // Hari dalam window (N terakhir; 'month' = semua hari scope).
  const windowDaysSnaps = useMemo(
    () => ((effectiveRange || windowDays === 'month') ? scopeDays : scopeDays.slice(-windowDays)),
    [scopeDays, windowDays, effectiveRange])

  // Hari pembanding: blok N hari sebelum window; untuk 'month' = bulan sebelumnya.
  const prevDaysSnaps = useMemo(() => {
    if (effectiveRange) {
      const len = daysBetweenISO(effectiveRange.start, effectiveRange.end) + 1
      const prevEnd = addDaysISO(effectiveRange.start, -1)
      const prevStart = addDaysISO(effectiveRange.start, -len)
      return imports.filter(i => i.snapshot_date && i.snapshot_date >= prevStart && i.snapshot_date <= prevEnd)
        .sort((a, b) => (sd(a) < sd(b) ? -1 : 1))
    }
    if (windowDays === 'month') {
      if (period === 'all' || !selectedMonth) return []
      const pm = prevMonthOf(selectedMonth)
      return imports.filter(i => i.snapshot_date && monthKey(i) === pm).sort((a, b) => (sd(a) < sd(b) ? -1 : 1))
    }
    return scopeDays.slice(-2 * windowDays, -windowDays)
  }, [scopeDays, windowDays, imports, period, selectedMonth, effectiveRange])

  const neededIds = useMemo(() => {
    const s = new Set()
    windowDaysSnaps.forEach(i => s.add(i.id))
    prevDaysSnaps.forEach(i => s.add(i.id))
    return [...s].sort()
  }, [windowDaysSnaps, prevDaysSnaps])
  const neededKey = neededIds.join(',')

  useEffect(() => {
    let active = true
    ;(async () => {
      if (!neededIds.length) { if (active) { setCreatives([]); setCreativesLoading(false) } return }
      if (active) setCreativesLoading(true)
      try {
        const cre = await loadCreatives(neededIds)
        if (!active) return
        setCreatives(cre)
        const vids = cre.filter(c => c.creativeType === 'Video' && c.videoId).map(c => c.videoId)
        const loaded = await loadVideoMeta(vids)
        if (active) setMeta(prev => ({ ...prev, ...loaded }))
      } catch (e) { if (active) setError(e.message) }
      finally { if (active) setCreativesLoading(false) }
    })()
    return () => { active = false }
  }, [neededKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Turunan ─────────────────────────────────────────────────────────────────
  const creativesEnriched = useMemo(() => creatives.map(c => {
    if (c.creativeType === 'Video' && c.videoId && !c.tiktokAccount) {
      const m = meta[c.videoId]
      const an = m?.authorName && m.authorName.trim() !== '@' ? m.authorName.trim() : null
      const name = m?.username || an
      if (name) return { ...c, tiktokAccount: name, tiktokUsername: m.username || null }
    }
    return c
  }), [creatives, meta])

  const missingAccountCount = useMemo(
    () => new Set(creativesEnriched
      .filter(c => c.creativeType === 'Video' && c.videoId && !c.tiktokAccount
        && (!meta[c.videoId] || meta[c.videoId].status === 'error'))
      .map(c => c.videoId)).size,
    [creativesEnriched, meta])

  const winNames = useMemo(() => new Set(windowDaysSnaps.map(i => i.name)), [windowDaysSnaps])
  const prevNames = useMemo(() => new Set(prevDaysSnaps.map(i => i.name)), [prevDaysSnaps])

  // Baris = gabungan creatives semua hari dalam window (dijumlahkan oleh rollup).
  const rows = useMemo(
    () => creativesEnriched.filter(c => winNames.has(c.periodName)),
    [creativesEnriched, winNames])

  const videos = useMemo(() => rollupVideos(rows, thresholds), [rows, thresholds])
  const campaigns = useMemo(() => rollupCampaigns(rows), [rows])
  const creators = useMemo(() => rollupCreators(rows, thresholds), [rows, thresholds])
  const hooks = useMemo(() => rollupHooks(rows, thresholds), [rows, thresholds])
  const products = useMemo(() => rollupProducts(rows).map(p => ({
    ...p, name: (p.productId && productNames[p.productId]) || null,
  })), [rows, productNames])
  // Performa Produk memakai ini: revenue per-produk dari channel PRODUCT CARD saja
  // (dialokasikan via porsi video, Live dikecualikan). Lihat rollupProductsCard.
  const productsCard = useMemo(() => rollupProductsCard(rows).map(p => ({
    ...p, name: (p.productId && productNames[p.productId]) || null,
  })), [rows, productNames])
  const dashboard = useMemo(() => dashboardSummary(videos, thresholds), [videos, thresholds])
  const typeTotals = useMemo(() => typeTotalsOf(rows), [rows])
  // Perbandingan per channel (Video / Product card / Live) + tren harian stacked.
  const channels = useMemo(() => rollupChannels(rows), [rows])
  const channelTrend = useMemo(() => channelDailyTrend(rows), [rows])

  // Pembanding (window sebelumnya / bulan lalu) untuk delta di kartu & halaman.
  const prevRows = useMemo(
    () => (prevDaysSnaps.length ? creativesEnriched.filter(c => prevNames.has(c.periodName)) : null),
    [creativesEnriched, prevNames, prevDaysSnaps])
  const prevLabel = effectiveRange
    ? 'periode sebelumnya'
    : (windowDays === 'month'
      ? (selectedMonth ? monthLabel(prevMonthOf(selectedMonth)) : null)
      : `${windowDays} hari sebelumnya`)
  const prev = useMemo(() => {
    if (!prevRows || !prevRows.length) return null
    return {
      name: prevLabel,
      videos: rollupVideos(prevRows, thresholds),
      creators: rollupCreators(prevRows, thresholds),
      products: rollupProducts(prevRows).map(p => ({ ...p, name: (p.productId && productNames[p.productId]) || null })),
      productsCard: rollupProductsCard(prevRows).map(p => ({ ...p, name: (p.productId && productNames[p.productId]) || null })),
      typeTotals: typeTotalsOf(prevRows),
      channels: rollupChannels(prevRows),
    }
  }, [prevRows, prevLabel, thresholds, productNames])

  // Strip "Hari ini" = angka hari TERAKHIR di scope (langsung dari totals-nya).
  const dailyDelta = useMemo(() => {
    if (period === 'all' || !scopeDays.length) return null
    const today = scopeDays[scopeDays.length - 1]
    const prevDay = scopeDays[scopeDays.length - 2]
    const t = today.totals || {}
    return {
      cost: t.cost || 0, revenue: t.revenue || 0, orders: t.orders || 0,
      roas: t.cost > 0 ? t.revenue / t.cost : null,
      windowLabel: 'Hari ini',
      firstOfMonth: !prevDay,
      prevName: prevDay?.name || null,
      label: today.name,
      date: today.snapshot_date,
    }
  }, [scopeDays, period])

  // Tren harian = angka tiap hari LANGSUNG (bukan selisih) dari totals ringkas.
  const trend = useMemo(() => scopeDays.map(s => {
    const t = s.totals || {}
    return { date: s.snapshot_date, label: s.name, cost: t.cost || 0, revenue: t.revenue || 0, roas: t.cost > 0 ? t.revenue / t.cost : null }
  }), [scopeDays])

  const windowLabel = windowLabelOf(windowDays)
  const periodName = effectiveRange
    ? fmtRangeLabel(effectiveRange.start, effectiveRange.end)
    : (period === 'all'
      ? `Semua bulan${windowDays !== 'month' ? ' · ' + windowLabel : ''}`
      : (selectedMonth ? `${monthLabel(selectedMonth)}${windowDays !== 'month' ? ' · ' + windowLabel : ''}` : null))
  const todayDate = scopeDays.length ? scopeDays[scopeDays.length - 1].snapshot_date : null

  const insights = useMemo(() => ({
    cards: insightCards(videos, thresholds),
    plan: actionPlan(videos, thresholds),
    framework: winningFramework(videos, hooks, thresholds),
  }), [videos, hooks, thresholds])

  // Persist + reload + enrich background. Dipakai bersama jalur xlsx & API.
  async function persistAndReload(parsed) {
    await saveImport(parsed, thresholds)
    await reload()
    setPeriod(null) // lompat ke bulan terbaru
    // Auto-scrape nama akun untuk video baru yang akunnya kosong (background).
    const targets = parsed.rows
      .filter(r => r.creativeType === 'Video' && r.videoId && !r.tiktokAccount)
      .map(r => r.videoId)
    runEnrich(targets).catch(() => {})
  }

  async function upload(file) {
    setBusy(true); setError(null)
    try {
      const parsed = await parseGmvMaxFile(file)
      await persistAndReload(parsed)
      return { ok: true, meta: parsed.meta }
    } catch (e) {
      setError(e.message)
      return { ok: false, error: e.message }
    } finally { setBusy(false) }
  }

  // Impor dataset yang SUDAH terparse ({ meta, rows }) — mis. hasil tarikan API
  // (lihat utils/gmvmaxApiService). Bentuk & persist identik dengan jalur xlsx.
  async function importDataset(parsed) {
    setBusy(true); setError(null)
    try {
      await persistAndReload(parsed)
      return { ok: true, meta: parsed.meta }
    } catch (e) {
      setError(e.message)
      return { ok: false, error: e.message }
    } finally { setBusy(false) }
  }

  async function removeImport(id) {
    setBusy(true)
    try { await deleteImport(id); await reload() }
    finally { setBusy(false) }
  }

  // Scrape username via oEmbed publik untuk kumpulan videoId → cache Supabase.
  async function runEnrich(candidateIds) {
    const cand = [...new Set((candidateIds || []).filter(Boolean))]
    if (!cand.length) return { ok: true, filled: 0 }
    const cached = await loadVideoMeta(cand).catch(() => ({}))
    if (Object.keys(cached).length) setMeta(prev => ({ ...prev, ...cached }))
    const targets = cand.filter(id => !cached[id] || cached[id].status === 'error')
    if (!targets.length) return { ok: true, filled: 0 }
    setEnriching({ done: 0, total: targets.length })
    try {
      const results = await enrichVideos(targets, {
        onProgress: (done, total) => setEnriching({ done, total }),
      })
      await saveVideoMeta(results)
      setMeta(prev => {
        const next = { ...prev }
        for (const r of results) next[r.videoId] = { username: r.username, authorName: r.authorName, status: r.status }
        return next
      })
      return { ok: true, filled: results.filter(r => r.status === 'ok').length }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setEnriching(null)
    }
  }

  function enrichUsernames() {
    return runEnrich(creativesEnriched
      .filter(c => c.creativeType === 'Video' && c.videoId && !c.tiktokAccount)
      .map(c => c.videoId))
  }

  async function updateThresholds(next) {
    await saveThresholds(next)
    setThresholds(next)
  }

  async function setNote(videoId, payload) {
    await upsertNote(videoId, payload)
    setNotes(await listNotes())
  }
  async function clearNote(videoId) {
    await deleteNote(videoId)
    setNotes(await listNotes())
  }

  async function logAction(entry) {
    const row = await addActionLog({ snapshotDate: todayDate, ...entry })
    setActionLog(prev => [row, ...prev])
    return row
  }
  async function removeActionLog(id) {
    await deleteActionLog(id)
    setActionLog(prev => prev.filter(r => r.id !== id))
  }

  // ── Boost Center ────────────────────────────────────────────────────────────
  async function requestBoost(v) {
    const row = await upsertBoost(v.videoId, {
      status: 'diminta', videoTitle: v.title, tiktokAccount: v.account, roas: v.lifetime?.roas ?? null,
    })
    setBoost(prev => ({ ...prev, [v.videoId]: row }))
    await logAction({
      videoId: v.videoId, videoTitle: v.title, tiktokAccount: v.account,
      actionTag: 'Boost', body: 'Minta kode boost ke kreator', roas: v.lifetime?.roas ?? null,
    })
    return row
  }
  async function updateBoost(videoId, patch) {
    const row = await upsertBoost(videoId, patch)
    setBoost(prev => ({ ...prev, [videoId]: row }))
    return row
  }
  async function removeBoost(videoId) {
    await deleteBoost(videoId)
    setBoost(prev => { const n = { ...prev }; delete n[videoId]; return n })
  }

  const value = {
    imports, creatives, rows, thresholds, notes, actionLog, boost, productNames,
    period, setPeriod, periodName, months,
    range: effectiveRange, setRange: setCustomRange, rangePresets, dateBounds,
    windowDays, setWindowDays, windows: WINDOWS,
    prev, dailyDelta, trend,
    videos, campaigns, creators, hooks, products, productsCard, dashboard, typeTotals, insights,
    channels, channelTrend,
    hasData: imports.length > 0,
    loading, busy, creativesLoading, error,
    missingAccountCount, enriching,
    upload, importDataset, removeImport, updateThresholds, setNote, clearNote, enrichUsernames,
    logAction, removeActionLog,
    requestBoost, updateBoost, removeBoost,
    reload,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
