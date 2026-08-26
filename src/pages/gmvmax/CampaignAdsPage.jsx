// Campaign Ads — Varian A "Tabel Komparatif" (pilihan user):
// semua campaign = satu tabel padat ber-sortir + sparkline spend harian +
// delta vs periode pembanding; klik baris → mengembang (aksi lengkap +
// auto-budget + sinyal); "Detail produk & status" → CampaignStatusMatrix
// (matriks status materi per produk, pilihan lapisan detail user).
// Setting dari gmvmax_campaign_settings (capture harian); performa dari
// rollupCampaigns; sparkline & matriks dari creatives window (context rows).
import { useState, useEffect, useMemo } from 'react'
import { Megaphone, TrendingUp, Wallet, Target, Info, History, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { EmptyState, StatCard, DeltaBadge, fmtRp, fmtRpC, fmtRoasX } from '../../components/gmvmax/ui'
import { loadCampaignSettingsHistory, latestPerCampaign } from '../../data/gmvmaxCampaignSettings'
import { buildChangeLog } from '../../utils/gmvmaxCampaignDiff'
import CampaignActionDialog from '../../components/gmvmax/CampaignActionDialog'
import CampaignProductsDialog from '../../components/gmvmax/CampaignProductsDialog'
import CampaignStatusMatrix from '../../components/gmvmax/CampaignStatusMatrix'

const n = (v) => (v || 0).toLocaleString('id-ID')
const isOn = (s) => s === 'ENABLE'

// ── Sparkline mini: batang cost harian (div murni, tanpa lib) ────────────────
function Spark({ series }) {
  if (!series || series.length < 2) return <span className="text-[9px] text-ink-faint">—</span>
  const max = Math.max(...series.map(s => s.v), 1)
  return (
    <div className="flex items-end gap-[2px] h-5 w-[88px]" title="spend harian (periode terpilih)">
      {series.slice(-14).map((s, i) => (
        <div key={i} className="flex-1 rounded-[1px] bg-blue-500/60" style={{ height: `${Math.max(8, (s.v / max) * 100)}%` }} />
      ))}
    </div>
  )
}

const SORTS = {
  budget: (m) => Number(m.s?.budget) || 0,
  roas: (m) => m.p?.total.roas ?? -1,
  spend: (m) => m.p?.total.cost || 0,
  revenue: (m) => m.p?.total.revenue || 0,
  orders: (m) => m.p?.total.orders || 0,
  cpo: (m) => m.p?.total.cpo ?? Infinity,
}

export default function CampaignAdsPage({ onOpenUpload }) {
  const { campaigns, hasData, periodName, prev, rows, productNames } = useGmvMax()
  const [settings, setSettings] = useState([])
  const [changes, setChanges] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [dialog, setDialog] = useState(null)     // { action, campaign }
  const [matrix, setMatrix] = useState(null)     // campaign utk lapisan detail
  const [queuedMsg, setQueuedMsg] = useState(null)
  const [tab, setTab] = useState('aktif')
  const [expanded, setExpanded] = useState(null) // campaign id baris mengembang
  const [sort, setSort] = useState({ key: 'revenue', dir: -1 })

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setErr(null)
    loadCampaignSettingsHistory({ days: 30 })
      .then(r => { if (!active) return; setSettings(latestPerCampaign(r)); setChanges(buildChangeLog(r)) })
      .catch(e => { if (active) setErr(e.message || 'Gagal memuat setting campaign.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // Gabung setting + performa + pembanding periode.
  const merged = useMemo(() => {
    const perf = new Map((campaigns || []).filter(c => c.campaignId).map(c => [c.campaignId, c]))
    const prevPerf = new Map((prev?.campaigns || []).filter(c => c.campaignId).map(c => [c.campaignId, c]))
    const out = settings.map(s => ({
      id: s.campaign_id, name: s.campaign_name || s.campaign_id, s,
      p: perf.get(s.campaign_id) || null, pp: prevPerf.get(s.campaign_id) || null,
    }))
    for (const c of campaigns || []) {
      if (c.campaignId && !settings.some(s => s.campaign_id === c.campaignId)) {
        out.push({ id: c.campaignId, name: c.campaign, s: null, p: c, pp: prevPerf.get(c.campaignId) || null })
      }
    }
    return out
  }, [settings, campaigns, prev])

  // Sparkline: cost harian per campaign dari creatives window.
  const sparkByCampaign = useMemo(() => {
    const m = new Map() // campaignId → Map(date → cost)
    for (const r of rows || []) {
      if (!r.campaignId || !r.snapshotDate) continue
      if (!m.has(r.campaignId)) m.set(r.campaignId, new Map())
      const e = m.get(r.campaignId)
      e.set(r.snapshotDate, (e.get(r.snapshotDate) || 0) + (r.cost || 0))
    }
    const out = new Map()
    for (const [cid, byDate] of m) {
      out.set(cid, [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, v]) => ({ d, v })))
    }
    return out
  }, [rows])

  const sum = useMemo(() => {
    const act = merged.filter(m => isOn(m.s?.operation_status))
    const spending = act.filter(m => (m.p?.total.cost || 0) > 0)
    return {
      total: merged.length, aktif: act.length, spendingCount: spending.length,
      budget: spending.reduce((a, m) => a + (Number(m.s?.budget) || 0), 0),
      spend: merged.reduce((a, m) => a + (m.p?.total.cost || 0), 0),
      revenue: merged.reduce((a, m) => a + (m.p?.total.revenue || 0), 0),
    }
  }, [merged])

  if (!hasData) return <EmptyState title="Belum ada data GMV Max" desc="Upload dulu di Import Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />
  if (loading) return <div className="flex items-center justify-center py-32 text-ink-faint gap-2">
    <Loader2 className="w-5 h-5 animate-spin" /> Memuat setting campaign…
  </div>

  const roas = sum.spend > 0 ? sum.revenue / sum.spend : null
  const prevSum = (() => {
    const pc = prev?.campaigns
    if (!pc || !pc.length) return null
    const spend = pc.reduce((a, c) => a + (c.total.cost || 0), 0)
    const revenue = pc.reduce((a, c) => a + (c.total.revenue || 0), 0)
    return { spend, revenue, roas: spend > 0 ? revenue / spend : null }
  })()

  const open = (action, m) => { setQueuedMsg(null); setDialog({ action, campaign: m.s }) }
  const act = merged.filter(m => isOn(m.s?.operation_status))
  const off = merged.filter(m => !isOn(m.s?.operation_status))
  const shown = [...(tab === 'aktif' ? act : off)]
    .sort((a, b) => (SORTS[sort.key](a) - SORTS[sort.key](b)) * sort.dir)
  const clickSort = (key) => setSort(s => ({ key, dir: s.key === key ? -s.dir : -1 }))

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {periodName && <p className="text-sm text-ink-muted -mb-1">{periodName} <span className="text-ink-faint">· performa periode ini · setting = kondisi terkini</span></p>}

      {err && (
        <p className="text-xs text-amber-300 flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{err} — setting di-capture worker harian; kalau tabelnya baru dibuat, tunggu run berikutnya.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Megaphone} tone="violet" label="Campaign" value={n(sum.total)} sub={`${n(sum.aktif)} aktif`} />
        <StatCard icon={Wallet} tone="amber" label="Budget harian (aktif)" value={fmtRpC(sum.budget)} sub={`${n(sum.spendingCount)} campaign belanja (spend > 0)`} />
        <StatCard icon={TrendingUp} tone="green" label="Revenue periode" value={fmtRpC(sum.revenue)} sub={`spend ${fmtRpC(sum.spend)}`}
          delta={prevSum && <DeltaBadge cur={sum.revenue} prev={prevSum.revenue} fmt={fmtRpC} />} />
        <StatCard icon={Target} tone="blue" label="ROAS periode" value={fmtRoasX(roas)}
          delta={prevSum && roas != null && prevSum.roas != null && <DeltaBadge cur={roas} prev={prevSum.roas} fmt={(v) => v.toFixed(2)} />} />
      </div>

      {queuedMsg && (
        <p className="text-xs text-green-300 bg-green-500/10 border border-green-500/25 rounded-xl px-3 py-2">
          {queuedMsg} — buka 🔔 di topbar untuk menyetujui.
        </p>
      )}

      <div className="flex items-center gap-1.5 border-b border-line/10">
        {[['aktif', `Aktif · ${act.length}`], ['nonaktif', `Nonaktif · ${off.length}`]].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setExpanded(null) }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${tab === id
              ? 'text-ink-strong border-blue-500' : 'text-ink-faint border-transparent hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[920px]">
          <thead><tr className="border-b border-line/10">
            <Th align="left">Campaign</Th>
            <Th k="budget" sort={sort} onSort={clickSort}>Budget/hari</Th>
            <Th>Target</Th>
            <Th k="roas" sort={sort} onSort={clickSort}>ROAS</Th>
            <Th k="spend" sort={sort} onSort={clickSort}>Spend</Th>
            <Th k="revenue" sort={sort} onSort={clickSort}>Revenue</Th>
            <Th k="orders" sort={sort} onSort={clickSort}>Orders</Th>
            <Th k="cpo" sort={sort} onSort={clickSort}>Cost/Order</Th>
            <Th>{null}</Th>
          </tr></thead>
          <tbody>
            {shown.map(m => {
              const { s, p, pp } = m
              const pv = pp?.total || null
              const bid = s?.roas_bid != null ? Number(s.roas_bid) : null
              const actual = p?.total.roas ?? null
              const below = bid != null && actual != null && actual < bid
              const scaleHint = bid != null && actual != null && actual >= bid && (p?.total.cost || 0) > 0
              const ab = s?.auto_budget || {}
              const isExp = expanded === m.id
              const prodCount = Array.isArray(s?.item_group_ids) ? s.item_group_ids.length : null
              return (
                <FragmentRow key={m.id}>
                  <tr onClick={() => setExpanded(isExp ? null : m.id)}
                    className={`border-b border-line/6 cursor-pointer transition-colors ${isExp ? 'bg-fill/5' : 'hover:bg-fill/3'}`}>
                    <td className="py-2.5 px-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {isExp ? <ChevronDown className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-ink-strong font-semibold truncate max-w-[220px]">{m.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Spark series={sparkByCampaign.get(m.id)} />
                            {prodCount != null && <span className="text-[10px] text-ink-faint">{prodCount} produk</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                      {s ? fmtRp(Number(s.budget) || 0) : '—'}
                      {ab.auto_budget_enabled && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-blue-500/12 text-blue-400">auto→{fmtRpC(ab.maximum_budget)}</span>}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">{bid != null ? `${bid}×` : '—'}</td>
                    <td className={`py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold ${below ? 'text-amber-400' : actual != null ? 'text-emerald-400' : 'text-ink-faint'}`}>
                      {fmtRoasX(actual)}
                      {pv && <div className="text-[9px] font-normal"><DeltaBadge cur={actual} prev={pv.roas} fmt={(v) => v.toFixed(2)} /></div>}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">{p ? fmtRpC(p.total.cost) : '—'}</td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      {p ? fmtRpC(p.total.revenue) : '—'}
                      {pv && p && <div className="text-[9px]"><DeltaBadge cur={p.total.revenue} prev={pv.revenue} fmt={fmtRpC} /></div>}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      {p ? n(p.total.orders) : '—'}
                      {pv && p && <div className="text-[9px]"><DeltaBadge cur={p.total.orders} prev={pv.orders} /></div>}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      {p?.total.cpo != null ? fmtRp(Math.round(p.total.cpo)) : '—'}
                      {pv?.cpo != null && p?.total.cpo != null && <div className="text-[9px]"><DeltaBadge cur={p.total.cpo} prev={pv.cpo} fmt={(v) => fmtRp(Math.round(v))} goodDown /></div>}
                    </td>
                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {s?.campaign_id && (
                        <>
                          <button onClick={() => open('BUDGET_UPDATE', m)}
                            className={`px-2 py-1 rounded-lg text-[10.5px] font-semibold border transition-colors mr-1 ${scaleHint
                              ? 'bg-blue-600 border-transparent text-white hover:bg-blue-700'
                              : 'border-line/15 text-ink-muted hover:text-ink hover:border-blue-500/40'}`}
                            title={scaleHint ? 'ROAS di atas target — kandidat naikkan budget' : 'Ubah budget'}>
                            Budget{scaleHint ? ' 💡' : ''}
                          </button>
                          <button onClick={() => open('ROI_UPDATE', m)}
                            className={`px-2 py-1 rounded-lg text-[10.5px] font-semibold border transition-colors ${below
                              ? 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10'
                              : 'border-line/15 text-ink-muted hover:text-ink hover:border-blue-500/40'}`}
                            title={below ? 'ROAS di bawah target — tinjau bid' : 'Ubah Target ROI'}>
                            ROI{below ? ' ⚠' : ''}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {isExp && (
                    <tr className="border-b border-line/6 bg-surface2/60">
                      <td colSpan={9} className="py-2.5 px-4">
                        <div className="flex items-center gap-3 flex-wrap text-[11px]">
                          <button onClick={() => setMatrix(s || { campaign_id: m.id, campaign_name: m.name })}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
                            Detail produk &amp; status materi →
                          </button>
                          {s?.campaign_id && (
                            <>
                              <button onClick={() => open('PRODUCTS', m)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-line/15 text-ink-muted hover:text-ink hover:border-blue-500/40">
                                Kelola produk
                              </button>
                              {isOn(s.operation_status) ? (
                                <button onClick={() => open('DISABLE', m)}
                                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-red-500/25 text-red-400 hover:bg-red-500/10">Pause</button>
                              ) : (
                                <button onClick={() => open('ENABLE', m)}
                                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/10">Aktifkan</button>
                              )}
                            </>
                          )}
                          {ab.auto_budget_enabled && (
                            <span className="text-ink-muted">Auto-budget ON · +{ab.budget_increase_percentage}%/naik · sisa {ab.remained_times ?? '—'}× · berikutnya {fmtRpC(ab.next_increase)}</span>
                          )}
                          {below && <span className="text-amber-300">⚠ ROAS {fmtRoasX(actual)} di bawah target {bid}× — tinjau bid/kreatif</span>}
                          {scaleHint && <span className="text-emerald-300">💡 ROAS di atas target — kandidat naikkan budget</span>}
                          {s?.modify_time && <span className="text-ink-faint ml-auto">diubah {new Date(s.modify_time).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              )
            })}
            {shown.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-sm text-ink-faint">
                {merged.length === 0 ? 'Belum ada setting campaign ter-capture — worker mengambilnya tiap hari.' : `Tidak ada campaign ${tab}.`}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ChangeLog changes={changes} />

      {dialog && dialog.action !== 'PRODUCTS' && (
        <CampaignActionDialog action={dialog.action} campaign={dialog.campaign}
          onClose={() => setDialog(null)}
          onQueued={() => setQueuedMsg(`Aksi diajukan untuk ${dialog.campaign?.campaign_name || 'campaign'}`)} />
      )}
      {dialog && dialog.action === 'PRODUCTS' && (
        <CampaignProductsDialog campaign={dialog.campaign} productNames={productNames}
          onClose={() => setDialog(null)}
          onQueued={() => setQueuedMsg(`Perubahan produk diajukan untuk ${dialog.campaign?.campaign_name || 'campaign'}`)} />
      )}
      {matrix && <CampaignStatusMatrix campaign={matrix} onClose={() => setMatrix(null)} />}
    </div>
  )
}

// React fragment dgn key utk pasangan baris (baris utama + baris mengembang).
function FragmentRow({ children }) { return <>{children}</> }

// Header kolom ber-sortir (komponen level atas — aturan static-components).
function Th({ k, sort, onSort, children, align = 'right' }) {
  return (
    <th onClick={() => k && onSort && onSort(k)}
      className={`py-2 px-2.5 text-[10px] uppercase tracking-widest text-ink-faint font-semibold whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'} ${k ? 'cursor-pointer hover:text-ink select-none' : ''}`}>
      {children}{k && sort && sort.key === k && <span className="text-blue-400"> {sort.dir < 0 ? '\u2193' : '\u2191'}</span>}
    </th>
  )
}

// Badge delta perubahan setting (riwayat) — arah warna dibedakan per field.
function DeltaChange({ c }) {
  const a = Number(c.from), b = Number(c.to)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b || a === 0) return null
  const diff = b - a
  const pct = (diff / Math.abs(a)) * 100
  const up = diff > 0
  const tone = c.field === 'roas_bid'
    ? (up ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400')
    : (up ? 'bg-blue-500/15 text-blue-400' : 'bg-amber-500/15 text-amber-400')
  const diffTxt = c.money ? fmtRp(Math.abs(Math.round(diff))) : String(Math.abs(Math.round(diff * 10) / 10))
  return (
    <span className={`ml-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums ${tone}`}>
      {up ? '▲' : '▼'} {diffTxt} ({pct > 0 ? '+' : ''}{pct.toFixed(pct % 1 === 0 ? 0 : 1)}%)
    </span>
  )
}

function ChangeLog({ changes }) {
  const fmtVal = (v, money) => (v == null || v === '' ? '—' : money ? fmtRp(Number(v)) : String(v))
  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-4">
      <h3 className="text-sm font-semibold text-ink-strong mb-1 flex items-center gap-2">
        <History className="w-4 h-4 text-blue-400" /> Perubahan setting
      </h3>
      <p className="text-[11px] text-ink-faint mb-3">
        Terdeteksi otomatis dari perbandingan snapshot harian. Muncul juga di Log Optimasi.
      </p>
      {changes.length === 0 ? (
        <p className="text-xs text-ink-faint py-4 text-center">
          Belum ada perubahan terdeteksi. Riwayat mulai terkumpul sejak capture pertama — perubahan akan tampil di sini begitu budget/bid/status diubah.
        </p>
      ) : (
        <div className="space-y-1.5">
          {changes.slice(0, 30).map((c, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm border-b border-line/5 pb-1.5 last:border-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 mt-0.5">auto</span>
              <div className="min-w-0 flex-1">
                <p className="text-ink truncate">
                  {c.label} <span className="text-ink-faint">{fmtVal(c.from, c.money)}</span>
                  <span className="text-ink-faint"> → </span>
                  <span className="font-semibold text-ink-strong">{fmtVal(c.to, c.money)}</span>
                  <DeltaChange c={c} />
                  <span className="text-ink-faint"> · {c.campaign_name}</span>
                </p>
                <p className="text-[10px] text-ink-faint">{c.date}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
