/* eslint-disable react-refresh/only-export-components */
// Context modul GMV Max — model SNAPSHOT HARIAN (MTD).
// Tiap upload = 1 snapshot kumulatif bertanggal. Context memuat daftar snapshot
// (ringkas) sekali, lalu memuat baris creatives HANYA untuk snapshot yang sedang
// dilihat (+ snapshot pembanding harian) agar hemat memori. Angka "hari ini" =
// selisih snapshot terpilih − snapshot sebelumnya di bulan yang sama; tren =
// deret selisih harian dari `totals` ringkas tiap snapshot.
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { parseGmvMaxFile } from '../utils/parseGmvMax'
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
  rollupVideos, rollupCampaigns, rollupCreators, rollupHooks, rollupProducts, dashboardSummary,
} from '../utils/gmvmaxRollup'
import { insightCards, actionPlan, winningFramework } from '../utils/gmvmaxInsights'

const Ctx = createContext(null)
export function useGmvMax() { return useContext(Ctx) }

// Total per tipe creative (Video vs Product card vs semua) untuk sekumpulan
// baris. Dipakai headline Dashboard + delta harian (snapshot sebelumnya).
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

// Kunci bulan sebuah snapshot (untuk pengelompokan).
const monthKey = i => i.period_month || (i.snapshot_date ? i.snapshot_date.slice(0, 7) : i.name)
const sd = i => i.snapshot_date || ''

// 'YYYY-MM-DD' dikurangi n hari → 'YYYY-MM-DD'.
function daysBefore(iso, n) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// Pilihan jendela perbandingan (hari). 'month' = sejak awal bulan berjalan.
export const WINDOWS = [
  { d: 1, label: 'Hari ini', short: '1h' },
  { d: 3, label: '3 hari', short: '3h' },
  { d: 7, label: '7 hari', short: '7h' },
  { d: 30, label: '30 hari', short: '30h' },
]

export function GmvMaxProvider({ children }) {
  const [imports, setImports] = useState([])   // snapshot (ringkas, tanpa creatives)
  const [creatives, setCreatives] = useState([])
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [notes, setNotes] = useState({})
  const [actionLog, setActionLog] = useState([]) // jurnal optimasi (append)
  const [boost, setBoost] = useState({})         // video_id → entri boost pipeline
  const [productNames, setProductNames] = useState({}) // kode_produk → nama (menu Produk)
  const [meta, setMeta] = useState({})          // video_id → {username, authorName, status}
  const [enriching, setEnriching] = useState(null) // {done,total} saat scraping akun
  const [period, setPeriod] = useState(null)    // null=terbaru | 'all' | import.id
  const [windowDays, setWindowDays] = useState(1) // jendela perbandingan (1/3/7/30 hari)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Muat metadata ringan (snapshot + threshold + notes + nama produk). TIDAK
  // memuat creatives di sini — itu ditangani efek terpisah per snapshot terpilih.
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

  // ── Snapshot & pemilihan ────────────────────────────────────────────────────
  // Snapshot terbaru per bulan — dipakai tampilan "Semua (per bulan)" agar tidak
  // menjumlahkan snapshot kumulatif dalam bulan yang sama (double-count).
  const latestPerMonth = useMemo(() => {
    const best = new Map()
    for (const i of imports) {
      const k = monthKey(i)
      const cur = best.get(k)
      if (!cur || sd(i) > sd(cur)) best.set(k, i)
    }
    return [...best.values()]
  }, [imports])

  // Snapshot yang sedang dilihat (null period → snapshot terbaru).
  const selectedImport = useMemo(() => {
    if (period === 'all') return null
    if (period == null) return imports[0] || null
    return imports.find(i => i.id === period) || imports[0] || null
  }, [imports, period])

  // Snapshot pembanding sesuai jendela: snapshot terbaru yang tanggalnya ≤
  // (tanggal terpilih − windowDays), dalam bulan yang sama. Bila target jatuh
  // sebelum awal bulan (jendela melewati batas bulan) → null = baseline nol =
  // "sejak awal bulan" (angka MTD penuh). windowDays=1 → sama seperti "kemarin".
  const prevSnapshot = useMemo(() => {
    if (period === 'all' || !selectedImport || !selectedImport.snapshot_date) return null
    const pm = monthKey(selectedImport), s = sd(selectedImport)
    const target = daysBefore(s, windowDays)
    if (target.slice(0, 7) !== s.slice(0, 7)) return null   // lewat batas bulan
    let best = null
    for (const i of imports) {
      if (i.id === selectedImport.id || monthKey(i) !== pm || !i.snapshot_date) continue
      if (sd(i) > target) continue
      if (!best || sd(i) > sd(best)) best = i
    }
    return best
  }, [imports, selectedImport, period, windowDays])

  // Snapshot yang creatives-nya perlu dimuat untuk view saat ini.
  const neededIds = useMemo(() => {
    const ids = new Set()
    if (period === 'all') latestPerMonth.forEach(i => ids.add(i.id))
    else if (selectedImport) {
      ids.add(selectedImport.id)
      if (prevSnapshot) ids.add(prevSnapshot.id)
    }
    return [...ids].sort()
  }, [period, latestPerMonth, selectedImport, prevSnapshot])

  // Muat creatives (+ video meta) hanya untuk snapshot yang dibutuhkan.
  const neededKey = neededIds.join(',')
  useEffect(() => {
    let active = true
    ;(async () => {
      if (!neededIds.length) { if (active) setCreatives([]); return }
      try {
        const cre = await loadCreatives(neededIds)
        if (!active) return
        setCreatives(cre)
        const vids = cre.filter(c => c.creativeType === 'Video' && c.videoId).map(c => c.videoId)
        const loaded = await loadVideoMeta(vids)
        // Merge (bukan replace) agar hasil scraping otomatis tak tertimpa.
        if (active) setMeta(prev => ({ ...prev, ...loaded }))
      } catch (e) { if (active) setError(e.message) }
    })()
    return () => { active = false }
  }, [neededKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Turunan ─────────────────────────────────────────────────────────────────
  // Isi akun kosong dari cache meta. Utamakan username (handle) yang bersih.
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

  // Baris kreatif sesuai view: snapshot terpilih, atau (all) gabungan snapshot
  // terbaru per bulan — keduanya sudah termuat di `creativesEnriched`.
  const rows = useMemo(() => {
    if (period === 'all') {
      const names = new Set(latestPerMonth.map(i => i.name))
      return creativesEnriched.filter(c => names.has(c.periodName))
    }
    if (!selectedImport) return creativesEnriched
    return creativesEnriched.filter(c => c.periodName === selectedImport.name)
  }, [creativesEnriched, period, selectedImport, latestPerMonth])

  const videos = useMemo(() => rollupVideos(rows, thresholds), [rows, thresholds])
  const campaigns = useMemo(() => rollupCampaigns(rows), [rows])
  const creators = useMemo(() => rollupCreators(rows, thresholds), [rows, thresholds])
  const hooks = useMemo(() => rollupHooks(rows, thresholds), [rows, thresholds])
  const products = useMemo(() => rollupProducts(rows).map(p => ({
    ...p, name: (p.productId && productNames[p.productId]) || null,
  })), [rows, productNames])
  const dashboard = useMemo(() => dashboardSummary(videos, thresholds), [videos, thresholds])
  const typeTotals = useMemo(() => typeTotalsOf(rows), [rows])

  // ── Delta harian (vs snapshot sebelumnya, sebulan) ──────────────────────────
  const prevRows = useMemo(
    () => (prevSnapshot ? creativesEnriched.filter(c => c.periodName === prevSnapshot.name) : null),
    [creativesEnriched, prevSnapshot])
  const prev = useMemo(() => {
    if (!prevSnapshot || !prevRows) return null
    return {
      name: prevSnapshot.name,
      videos: rollupVideos(prevRows, thresholds),
      creators: rollupCreators(prevRows, thresholds),
      products: rollupProducts(prevRows).map(p => ({ ...p, name: (p.productId && productNames[p.productId]) || null })),
      typeTotals: typeTotalsOf(prevRows),
    }
  }, [prevRows, prevSnapshot, thresholds, productNames])

  // Angka incremental untuk jendela terpilih = snapshot terpilih − pembanding.
  // Bila pembanding null (jendela melewati awal bulan) → pertumbuhan sejak awal
  // bulan (MTD penuh).
  const dailyDelta = useMemo(() => {
    if (period === 'all' || !selectedImport) return null
    const cur = typeTotals.all
    const base = prev?.typeTotals?.all || { cost: 0, revenue: 0, orders: 0 }
    const cost = (cur.cost || 0) - (base.cost || 0)
    const revenue = (cur.revenue || 0) - (base.revenue || 0)
    const orders = (cur.orders || 0) - (base.orders || 0)
    const w = WINDOWS.find(x => x.d === windowDays) || WINDOWS[0]
    return {
      cost, revenue, orders,
      roas: cost > 0 ? revenue / cost : null,
      window: windowDays,
      windowLabel: w.d === 1 ? 'Hari ini' : `${w.d} hari terakhir`,
      firstOfMonth: !prevSnapshot,          // baseline nol = sejak awal bulan
      prevName: prevSnapshot?.name || null,
      date: selectedImport.snapshot_date,
      label: selectedImport.name,
    }
  }, [period, selectedImport, prevSnapshot, typeTotals, prev, windowDays])

  // Tren harian (incremental) sepanjang bulan snapshot terpilih — dari `totals`
  // ringkas tiap snapshot, jadi tak perlu memuat semua creatives.
  const trend = useMemo(() => {
    if (period === 'all' || !selectedImport) return []
    const pm = monthKey(selectedImport), upto = sd(selectedImport)
    const snaps = imports
      .filter(i => monthKey(i) === pm && i.snapshot_date && sd(i) <= upto)
      .sort((a, b) => (sd(a) < sd(b) ? -1 : 1))
    const out = []
    let prevT = null
    for (const s of snaps) {
      const t = s.totals || {}
      const cost = (t.cost || 0) - (prevT ? (prevT.cost || 0) : 0)
      const revenue = (t.revenue || 0) - (prevT ? (prevT.revenue || 0) : 0)
      out.push({
        date: s.snapshot_date, label: s.name,
        cost, revenue, roas: cost > 0 ? revenue / cost : null,
        cumCost: t.cost || 0, cumRevenue: t.revenue || 0,
      })
      prevT = t
    }
    return out
  }, [imports, selectedImport, period])

  const periodName = selectedImport?.name || (period === 'all' ? 'Semua (per bulan)' : null)
  const insights = useMemo(() => ({
    cards: insightCards(videos, thresholds),
    plan: actionPlan(videos, thresholds),
    framework: winningFramework(videos, hooks, thresholds),
  }), [videos, hooks, thresholds])

  async function upload(file) {
    setBusy(true); setError(null)
    try {
      const parsed = await parseGmvMaxFile(file)
      await saveImport(parsed, thresholds)
      await reload()
      // Lompat ke snapshot yang baru diunggah (jadi paling baru → period=null).
      setPeriod(null)
      // Auto-scrape nama akun untuk video baru yang akunnya kosong — jalan di
      // latar belakang (tak memblok), progresnya tampil via `enriching`.
      const targets = parsed.rows
        .filter(r => r.creativeType === 'Video' && r.videoId && !r.tiktokAccount)
        .map(r => r.videoId)
      runEnrich(targets).catch(() => {})
      return { ok: true, meta: parsed.meta }
    } catch (e) {
      setError(e.message)
      return { ok: false, error: e.message }
    } finally { setBusy(false) }
  }

  async function removeImport(id) {
    setBusy(true)
    try {
      await deleteImport(id)
      if (period === id) setPeriod(null)
      await reload()
    } finally { setBusy(false) }
  }

  // Scrape username via oEmbed publik untuk kumpulan videoId → cache Supabase.
  // Cek cache DB dulu agar tak mengulang yang sudah 'ok'/'notfound'.
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

  // Tombol manual: scrape yang akunnya masih kosong di view sekarang.
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

  // Tambah entri ke Log Optimasi (append). Melampirkan konteks snapshot terpilih.
  async function logAction(entry) {
    const row = await addActionLog({ snapshotDate: selectedImport?.snapshot_date || null, ...entry })
    setActionLog(prev => [row, ...prev])
    return row
  }
  async function removeActionLog(id) {
    await deleteActionLog(id)
    setActionLog(prev => prev.filter(r => r.id !== id))
  }

  // ── Boost Center ────────────────────────────────────────────────────────────
  // Masukkan video ke pipeline boost (status 'diminta') + catat ke Log Optimasi.
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
    period, setPeriod, periodName,
    windowDays, setWindowDays, windows: WINDOWS,
    selectedImport, prevSnapshot, latestPerMonth, prev, dailyDelta, trend,
    videos, campaigns, creators, hooks, products, dashboard, typeTotals, insights,
    hasData: imports.length > 0,
    loading, busy, error,
    missingAccountCount, enriching,
    upload, removeImport, updateThresholds, setNote, clearNote, enrichUsernames,
    logAction, removeActionLog,
    requestBoost, updateBoost, removeBoost,
    reload,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
