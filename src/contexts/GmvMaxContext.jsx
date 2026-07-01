/* eslint-disable react-refresh/only-export-components */
// Context modul GMV Max: memuat imports + creatives + threshold + notes sekali,
// lalu menghitung rollup/insight (memoized) untuk dibagi ke semua sub-halaman.
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { parseGmvMaxFile } from '../utils/parseGmvMax'
import { listImports, loadCreatives, saveImport, deleteImport } from '../data/gmvmaxImports'
import { getThresholds, saveThresholds } from '../data/gmvmaxSettings'
import { listNotes, upsertNote, deleteNote } from '../data/gmvmaxNotes'
import { DEFAULT_THRESHOLDS } from '../utils/gmvmaxClassify'
import {
  rollupVideos, rollupCampaigns, rollupCreators, rollupHooks, dashboardSummary,
} from '../utils/gmvmaxRollup'
import { insightCards, actionPlan, winningFramework } from '../utils/gmvmaxInsights'

const Ctx = createContext(null)
export function useGmvMax() { return useContext(Ctx) }

export function GmvMaxProvider({ children }) {
  const [imports, setImports] = useState([])
  const [creatives, setCreatives] = useState([])
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS)
  const [notes, setNotes] = useState({})
  const [period, setPeriod] = useState('all')   // 'all' | import.id
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    const [imps, th, nts] = await Promise.all([listImports(), getThresholds(), listNotes()])
    setImports(imps)
    setThresholds(th)
    setNotes(nts)
    setCreatives(await loadCreatives())
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try { await reload() } catch (e) { if (active) setError(e.message) }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [reload])

  // Baris kreatif sesuai periode terpilih.
  const rows = useMemo(() => {
    if (period === 'all') return creatives
    const imp = imports.find(i => i.id === period)
    if (!imp) return creatives
    return creatives.filter(c => c.periodName === imp.name)
  }, [creatives, imports, period])

  const videos = useMemo(() => rollupVideos(rows, thresholds), [rows, thresholds])
  const campaigns = useMemo(() => rollupCampaigns(rows), [rows])
  const creators = useMemo(() => rollupCreators(rows, thresholds), [rows, thresholds])
  const hooks = useMemo(() => rollupHooks(rows, thresholds), [rows, thresholds])
  const dashboard = useMemo(() => dashboardSummary(videos, thresholds), [videos, thresholds])
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
    imports, creatives, rows, thresholds, notes,
    period, setPeriod,
    videos, campaigns, creators, hooks, dashboard, insights,
    hasData: creatives.length > 0,
    loading, busy, error,
    upload, removeImport, updateThresholds, setNote, clearNote,
    reload,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
