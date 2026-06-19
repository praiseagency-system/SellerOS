import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Upload, FileSpreadsheet, X, TrendingUp, Store, CalendarRange, Sparkles, AlertTriangle,
  Package, Tags, Clock, MapPin, CreditCard, Truck,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  ComposedChart, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import { ingestFile } from '../utils/storeIngest'
import { mergeUpload, removeFileFrom, blendedLogistics } from '../utils/storeData'
import { loadStore, saveStore, clearStore } from '../data/storeDataset'
import { computeStore, quickInsights } from '../utils/storeAnalytics'
import { listVouchers } from '../data/vouchers'
import { matchVouchersToAmount } from '../utils/voucher'

const MP_COLOR = { Shopee: '#f97316', TikTok: '#22d3ee', Tokopedia: '#22c55e' }
const fmtRp = n => 'Rp' + Math.round(n || 0).toLocaleString('id-ID')
const fmtRpShort = n => {
  const a = Math.abs(n || 0)
  if (a >= 1e9) return 'Rp' + (n / 1e9).toFixed(1) + 'M'
  if (a >= 1e6) return 'Rp' + (n / 1e6).toFixed(1) + 'jt'
  if (a >= 1e3) return 'Rp' + (n / 1e3).toFixed(0) + 'rb'
  return 'Rp' + Math.round(n || 0)
}
const fmtNum = n => (n || 0).toLocaleString('id-ID')
const pct = n => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`)
const growthCls = n => (n == null ? 'text-ink-faint' : n >= 0 ? 'text-green-400' : 'text-red-400')

export default function StorePerformancePage() {
  const [store, setStore] = useState({ files: [], lines: [] })
  const [tab, setTab] = useState('ringkasan')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)
  const [mpFilter, setMpFilter] = useState('all')
  const [vouchers, setVouchers] = useState([])
  const fileRef = useRef(null)

  // Muat voucher (untuk cocokkan nominal voucher pesanan → nama voucher).
  useEffect(() => {
    let active = true
    listVouchers().then(vs => { if (active) setVouchers(vs) }).catch(() => {})
    return () => { active = false }
  }, [])

  // Muat dataset toko dari Supabase (di-scope ke workspace aktif).
  useEffect(() => {
    let active = true
    loadStore()
      .then(s => { if (active) setStore(s) })
      .catch(e => { console.error(e); if (active) setError('Gagal memuat data toko.') })
    return () => { active = false }
  }, [])

  // Daftar marketplace yang ada di dataset (untuk filter bila >1 sumber).
  const mpOptions = useMemo(() => [...new Set(store.lines.map(l => l.m))].sort(), [store])
  const mp = mpOptions.includes(mpFilter) ? mpFilter : 'all'

  const stats = useMemo(() => {
    const lines = mp === 'all' ? store.lines : store.lines.filter(l => l.m === mp)
    return lines.length ? computeStore(lines) : null
  }, [store, mp])
  const insights = useMemo(() => (stats ? quickInsights(stats) : []), [stats])

  // Estimasi biaya logistik (LSF) selalu dari order TikTok saja, tak ikut filter.
  const tiktokLSF = useMemo(() => blendedLogistics(store), [store])

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setBusy(true); setError(null); setWarning(null)
    try {
      let cur = store
      for (const f of files) {
        const res = await ingestFile(f)
        cur = mergeUpload(cur, res)
      }
      await saveStore(cur)
      setStore({ ...cur })
    } catch (e) {
      setError(e.message || 'Gagal memproses file.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleRemove(name) {
    const next = removeFileFrom(store, name)
    try { await saveStore(next); setStore(next) }
    catch (e) { console.error(e); setError('Gagal menghapus file.') }
  }
  async function handleClear() {
    try { await clearStore(); setStore({ files: [], lines: [] }) }
    catch (e) { console.error(e); setError('Gagal menghapus data.') }
  }

  const TABS = [
    { id: 'ringkasan', label: 'Ringkasan', icon: Sparkles },
    { id: 'marketplace', label: 'Marketplace', icon: Store },
    { id: 'mingguan', label: 'Mingguan', icon: CalendarRange },
    { id: 'produk', label: 'Produk', icon: Package },
    ...(stats?.flags.hasCategory ? [{ id: 'kategori', label: 'Kategori', icon: Tags }] : []),
    { id: 'waktu', label: 'Waktu', icon: Clock },
    { id: 'lokasi', label: 'Lokasi', icon: MapPin },
    { id: 'transaksi', label: 'Transaksi', icon: CreditCard },
  ]

  return (
    <div className="p-6 max-w-5xl">
      {/* Upload zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
        className="border-2 border-dashed border-line/15 rounded-2xl p-6 text-center hover:border-blue-600/40 transition-colors"
      >
        <input ref={fileRef} type="file" accept=".xlsx,.csv" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />
        <div className="w-11 h-11 rounded-2xl bg-blue-600/10 flex items-center justify-center mx-auto mb-2">
          <Upload className="w-5 h-5 text-blue-500" />
        </div>
        <p className="text-sm font-medium text-ink-strong">{busy ? 'Memproses...' : 'Upload Laporan Pesanan Bulanan'}</p>
        <p className="text-xs text-ink-faint mt-1">Shopee / TikTok / Tokopedia · XLSX atau CSV · deteksi & analitik otomatis</p>
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="mt-3 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors">
          Pilih File
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-sm text-red-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}
      {warning && (
        <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-sm text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{warning}
        </div>
      )}

      {/* File chips */}
      {store.files.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {store.files.map(f => (
            <span key={f.name} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-fill/5 border border-line/10 text-xs text-ink-muted">
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-medium text-ink">{f.source === 'shopee' ? 'Shopee' : 'TikTok/Tokopedia'}</span>
              · {f.months.join(', ')} · {fmtNum(f.count)} baris
              <button onClick={() => handleRemove(f.name)} className="text-ink-faint hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
          <button onClick={handleClear} className="text-xs text-ink-faint hover:text-red-400 ml-1">Hapus semua</button>
        </div>
      )}

      {!stats ? (
        <div className="mt-6 bg-surface border border-line/8 rounded-2xl flex flex-col items-center justify-center text-center p-12 min-h-[260px]">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center mb-3">
            <TrendingUp className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-sm font-medium text-ink">Upload sekali, dashboard langsung jadi</p>
          <p className="text-xs text-ink-faint mt-1 max-w-[280px]">Deteksi marketplace, normalisasi, pembagian mingguan, dan analitik — semua otomatis tanpa setup.</p>
        </div>
      ) : (
        <>
          {/* Filter marketplace — hanya muncul bila ada >1 sumber */}
          {mpOptions.length > 1 && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-muted">Marketplace:</span>
              {['all', ...mpOptions].map(opt => (
                <button key={opt} onClick={() => setMpFilter(opt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    mp === opt ? 'bg-blue-600 text-white border-transparent' : 'border-line/15 text-ink-muted hover:text-ink hover:border-line/30'
                  }`}>
                  {opt === 'all' ? 'Semua' : opt}
                </button>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className={`${mpOptions.length > 1 ? 'mt-4' : 'mt-6'} mb-4 flex gap-1.5 border-b border-line/8`}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-ink-muted hover:text-ink'
                }`}>
                <t.icon className="w-4 h-4" />{t.label}
              </button>
            ))}
            <span className="ml-auto self-center text-xs text-ink-faint">{stats.months.join(', ')}</span>
          </div>

          {tab === 'ringkasan' && <Ringkasan stats={stats} insights={insights} />}
          {tab === 'marketplace' && <Marketplace stats={stats} />}
          {tab === 'mingguan' && <Mingguan stats={stats} />}
          {tab === 'produk' && <Produk stats={stats} />}
          {tab === 'kategori' && <Kategori stats={stats} />}
          {tab === 'waktu' && <Waktu stats={stats} />}
          {tab === 'lokasi' && <Lokasi stats={stats} mp={mp} lsf={tiktokLSF} />}
          {tab === 'transaksi' && <Transaksi stats={stats} vouchers={vouchers} />}
        </>
      )}
    </div>
  )
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="bg-surface border border-line/8 rounded-2xl p-4">
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className="text-xl font-bold text-ink-strong tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-ink-faint mt-0.5">{sub}</p>}
    </div>
  )
}

function Ringkasan({ stats, insights }) {
  const o = stats.overview
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total GMV" value={fmtRpShort(o.gmv)} sub={fmtRp(o.gmv)} />
        <KpiCard label="Total Pesanan" value={fmtNum(o.orders)} />
        <KpiCard label="Total Pembeli" value={fmtNum(o.buyers)} />
        <KpiCard label="Unit Terjual" value={fmtNum(o.units)} />
        <KpiCard label="AOV (Nilai/Pesanan)" value={fmtRp(o.aov)} />
        <KpiCard label="ASP (Harga/Unit)" value={fmtRp(o.asp)} />
        <KpiCard label="Tingkat Pembatalan" value={`${o.cancelRate.toFixed(1)}%`} />
        <KpiCard label="Marketplace" value={fmtNum(stats.marketplaces.length)} sub={stats.marketplaces.map(m => m.name).join(', ')} />
      </div>

      <div className="bg-surface border border-line/8 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-ink-strong flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-blue-400" /> AI Insights</h3>
        <ul className="space-y-2">
          {insights.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-muted">
              <span className="text-blue-400 mt-0.5">•</span>{t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Marketplace({ stats }) {
  const data = stats.marketplaces
  if (!stats.flags.hasMultiMarketplace && data.length === 1) {
    // tetap tampilkan, tapi tanpa donut perbandingan jika cuma 1
  }
  const donut = data.map(m => ({ name: m.name, value: Math.round(m.gmv) }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-surface border border-line/8 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-ink-strong mb-3">Kontribusi GMV</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {donut.map(d => <Cell key={d.name} fill={MP_COLOR[d.name] || '#6b7280'} />)}
              </Pie>
              <Tooltip formatter={v => fmtRp(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-surface border border-line/8 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-ink-strong mb-3">GMV per Marketplace</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tickFormatter={fmtRpShort} tick={{ fontSize: 11, fill: '#888' }} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fill: '#aaa' }} />
              <Tooltip formatter={v => fmtRp(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="gmv" radius={[0, 6, 6, 0]}>
                {data.map(d => <Cell key={d.name} fill={MP_COLOR[d.name] || '#6b7280'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-surface border border-line/8 rounded-2xl p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-faint border-b border-line/8">
              <th className="py-2 pr-3 font-medium">Marketplace</th>
              <th className="py-2 px-3 font-medium text-right">GMV</th>
              <th className="py-2 px-3 font-medium text-right">Pesanan</th>
              <th className="py-2 px-3 font-medium text-right">Unit</th>
              <th className="py-2 px-3 font-medium text-right">AOV</th>
              <th className="py-2 pl-3 font-medium text-right">Kontribusi</th>
            </tr>
          </thead>
          <tbody>
            {data.map(m => (
              <tr key={m.name} className="border-b border-line/5">
                <td className="py-2.5 pr-3 font-medium text-ink flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: MP_COLOR[m.name] || '#6b7280' }} />{m.name}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-ink-strong">{fmtRp(m.gmv)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{fmtNum(m.orders)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{fmtNum(m.units)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{fmtRp(m.aov)}</td>
                <td className="py-2.5 pl-3 text-right tabular-nums text-blue-400 font-semibold">{m.share.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Mingguan({ stats }) {
  const data = stats.weekly.map(w => ({ ...w, name: `Minggu ${w.week}` }))
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line/8 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-ink-strong mb-3">Tren GMV Mingguan</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ left: 5, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#aaa' }} />
            <YAxis tickFormatter={fmtRpShort} tick={{ fontSize: 11, fill: '#888' }} />
            <Tooltip formatter={v => fmtRp(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
            <Line type="monotone" dataKey="gmv" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map(w => (
          <div key={w.week} className="bg-surface border border-line/8 rounded-2xl p-4">
            <p className="text-sm font-semibold text-ink-strong mb-2">{w.name}</p>
            <p className="text-lg font-bold text-ink-strong tabular-nums">{fmtRpShort(w.gmv)}</p>
            <p className="text-[11px] text-ink-faint">{fmtRp(w.gmv)}</p>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div>
                <p className="text-[10px] text-ink-faint">GMV</p>
                <p className={`text-xs font-semibold tabular-nums ${growthCls(w.growthGmv)}`}>{pct(w.growthGmv)}</p>
              </div>
              <div>
                <p className="text-[10px] text-ink-faint">Pesanan</p>
                <p className={`text-xs font-semibold tabular-nums ${growthCls(w.growthOrders)}`}>{pct(w.growthOrders)}</p>
              </div>
              <div>
                <p className="text-[10px] text-ink-faint">AOV</p>
                <p className={`text-xs font-semibold tabular-nums ${growthCls(w.growthAov)}`}>{pct(w.growthAov)}</p>
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-ink-faint mt-3 pt-2 border-t border-line/8">
              <span>{fmtNum(w.orders)} pesanan</span><span>{fmtNum(w.units)} unit</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const ABC_CLS = { A: 'text-green-400 bg-green-500/10', B: 'text-yellow-400 bg-yellow-500/10', C: 'text-ink-faint bg-fill/8' }

function Produk({ stats }) {
  const top = stats.products.slice(0, 15)
  const bottom = [...stats.products].filter(p => p.gmv > 0).reverse().slice(0, 8)
  const pareto = stats.products.slice(0, 12).map(p => ({ name: p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name, gmv: Math.round(p.gmv), cum: +p.cum.toFixed(1) }))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard label="Total Produk" value={fmtNum(stats.products.length)} />
        <KpiCard label="Top 20% Produk" value={fmtNum(stats.top20Count)} sub={`menyumbang ${stats.top20Share.toFixed(0)}% revenue`} />
        <KpiCard label="Produk Kelas A" value={fmtNum(stats.products.filter(p => p.abc === 'A').length)} sub="≤80% revenue kumulatif" />
      </div>

      <div className="bg-surface border border-line/8 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-ink-strong mb-3">Pareto / ABC (Top 12)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={pareto} margin={{ left: 5, right: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#888' }} interval={0} angle={-30} textAnchor="end" height={60} />
            <YAxis yAxisId="l" tickFormatter={fmtRpShort} tick={{ fontSize: 11, fill: '#888' }} />
            <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tickFormatter={v => v + '%'} tick={{ fontSize: 11, fill: '#888' }} />
            <Tooltip formatter={(v, n) => n === 'cum' ? v + '%' : fmtRp(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="gmv" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Line yAxisId="r" dataKey="cum" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <RankTable title="Top Produk" rows={top} showAbc />
      <RankTable title="Produk Penjualan Terendah (Slow Moving)" rows={bottom} />
    </div>
  )
}

function RankTable({ title, rows, showAbc }) {
  return (
    <div className="bg-surface border border-line/8 rounded-2xl p-5 overflow-x-auto">
      <h3 className="text-sm font-semibold text-ink-strong mb-3">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-faint border-b border-line/8">
            <th className="py-2 pr-3 font-medium">Produk</th>
            <th className="py-2 px-3 font-medium text-right">Pesanan</th>
            <th className="py-2 px-3 font-medium text-right">Unit</th>
            <th className="py-2 px-3 font-medium text-right">GMV</th>
            <th className="py-2 pl-3 font-medium text-right">Kontribusi</th>
            {showAbc && <th className="py-2 pl-3 font-medium text-right">ABC</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className="border-b border-line/5">
              <td className="py-2.5 pr-3 text-ink truncate max-w-[220px]">{p.name}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{fmtNum(p.orders)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums">{fmtNum(p.units)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-ink-strong">{fmtRp(p.gmv)}</td>
              <td className="py-2.5 pl-3 text-right tabular-nums text-blue-400 font-semibold">{p.share.toFixed(1)}%</td>
              {showAbc && <td className="py-2.5 pl-3 text-right"><span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${ABC_CLS[p.abc]}`}>{p.abc}</span></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kategori({ stats }) {
  const cats = stats.categories
  const donut = cats.slice(0, 8).map(c => ({ name: c.name, value: Math.round(c.gmv) }))
  const PAL = ['#3b82f6', '#f97316', '#22c55e', '#eab308', '#8b5cf6', '#ec4899', '#14b8a6', '#6b7280']
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard label="Total Kategori" value={fmtNum(cats.length)} />
        <KpiCard label="Kategori Teratas" value={cats[0]?.name || '—'} sub={cats[0] ? `${cats[0].share.toFixed(0)}% GMV` : ''} />
      </div>
      <div className="bg-surface border border-line/8 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-ink-strong mb-3">Kontribusi GMV per Kategori (Top 8)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={2}>
              {donut.map((d, i) => <Cell key={d.name} fill={PAL[i % PAL.length]} />)}
            </Pie>
            <Tooltip formatter={v => fmtRp(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <RankTable title="Semua Kategori" rows={cats} />
      <p className="text-[11px] text-ink-faint">* Kontribusi dihitung terhadap total GMV. Pesanan tanpa kategori (mis. sebagian Shopee) tidak masuk hitungan kategori.</p>
    </div>
  )
}

function Waktu({ stats }) {
  const { time, top5Hours } = stats
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
  const maxHourOrders = top5Hours[0]?.orders || 1
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard label="Hari Terlaris" value={time.bestDay?.day || '—'} sub={time.bestDay ? `${fmtRp(time.bestDay.gmv)} · ${fmtNum(time.bestDay.orders)} pesanan` : ''} />
        <KpiCard label="Jam Puncak" value={time.bestHour ? `${String(time.bestHour.hour).padStart(2, '0')}:00` : '—'} sub={time.bestHour ? `${fmtRp(time.bestHour.gmv)} · ${fmtNum(time.bestHour.orders)} pesanan` : ''} />
      </div>

      {/* Top 5 Hari + Top 5 Jam — 2 kolom */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Top 5 Hari Terlaris — kiri */}
        {(() => {
          const top5Days = [...time.byDay]
            .filter(d => d.orders > 0)
            .sort((a, b) => b.orders - a.orders)
            .slice(0, 5)
          const maxDayOrders = top5Days[0]?.orders || 1
          const totalDayOrders = time.byDay.reduce((s, d) => s + d.orders, 0)
          return (
            <div className="bg-surface border border-line/8 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-ink-strong mb-4">Top 5 Hari Terlaris</h3>
              <div className="space-y-3">
                {top5Days.map((d, i) => {
                  const pct = totalDayOrders ? (d.orders / totalDayOrders) * 100 : 0
                  return (
                    <div key={d.day} className="flex items-center gap-3">
                      <span className="text-[11px] font-bold text-ink-faint w-4 text-right">{i + 1}</span>
                      <span className="text-sm font-semibold text-ink-strong w-12">{d.day}</span>
                      <div className="flex-1 bg-fill/8 rounded-full h-5 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500 flex items-center justify-end pr-2"
                          style={{ width: `${(d.orders / maxDayOrders) * 100}%` }}>
                          <span className="text-[10px] font-bold text-white">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                      <span className="text-xs text-ink-faint tabular-nums w-18 text-right whitespace-nowrap">{fmtNum(d.orders)} pesanan</span>
                    </div>
                  )
                })}
              </div>
              <div className="grid grid-cols-5 gap-1 mt-4 pt-4 border-t border-line/8">
                {top5Days.map(d => {
                  const pct = totalDayOrders ? (d.orders / totalDayOrders) * 100 : 0
                  return (
                    <div key={d.day} className="text-center">
                      <p className="text-[11px] font-bold text-ink-strong">{d.day}</p>
                      <p className="text-[10px] text-indigo-400 font-semibold">{pct.toFixed(0)}%</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Top 5 Jam Terbaik — kanan */}
        <div className="bg-surface border border-line/8 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-ink-strong mb-4">Top 5 Jam Terbaik</h3>
          <div className="space-y-3">
            {top5Hours.map((h, i) => (
              <div key={h.hour} className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-ink-faint w-4 text-right">{i + 1}</span>
                <span className="text-sm font-semibold text-ink-strong w-12">{h.label}</span>
                <div className="flex-1 bg-fill/8 rounded-full h-5 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 flex items-center justify-end pr-2"
                    style={{ width: `${(h.orders / maxHourOrders) * 100}%` }}>
                    <span className="text-[10px] font-bold text-white">{h.pct.toFixed(0)}%</span>
                  </div>
                </div>
                <span className="text-xs text-ink-faint tabular-nums w-18 text-right whitespace-nowrap">{fmtNum(h.orders)} pesanan</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1 mt-4 pt-4 border-t border-line/8">
            {top5Hours.map(h => (
              <div key={h.hour} className="text-center">
                <p className="text-[11px] font-bold text-ink-strong">{h.label}</p>
                <p className="text-[10px] text-blue-400 font-semibold">{h.pct.toFixed(0)}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-surface border border-line/8 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-ink-strong mb-3">GMV per Jam</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={time.byHour} margin={{ left: 5, right: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#888' }} interval={1} />
            <YAxis tickFormatter={fmtRpShort} tick={{ fontSize: 11, fill: '#888' }} />
            <Tooltip formatter={v => fmtRp(v)} labelFormatter={h => `Jam ${h}:00`} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
            <Bar dataKey="gmv" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-surface border border-line/8 rounded-2xl p-5 overflow-x-auto">
        <h3 className="text-sm font-semibold text-ink-strong mb-3">Heatmap Hari × Jam (intensitas GMV)</h3>
        <div className="min-w-[640px]">
          <div className="flex gap-0.5 mb-0.5 pl-9">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-[8px] text-ink-faint">{h % 3 === 0 ? h : ''}</div>
            ))}
          </div>
          {days.map((dn, di) => (
            <div key={di} className="flex gap-0.5 mb-0.5 items-center">
              <div className="w-8 text-[10px] text-ink-faint text-right pr-1">{dn}</div>
              {Array.from({ length: 24 }, (_, h) => {
                const v = time.heat[`${di}-${h}`] || 0
                const o = time.heatMax ? v / time.heatMax : 0
                return <div key={h} className="flex-1 aspect-square rounded-sm" title={`${dn} ${h}:00 — ${fmtRp(v)}`}
                  style={{ background: o === 0 ? 'rgba(255,255,255,0.03)' : `rgba(59,130,246,${0.12 + o * 0.88})` }} />
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Lokasi({ stats, mp, lsf }) {
  const prov = stats.provinces.slice(0, 12)
  const cities = stats.cities.slice(0, 12)
  // LSF khusus TikTok — angka selalu dari order TikTok saja. Tampil hanya saat
  // filter Semua atau TikTok; sembunyikan untuk Shopee & Tokopedia.
  const showLSF = lsf?.hasData && (mp === 'all' || mp === 'TikTok')
  return (
    <div className="space-y-4">
      {showLSF && <LogisticsCard lsf={lsf} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KpiCard label="Provinsi Teratas" value={stats.provinces[0]?.name || '—'} sub={stats.provinces[0] ? `${stats.provinces[0].share.toFixed(0)}% GMV` : ''} />
        <KpiCard label="Kota Teratas" value={stats.cities[0]?.name || '—'} sub={stats.cities[0] ? `${stats.cities[0].share.toFixed(0)}% GMV` : ''} />
      </div>
      <div className="bg-surface border border-line/8 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-ink-strong mb-3">Top Provinsi (GMV)</h3>
        <ResponsiveContainer width="100%" height={Math.max(160, prov.length * 26)}>
          <BarChart data={prov} layout="vertical" margin={{ left: 10 }}>
            <XAxis type="number" tickFormatter={fmtRpShort} tick={{ fontSize: 11, fill: '#888' }} />
            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10, fill: '#aaa' }} />
            <Tooltip formatter={v => fmtRp(v)} contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
            <Bar dataKey="gmv" fill="#3b82f6" radius={[0, 5, 5, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GeoTable title="Ranking Provinsi" rows={prov} />
        <GeoTable title="Ranking Kota/Kabupaten" rows={cities} />
      </div>
    </div>
  )
}

function LogisticsCard({ lsf }) {
  const { blended, dominant, uplift, zones } = lsf
  return (
    <div className="bg-surface border border-line/8 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Truck className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-ink-strong">Estimasi Biaya Logistik</h3>
        <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-1.5 py-0.5">TikTok LSF</span>
        <span
          title="Estimasi Biaya Layanan Logistik (LSF) TikTok berbasis tarif Standard ≤1kg dari Jawa. Khusus TikTok Shop — tidak berlaku di Shopee. Order berbobot >1kg atau layanan lain bisa berbeda."
          className="text-[11px] leading-none text-ink-faint border border-line/20 rounded-full w-4 h-4 flex items-center justify-center cursor-help">?</span>
      </div>
      <p className="text-xs text-ink-muted mb-4">
        Zona dominan <span className="font-semibold text-ink">{dominant.zone}</span> · {dominant.share.toFixed(1)}% pesanan · tarif dasar {fmtRp(dominant.rate)}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <div>
          <p className="text-xs font-semibold tracking-wider text-ink-muted mb-1">BIAYA LOGISTIK BLENDED</p>
          <p className="text-4xl font-bold text-blue-400">
            {fmtRp(blended)}<span className="text-base font-medium text-ink-faint">/pesanan</span>
          </p>
          <p className="text-xs text-ink-muted mt-2 leading-relaxed">
            Pengiriman ke luar zona dominan menambah <span className="font-semibold text-amber-400">+{uplift.toFixed(1)}%</span> di atas tarif dasar {fmtRp(dominant.rate)}.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint border-b border-line/8">
                <th className="py-1.5 pr-3 font-medium">Zona</th>
                <th className="py-1.5 px-3 font-medium text-right">%</th>
                <th className="py-1.5 pl-3 font-medium text-right">Tarif</th>
              </tr>
            </thead>
            <tbody>
              {zones.map(z => (
                <tr key={z.zone} className="border-b border-line/5">
                  <td className="py-1.5 pr-3 text-ink truncate max-w-[150px]">{z.zone}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-blue-400 font-semibold">{z.share.toFixed(1)}%</td>
                  <td className="py-1.5 pl-3 text-right tabular-nums text-ink-strong">{fmtRp(z.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function GeoTable({ title, rows }) {
  return (
    <div className="bg-surface border border-line/8 rounded-2xl p-5 overflow-x-auto">
      <h3 className="text-sm font-semibold text-ink-strong mb-3">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-faint border-b border-line/8">
            <th className="py-2 pr-3 font-medium">Wilayah</th>
            <th className="py-2 px-3 font-medium text-right">Pesanan</th>
            <th className="py-2 px-3 font-medium text-right">GMV</th>
            <th className="py-2 pl-3 font-medium text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className="border-b border-line/5">
              <td className="py-2 pr-3 text-ink truncate max-w-[160px]">{p.name}</td>
              <td className="py-2 px-3 text-right tabular-nums">{fmtNum(p.orders)}</td>
              <td className="py-2 px-3 text-right tabular-nums text-ink-strong">{fmtRpShort(p.gmv)}</td>
              <td className="py-2 pl-3 text-right tabular-nums text-blue-400 font-semibold">{p.share.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PAL = ['#3b82f6', '#f97316', '#22c55e', '#eab308', '#8b5cf6', '#ec4899', '#14b8a6', '#6b7280']

function Transaksi({ stats, vouchers = [] }) {
  const { payments, dekade, promo } = stats
  const totalOrders = stats.overview.orders

  // Cocokkan distribusi nominal voucher seller (dari data pesanan) ke voucher
  // yang dibuat user. Nominal yang cocok diberi nama; sisanya "belum terdaftar".
  const voucherUsage = useMemo(() => (promo.sellerVoucherByAmount || []).map(row => {
    const matched = matchVouchersToAmount(vouchers, row.amount)
    return {
      ...row,
      label: matched.length ? matched.map(v => v.name).join(', ') : `Voucher ${fmtRp(row.amount)}`,
      unregistered: matched.length === 0,
    }
  }), [promo, vouchers])

  return (
    <div className="space-y-4">

      {/* Metode Pembayaran */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-surface border border-line/8 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-ink-strong mb-3">Metode Pembayaran</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={payments.map(p => ({ name: p.name, value: p.orders }))}
                dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {payments.map((p, i) => <Cell key={p.name} fill={PAL[i % PAL.length]} />)}
              </Pie>
              <Tooltip
                formatter={(v, n) => [`${fmtNum(v)} pesanan`, n]}
                contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-surface border border-line/8 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-ink-strong mb-4">Ranking Metode Pembayaran</h3>
          <div className="space-y-3">
            {payments.map((p, i) => (
              <div key={p.name} className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PAL[i % PAL.length] }} />
                <span className="text-sm text-ink flex-1 truncate">{p.name}</span>
                <span className="text-sm font-semibold text-ink-strong tabular-nums">{fmtNum(p.orders)}</span>
                <span className="text-xs text-ink-faint w-10 text-right tabular-nums">{p.share.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performa Rentang Tanggal */}
      <div className="bg-surface border border-line/8 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-ink-strong mb-4">Performa Rentang Tanggal</h3>
        <div className="space-y-3 mb-4">
          {dekade.map(d => (
            <div key={d.range} className="flex items-center gap-3">
              <span className="text-sm font-semibold text-ink-strong w-14">{d.range}</span>
              <div className="flex-1 bg-fill/8 rounded-full h-6 overflow-hidden">
                <div className="h-full rounded-full bg-indigo-500 flex items-center justify-end pr-2.5"
                  style={{ width: `${totalOrders ? (d.orders / totalOrders) * 100 : 0}%`, minWidth: d.orders ? '2.5rem' : 0 }}>
                  {d.orders > 0 && <span className="text-[10px] font-bold text-white">{d.share.toFixed(0)}%</span>}
                </div>
              </div>
              <span className="text-xs text-ink-faint tabular-nums w-24 text-right">{fmtNum(d.orders)} pesanan</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-line/8">
          {dekade.map(d => (
            <div key={d.range} className="bg-fill/5 rounded-xl p-3 text-center">
              <p className="text-xs text-ink-faint mb-0.5">Tgl {d.range}</p>
              <p className="text-lg font-bold text-ink-strong tabular-nums">{fmtNum(d.orders)}</p>
              <p className="text-[11px] text-indigo-400 font-semibold">{d.share.toFixed(0)}%</p>
              <p className="text-[11px] text-ink-faint mt-0.5">{fmtRpShort(d.gmv)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Penggunaan Promo — tampil hanya jika ada data voucher */}
      {promo.hasData ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Voucher Seller */}
          <div className="bg-surface border border-line/8 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-ink-strong mb-1">Penggunaan Voucher Seller</h3>
            <p className="text-[11px] text-ink-faint mb-3">Nominal ditanggung penjual</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={[
                  { name: 'Pakai Voucher', value: promo.withVoucherSeller },
                  { name: 'Tanpa Voucher', value: promo.withoutVoucherSeller },
                ]} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2}>
                  <Cell fill="#3b82f6" />
                  <Cell fill="rgba(255,255,255,0.08)" />
                </Pie>
                <Tooltip formatter={(v, n) => [`${fmtNum(v)} pesanan`, n]}
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-ink">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />Pakai Voucher Seller
                </span>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink-strong tabular-nums">{fmtNum(promo.withVoucherSeller)} pesanan</p>
                  <p className="text-[11px] text-blue-400">{totalOrders ? ((promo.withVoucherSeller / totalOrders) * 100).toFixed(0) : 0}% dari total</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <span className="w-2 h-2 rounded-full bg-fill/25" />Tanpa Voucher
                </span>
                <p className="text-sm text-ink-muted tabular-nums">{fmtNum(promo.withoutVoucherSeller)} pesanan</p>
              </div>
              <div className="pt-2 border-t border-line/8 flex justify-between items-center">
                <span className="text-xs text-ink-faint">Total nominal voucher seller</span>
                <span className="text-sm font-bold text-blue-400 tabular-nums">{fmtRp(promo.totalVoucherSeller)}</span>
              </div>
            </div>

            {/* Breakdown per voucher (cocok via nominal) */}
            {voucherUsage.length > 0 && (
              <div className="mt-4 pt-3 border-t border-line/8">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-ink-muted">Voucher yang Dipakai</p>
                  <span className="text-[10px] text-ink-faint">cocok via nominal</span>
                </div>
                <div className="space-y-2">
                  {voucherUsage.slice(0, 6).map(row => {
                    const share = promo.withVoucherSeller ? (row.orders / promo.withVoucherSeller) * 100 : 0
                    return (
                      <div key={row.amount}>
                        <div className="flex items-center justify-between gap-2 text-xs mb-1">
                          <span className={`truncate ${row.unregistered ? 'text-ink-faint' : 'text-ink'}`}
                            title={row.unregistered ? 'Nominal ini belum cocok dengan voucher yang dibuat' : undefined}>
                            {row.label}{row.unregistered && <span className="ml-1 text-[10px]">· belum terdaftar</span>}
                          </span>
                          <span className="flex-shrink-0 tabular-nums text-ink-muted">
                            {fmtNum(row.orders)} ({share.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-fill/10 overflow-hidden">
                          <div className={`h-full rounded-full ${row.unregistered ? 'bg-fill/30' : 'bg-blue-500'}`}
                            style={{ width: `${Math.max(2, share)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {voucherUsage.some(r => r.unregistered) && (
                  <p className="text-[10px] text-ink-faint mt-2 leading-relaxed">
                    Nominal "belum terdaftar" = ada di data pesanan tapi belum cocok dengan voucher mana pun yang kamu buat di menu Produk → Voucher.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Voucher Shopee */}
          <div className="bg-surface border border-line/8 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-ink-strong mb-1">Voucher Ditanggung Shopee</h3>
            <p className="text-[11px] text-ink-faint mb-3">Platform yang menanggung diskon</p>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={[
                  { name: 'Pakai Voucher Shopee', value: promo.withVoucherShopee },
                  { name: 'Tanpa', value: promo.withoutVoucherShopee },
                ]} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2}>
                  <Cell fill="#f97316" />
                  <Cell fill="rgba(255,255,255,0.08)" />
                </Pie>
                <Tooltip formatter={(v, n) => [`${fmtNum(v)} pesanan`, n]}
                  contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 12, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-ink">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />Pakai Voucher Shopee
                </span>
                <div className="text-right">
                  <p className="text-sm font-semibold text-ink-strong tabular-nums">{fmtNum(promo.withVoucherShopee)} pesanan</p>
                  <p className="text-[11px] text-orange-400">{totalOrders ? ((promo.withVoucherShopee / totalOrders) * 100).toFixed(0) : 0}% dari total</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                  <span className="w-2 h-2 rounded-full bg-fill/25" />Tanpa Voucher Shopee
                </span>
                <p className="text-sm text-ink-muted tabular-nums">{fmtNum(promo.withoutVoucherShopee)} pesanan</p>
              </div>
              <div className="pt-2 border-t border-line/8 flex justify-between items-center">
                <span className="text-xs text-ink-faint">Total nominal voucher Shopee</span>
                <span className="text-sm font-bold text-orange-400 tabular-nums">{fmtRp(promo.totalVoucherShopee)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-surface border border-line/8 rounded-2xl p-5 text-center py-8">
          <p className="text-sm text-ink-faint">Data voucher tidak tersedia</p>
          <p className="text-xs text-ink-faint mt-1">Kolom "Voucher Ditanggung Penjual" / "Voucher Ditanggung Shopee" tidak ditemukan di file ini</p>
        </div>
      )}
    </div>
  )
}
