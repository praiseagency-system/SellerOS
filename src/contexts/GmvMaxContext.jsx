/* eslint-disable react-refresh/only-export-components */
// Context modul GMV Max: memuat imports + creatives + threshold + notes sekali,
// lalu menghitung rollup/insight (memoized) untuk dibagi ke semua sub-halaman.
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { parseGmvMaxFile } from '../utils/parseGmvMax'
import { listImports, loadCreatives, saveImport, deleteImport } from '../data/gmvmaxImports'
import { getThresholds, saveThresholds } from '../data/gmvmaxSettings'
import { listNotes, upsertNote, deleteNote } from '../data/gmvmaxNotes'
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

export function GmvMaxProvider({ children }) {
  const [imports, setImports] = useState([])
  const [creatives, setCreatives] = useState([])
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [notes, setNotes] = useState({})
  const [productNames, setProductNames] = useState({}) // kode_produk → nama (menu Produk)
  const [meta, setMeta] = useState({})          // video_id → {username, authorName, status}
  const [enriching, setEnriching] = useState(null) // {done,total} saat scraping akun
  const [period, setPeriod] = useState('all')   // 'all' | import.id
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    const [imps, th, nts, prods] = await Promise.all([
      listImports(), getThresholds(), listNotes(), listProducts().catch(() => []),
    ])
    setImports(imps)
    setThresholds(th)
    setNotes(nts)
    // Peta nama produk dari menu Produk. Product ID TikTok bisa di `kode_produk`
    // (produk dari data performa) ATAU `catalog.productCode` (hasil Import Katalog).
    const nameMap = {}
    for (const p of prods) {
      const code = p.kode_produk || p.catalog?.productCode
      if (code) nameMap[String(code).trim()] = p.name
    }
    setProductNames(nameMap)
    const cre = await loadCreatives()
    setCreatives(cre)
    const vids = cre.filter(c => c.creativeType === 'Video' && c.videoId).map(c => c.videoId)
    setMeta(await loadVideoMeta(vids))
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try { await reload() } catch (e) { if (active) setError(e.message) }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [reload])

  // Isi akun kosong dari cache meta. Utamakan username (handle) yang selalu
  // bersih; buang display name sampah ("@"/kosong).
  const creativesEnriched = useMemo(() => creatives.map(c => {
    if (c.creativeType === 'Video' && c.videoId && !c.tiktokAccount) {
      const m = meta[c.videoId]
      const an = m?.authorName && m.authorName.trim() !== '@' ? m.authorName.trim() : null
      const name = m?.username || an
      if (name) return { ...c, tiktokAccount: name, tiktokUsername: m.username || null }
    }
    return c
  }), [creatives, meta])

  // Hitung video yang masih perlu di-scrape: belum pernah, atau error (retry).
  // Yang 'ok'/'notfound' tak dihitung lagi (sudah dicoba).
  const missingAccountCount = useMemo(
    () => new Set(creativesEnriched
      .filter(c => c.creativeType === 'Video' && c.videoId && !c.tiktokAccount
        && (!meta[c.videoId] || meta[c.videoId].status === 'error'))
      .map(c => c.videoId)).size,
    [creativesEnriched, meta])

  // Baris kreatif sesuai periode terpilih.
  const rows = useMemo(() => {
    if (period === 'all') return creativesEnriched
    const imp = imports.find(i => i.id === period)
    if (!imp) return creativesEnriched
    return creativesEnriched.filter(c => c.periodName === imp.name)
  }, [creativesEnriched, imports, period])

  const videos = useMemo(() => rollupVideos(rows, thresholds), [rows, thresholds])
  const campaigns = useMemo(() => rollupCampaigns(rows), [rows])
  const creators = useMemo(() => rollupCreators(rows, thresholds), [rows, thresholds])
  const hooks = useMemo(() => rollupHooks(rows, thresholds), [rows, thresholds])
  const products = useMemo(() => rollupProducts(rows).map(p => ({
    ...p, name: (p.productId && productNames[p.productId]) || null,
  })), [rows, productNames])
  const dashboard = useMemo(() => dashboardSummary(videos, thresholds), [videos, thresholds])

  // Total per tipe creative (Video vs Product card vs semua) untuk headline
  // Dashboard — transparan, tak menyembunyikan revenue Product card.
  const typeTotals = useMemo(() => {
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
  }, [rows])
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

  // Scrape username untuk video yang akunnya kosong (oEmbed publik) → cache Supabase.
  async function enrichUsernames() {
    const targets = [...new Set(creativesEnriched
      .filter(c => c.creativeType === 'Video' && c.videoId && !c.tiktokAccount
        && (!meta[c.videoId] || meta[c.videoId].status === 'error'))
      .map(c => c.videoId))]
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

  const value = {
    imports, creatives, rows, thresholds, notes, productNames,
    period, setPeriod,
    videos, campaigns, creators, hooks, products, dashboard, typeTotals, insights,
    hasData: creatives.length > 0,
    loading, busy, error,
    missingAccountCount, enriching,
    upload, removeImport, updateThresholds, setNote, clearNote, enrichUsernames,
    reload,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
