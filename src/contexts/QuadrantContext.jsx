/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useMemo, useEffect } from 'react'
import { parseShopeeData, parseIklanData } from '../utils/parseShopeeData'
import { parseTikTokData, parseTikTokAdData } from '../utils/parseTikTokData'
import { getQuadrant, getTrafficThreshold } from '../utils/quadrantUtils'
import { compareProducts } from '../utils/compareData'
import { pickPreviousSession } from '../utils/storage'
import { buildRangeView, previousRange } from '../utils/quadrantAggregate'
import { listSessions, saveSession } from '../data/periods'

export const PLATFORM_DEFAULTS = {
  shopee: { periodDays: 30, targetHarian: 20,  conversionThreshold: 2.0 },
  tiktok: { periodDays: 30, targetHarian: 15,  conversionThreshold: 1.0 },
}

export const PLATFORM_LABELS = {
  shopee: { name: 'Shopee',      traffic: 'Pengunjung' },
  tiktok: { name: 'TikTok Shop', traffic: 'Impresi'   },
}


const Ctx = createContext(null)
export function useQuadrant() { return useContext(Ctx) }

export function QuadrantProvider({ children, onSessionsChange }) {
  const [products, setProducts] = useState([])
  const [platform, setPlatform] = useState('shopee')
  const [settings, setSettings] = useState(PLATFORM_DEFAULTS.shopee)
  const [activeTab, setActiveTab] = useState('kuadran')
  const [activeQuadrant, setActiveQuadrant] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [hasIklan, setHasIklan] = useState(false)
  const [isCompareMode, setIsCompareMode] = useState(false)
  const [prevLabel, setPrevLabel] = useState(null)
  const [periodLabel, setPeriodLabel] = useState(null)
  const [periodValue, setPeriodValue] = useState(null) // 'YYYY-MM' periode aktif (utk header MonthPicker)
  const [periodType, setPeriodType] = useState(null)
  const [sessions, setSessions] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  // Pilihan tampilan (di luar sesi yang dimuat): marketplace mana & rentang apa.
  // null = ikut sesi aktif — jalur lama, tak ada agregasi.
  const [marketplace, setMarketplace] = useState(null)   // null | 'all' | 'shopee' | 'tiktok'
  const [range, setRange] = useState(null)               // null | {mode,month,from,to}

  const availableMonths = useMemo(
    () => [...new Set((sessions || []).map(s => s.periodValue).filter(v => /^\d{4}-\d{2}$/.test(v || '')))].sort(),
    [sessions],
  )
  const availablePlatforms = useMemo(
    () => [...new Set((sessions || []).map(s => s.platform))],
    [sessions],
  )
  const effMarketplace = marketplace || platform
  const effRange = useMemo(
    () => range || (periodValue ? { mode: 'month', month: periodValue } : { mode: 'lifetime' }),
    [range, periodValue],
  )
  // Jalur turunan dipakai hanya kalau tampilan menyimpang dari sesi yang dimuat.
  const useDerived = effRange.mode !== 'month' || effMarketplace === 'all' ||
    (!!marketplace && marketplace !== platform)

  // Gabungan lintas periode / marketplace + pembanding rentang setara.
  const derived = useMemo(() => {
    if (!useDerived || !sessions.length) return null
    const plats = effMarketplace === 'all' ? availablePlatforms : [effMarketplace]
    const cur = buildRangeView(sessions, effRange, plats, PLATFORM_DEFAULTS)
    if (!cur.products.length) return { ...cur, hasPrev: false }
    const pr = previousRange(effRange)
    const prev = pr ? buildRangeView(sessions, pr, plats, PLATFORM_DEFAULTS) : null
    const hasPrev = !!(prev && prev.products.length)
    return {
      ...cur,
      hasPrev,
      products: hasPrev ? compareProducts(cur.products, prev.products, cur.settings) : cur.products,
    }
  }, [useDerived, sessions, effMarketplace, effRange, availablePlatforms])

  const trafficThreshold = useMemo(
    () => getTrafficThreshold(derived?.settings || settings),
    [derived, settings],
  )
  const effectiveSettings = useMemo(
    () => ({ ...(derived?.settings || settings), trafficThreshold }),
    [derived, settings, trafficThreshold],
  )

  // Produk turunan sudah membawa kuadrannya sendiri (dihitung dengan ambang
  // platform & jumlah periode masing-masing) — jangan dihitung ulang di sini.
  const productsWithQuadrant = useMemo(
    () => derived ? derived.products : products.map(p => ({ ...p, quadrant: getQuadrant(p, settings) })),
    [derived, products, settings]
  )

  const filteredProducts = useMemo(
    () => activeQuadrant
      ? productsWithQuadrant.filter(p => p.quadrant === activeQuadrant)
      : productsWithQuadrant,
    [productsWithQuadrant, activeQuadrant]
  )

  // periodLabel/periodValue/periodDays come from the Import page period picker.
  async function handleUpload({ platform: plat, perf, iklan, iklanFiles = [], periodLabel: pLabel, periodValue, periodDays, periodType: pType }) {
    setIsLoading(true)
    setError(null)
    try {
      const parse = plat === 'tiktok' ? parseTikTokData : parseShopeeData
      const days = periodDays ?? PLATFORM_DEFAULTS[plat].periodDays
      const newSettings = { ...PLATFORM_DEFAULTS[plat], periodDays: days }
      const newEff = { ...newSettings, trafficThreshold: getTrafficThreshold(newSettings) }

      const currData = await parse(perf)

      let roasMap = null
      if (plat === 'tiktok' && iklanFiles.length > 0) {
        roasMap = await parseTikTokAdData(iklanFiles)
      } else if (plat === 'shopee' && iklan) {
        roasMap = await parseIklanData(iklan)
      }
      if (roasMap) currData.forEach(p => { if (roasMap.has(p.kode_produk)) p.roas = roasMap.get(p.kode_produk) })

      const currWithQ = currData.map(p => ({ ...p, quadrant: getQuadrant(p, newSettings) }))
      const label = `${pLabel} · ${PLATFORM_LABELS[plat]?.name}`

      await saveSession({
        label, platform: plat, periodValue, periodType: pType, settings: newEff, products: currWithQ,
      })
      const saved = await listSessions()
      setSessions(saved)

      const prev = pickPreviousSession(saved, plat, periodValue)
      let displayProducts = currWithQ
      if (prev) {
        const prevWithQ = prev.products.map(p => ({ ...p, quadrant: getQuadrant(p, newSettings) }))
        displayProducts = compareProducts(currWithQ, prevWithQ, newSettings)
        setIsCompareMode(true)
        setPrevLabel(prev.label.replace(/ · .*$/, ''))
        setActiveTab('perubahan')
      } else {
        setIsCompareMode(false)
        setPrevLabel(null)
        setActiveTab('kuadran')
      }

      setPlatform(plat)
      setSettings(newSettings)
      setHasIklan(!!roasMap)
      setPeriodLabel(pLabel)
      setPeriodValue(periodValue ?? null)
      setPeriodType(pType ?? null)
      setProducts(displayProducts)
      setActiveQuadrant(null)
      onSessionsChange?.()
      return true
    } catch (e) {
      setError(e.message)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  // Rebuild the active view from a saved session (riwayat periode). Mirrors the
  // post-parse part of handleUpload, but reads products from localStorage instead
  // of re-parsing an Excel file. Used for auto-restore on mount + "Buka" di riwayat.
  function loadSession(session, allSessions = sessions) {
    if (!session) return
    // Membuka sesi dari riwayat/picker mengembalikan tampilan ke jalur normal
    // (satu bulan, satu marketplace) supaya tak ada sisa filter yang menempel.
    setMarketplace(null)
    setRange(null)
    const plat = session.platform
    const sett = session.settings || PLATFORM_DEFAULTS[plat]
    const currWithQ = session.products.map(p => ({ ...p, quadrant: getQuadrant(p, sett) }))

    const prev = pickPreviousSession(allSessions, plat, session.periodValue)
    let displayProducts = currWithQ
    if (prev && prev.id !== session.id) {
      const prevWithQ = prev.products.map(p => ({ ...p, quadrant: getQuadrant(p, sett) }))
      displayProducts = compareProducts(currWithQ, prevWithQ, sett)
      setIsCompareMode(true)
      setPrevLabel(prev.label.replace(/ · .*$/, ''))
      setActiveTab('perubahan')
    } else {
      setIsCompareMode(false)
      setPrevLabel(null)
      setActiveTab('kuadran')
    }

    setPlatform(plat)
    setSettings(sett)
    setHasIklan(session.products.some(p => p.roas != null))
    setPeriodLabel(session.label.replace(/ · .*$/, ''))
    setPeriodValue(session.periodValue ?? null)
    setPeriodType(session.periodType ?? null)
    setProducts(displayProducts)
    setActiveQuadrant(null)
  }

  // Auto-restore the most recent saved period when this workspace mounts, so a
  // browser reload (or workspace switch) doesn't show an empty view while the
  // data is still in localStorage. Runs once per mount (provider remounts on
  // workspace change via wsKey).
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const saved = await listSessions()
        if (!active) return
        setSessions(saved)
        if (saved.length > 0) loadSession(saved[0], saved)
      } catch (e) {
        console.error('Gagal memuat sesi:', e)
      }
    })()
    return () => { active = false }
    // Restore sekali saat mount; loadSession sengaja tidak jadi dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateSetting(key, val) { setSettings(s => ({ ...s, [key]: val })) }
  async function refreshSessions() {
    const saved = await listSessions()
    setSessions(saved)
    onSessionsChange?.()
  }

  const value = {
    products, productsWithQuadrant, filteredProducts,
    platform, settings, effectiveSettings, trafficThreshold,
    activeTab, setActiveTab,
    activeQuadrant, setActiveQuadrant,
    isLoading, error,
    hasIklan,
    isCompareMode: derived ? derived.hasPrev : isCompareMode,
    prevLabel, periodLabel, periodValue, periodType,
    hasData: (derived ? derived.products.length : products.length) > 0,
    sessions, refreshSessions, loadSession,
    // Pemilih marketplace & rentang
    marketplace, setMarketplace, effMarketplace,
    range, setRange, effRange,
    availableMonths, availablePlatforms,
    derivedMeta: derived
      ? { periods: derived.periods, platforms: derived.platforms, matched: derived.matched, single: derived.single, hasPrev: derived.hasPrev }
      : null,
    showHistory, setShowHistory,
    handleUpload, updateSetting,
    platformLabels: PLATFORM_LABELS,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
