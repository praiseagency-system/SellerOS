// Drawer detail eksperimen (Opsi B — artifact 0d787418). Semua isi dari data
// yang sudah ada: checkpoint tersimpan, vonis live + alasannya (classifyOutcome),
// deret harian loadExperimentDaily, potret sesi boost (migrasi 0048).
// PENCATATAN MURNI: Hentikan/Hapus hanya mengubah baris eksperimen — TIDAK
// menghentikan boost/campaign di TikTok (eksekusi nyata = jalur approval).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink } from 'lucide-react'
import { loadExperimentDaily } from '../../data/gmvmaxImports'
import { loadBoostSessions } from '../../data/gmvmaxBoostSessions'
import { getThresholds } from '../../data/gmvmaxSettings'
import {
  stopExperiment, deleteExperiment, EXPERIMENT_TYPES, CONCLUSION_LABEL,
} from '../../data/gmvmaxExperiments'
import { liveConclusion } from '../../utils/gmvmaxExperimentLive'
import { fmtRp, fmtRpC, fmtRoasX } from './ui'

const typeLabel = (t) => (EXPERIMENT_TYPES.find(([k]) => k === t)?.[1]) || t
const CONC = {
  SUSTAINABLE_WINNER: 'text-emerald-400', WINNER_CANDIDATE: 'text-emerald-400',
  TEMPORARY_SPIKE: 'text-amber-400', WEAK: 'text-red-400',
  INCONCLUSIVE: 'text-ink-muted', STOPPED: 'text-ink-muted', DATA_INSUFFICIENT: 'text-ink-faint',
}
const nfID = new Intl.NumberFormat('id-ID')
const fmtN = (n) => (n == null ? '—' : nfID.format(Math.round(n)))
// Rasio fraksi 0–1 → "4,7%"; angka kecil dapat 1 desimal agar tak rata jadi 0%.
const fmtPct = (f) => {
  if (f == null) return '—'
  const v = f * 100
  return (v >= 10 ? v.toFixed(0) : v.toFixed(1)).replace('.', ',') + '%'
}
const fmtD = (s) => (s ? new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '—')
const addDaysISO = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

// Agregat satu jendela hari: volume = rata-rata/hari, rasio dari Σ (bukan
// rata-rata rasio), retensi tertimbang impresi. null bila jendelanya kosong.
function windowAgg(rows) {
  if (!rows || rows.length === 0) return null
  const s = rows.reduce((a, r) => ({
    cost: a.cost + r.cost, revenue: a.revenue + r.revenue, orders: a.orders + r.orders,
    imp: a.imp + r.impressions, clk: a.clk + r.clicks,
    vrW: r.vr ? a.vrW.map((w, i) => w + r.vr[i] * r.impressions) : a.vrW,
    vrImp: a.vrImp + (r.vr ? r.impressions : 0),
  }), { cost: 0, revenue: 0, orders: 0, imp: 0, clk: 0, vrW: [0, 0, 0, 0, 0, 0], vrImp: 0 })
  const d = rows.length
  return {
    days: d, spendTotal: s.cost,
    roi: s.cost > 0 ? s.revenue / s.cost : null,
    impD: s.imp / d, clkD: s.clk / d, ordD: s.orders / d,
    ctr: s.imp > 0 ? s.clk / s.imp : null,
    cvr: s.clk > 0 ? s.orders / s.clk : null,
    cpo: s.orders > 0 ? s.cost / s.orders : null,
    vr: s.vrImp > 0 ? s.vrW.map(w => w / s.vrImp) : null,
  }
}

const deltaPctEl = (a, b, invert = false) => {
  if (a == null || b == null || a === 0) return <span className="text-ink-faint">—</span>
  const p = ((b - a) / a) * 100
  const good = invert ? p < 0 : p > 0
  return <span className={good ? 'text-emerald-400' : 'text-red-400'}>{p >= 0 ? '+' : ''}{Math.abs(p) >= 10 ? p.toFixed(0) : p.toFixed(1).replace('.', ',')}%</span>
}
const deltaPtEl = (a, b) => {
  if (a == null || b == null) return <span className="text-ink-faint">—</span>
  const p = (b - a) * 100
  return <span className={p >= 0 ? 'text-emerald-400' : 'text-red-400'}>{p >= 0 ? '+' : '−'}{Math.abs(p).toFixed(1).replace('.', ',')} pt</span>
}

// Bar harian revenue/cost + garis ROI, arsiran baseline, garis mulai, titik checkpoint.
function DailyChart({ rows, baselineStart, baselineEnd, startDate, checkpoints }) {
  const H = 170, PAD_B = 18, PAD_T = 14, STEP = 30, BW = 9
  const w = rows.length * STEP
  const maxV = Math.max(1, ...rows.map(r => Math.max(r.revenue, r.cost)))
  const rois = rows.map(r => r.roi)
  const maxR = Math.max(1, ...rois.filter(v => v != null)) * 1.15
  const y = v => PAD_T + (H - PAD_T - PAD_B) * (1 - v / maxV)
  const yr = v => PAD_T + (H - PAD_T - PAD_B) * (1 - v / maxR)
  const x = i => i * STEP + STEP / 2
  const ckByDate = Object.fromEntries((checkpoints || []).filter(c => c.roi != null).map(c => [c.date, c]))
  const iBaseEnd = rows.findLastIndex(r => baselineEnd && r.date <= baselineEnd)
  const iStart = rows.findIndex(r => startDate && r.date >= startDate)
  const roiPts = rows.map((r, i) => (r.roi != null ? `${x(i)},${yr(r.roi)}` : null)).filter(Boolean).join(' ')
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} className="block" style={{ minWidth: Math.min(w, 300) }}>
        {baselineStart && iBaseEnd >= 0 && (
          <>
            <rect x={0} y={PAD_T - 8} width={(iBaseEnd + 1) * STEP} height={H - PAD_T - PAD_B + 8} rx="4" fill="currentColor" className="text-line/5" />
            <text x={6} y={PAD_T + 2} fill="currentColor" className="text-ink-faint" fontSize="8.5" letterSpacing=".08em">BASELINE</text>
          </>
        )}
        {iStart >= 0 && (
          <line x1={iStart * STEP} y1={PAD_T - 8} x2={iStart * STEP} y2={H - PAD_B} stroke="currentColor" className="text-accent" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {rows.map((r, i) => (
          <g key={r.date}>
            <title>{`${fmtD(r.date)}\nRevenue ${fmtRpC(r.revenue)} · Cost ${fmtRpC(r.cost)} · ROI ${fmtRoasX(r.roi)}`}</title>
            <rect x={x(i) - BW - 1} width={BW} y={y(r.revenue)} height={H - PAD_B - y(r.revenue)} rx="1.5" fill="currentColor" className="text-emerald-500" opacity={baselineEnd && r.date <= baselineEnd ? 0.5 : 0.95} />
            <rect x={x(i) + 1} width={BW} y={y(r.cost)} height={H - PAD_B - y(r.cost)} rx="1.5" fill="currentColor" className="text-red-400" opacity={baselineEnd && r.date <= baselineEnd ? 0.4 : 0.8} />
            <text x={x(i)} y={H - 5} textAnchor="middle" fontSize="8.5" fill="currentColor" className="text-ink-faint">{+r.date.slice(8, 10)}</text>
            {ckByDate[r.date] && r.roi != null && (
              <>
                <circle cx={x(i)} cy={yr(r.roi)} r="3.5" style={{ fill: 'rgb(var(--c-surface))' }} stroke="rgb(251 191 36)" strokeWidth="1.5" />
                <text x={x(i)} y={yr(r.roi) - 8} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="rgb(251 191 36)">{ckByDate[r.date].label} · {fmtRoasX(Number(ckByDate[r.date].roi))}</text>
              </>
            )}
          </g>
        ))}
        {roiPts && <polyline points={roiPts} fill="none" stroke="rgb(251 191 36)" strokeWidth="1.5" opacity="0.85" />}
      </svg>
    </div>
  )
}

const VR_LABELS = ['2 dtk', '6 dtk', '25%', '50%', '75%', '100%']
function RetentionBars({ base, post }) {
  const H = 130, PAD_B = 16, PAD_T = 16, STEP = 62, BW = 14
  const w = VR_LABELS.length * STEP
  const maxV = Math.max(0.01, ...(base || []), ...(post || [])) * 1.15
  const y = v => PAD_T + (H - PAD_T - PAD_B) * (1 - v / maxV)
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} className="block">
        {VR_LABELS.map((l, i) => {
          const cx = i * STEP + STEP / 2
          const b = base?.[i], p = post?.[i]
          return (
            <g key={l}>
              {b != null && <rect x={cx - BW - 1.5} width={BW} y={y(b)} height={H - PAD_B - y(b)} rx="1.5" fill="currentColor" className="text-ink-faint" opacity="0.45" />}
              {p != null && (
                <>
                  <rect x={cx + 1.5} width={BW} y={y(p)} height={H - PAD_B - y(p)} rx="1.5" fill="currentColor" className="text-emerald-500" />
                  <text x={cx + 1.5 + BW / 2} y={y(p) - 4} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="currentColor" className="text-emerald-400">{fmtPct(p)}</text>
                </>
              )}
              <text x={cx} y={H - 4} textAnchor="middle" fontSize="8.5" fill="currentColor" className="text-ink-faint">{l}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const SubHead = ({ children }) => (
  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint mb-2">{children}</p>
)

export default function ExperimentDetailDrawer({ exp: e, roiFloor, onClose, onChanged, onNavigate }) {
  const [daily, setDaily] = useState(null)     // null=memuat, []=kosong
  const [sessions, setSessions] = useState([])
  const [spendFloor, setSpendFloor] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let on = true
    loadExperimentDaily({ videoId: e.creative_video_id, productId: e.product_id, campaignId: e.campaign_id })
      .then(r => { if (on) setDaily(r) })
      .catch(() => { if (on) setDaily([]) })
    if (e.creative_video_id) {
      loadBoostSessions({ days: 60 })
        .then(all => { if (on) setSessions(all.filter(s => s.item_id === e.creative_video_id)) })
        .catch(() => {})
    }
    getThresholds().then(t => { if (on) setSpendFloor(t.spendFloor ?? null) }).catch(() => {})
    return () => { on = false }
  }, [e.id, e.creative_video_id, e.product_id, e.campaign_id])

  useEffect(() => {
    const onKey = (ev) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const oc = liveConclusion(e, roiFloor)
  const checkpoints = Array.isArray(e.checkpoints) ? e.checkpoints : []
  const startDate = String(e.start_at || '').slice(0, 10) || null
  // Baris H+1/3/7 selalu tampil: pakai checkpoint tersimpan, atau tanggal jatuh
  // tempo terhitung dari mulai bila eval harian belum menuliskannya.
  const ckRows = ['H+1', 'H+3', 'H+7'].map(label => {
    const saved = checkpoints.find(c => c.label === label)
    if (saved) return saved
    const off = +label.slice(2)
    return { label, date: startDate ? addDaysISO(startDate, off) : null, roi: null }
  })

  const chartFrom = e.baseline_start || startDate
  const chartRows = daily == null ? null
    : (chartFrom ? daily.filter(r => r.date >= chartFrom) : daily).slice(-24)

  const baseAgg = windowAgg((daily || []).filter(r =>
    e.baseline_start && e.baseline_end && r.date >= e.baseline_start && r.date <= e.baseline_end))
  const postAgg = windowAgg((daily || []).filter(r => startDate && r.date >= startDate))
  const baseComparable = baseAgg && spendFloor != null ? baseAgg.spendTotal >= spendFloor : null

  async function act(fn) {
    setBusy(true)
    try { await fn(e.id); onChanged(); onClose() }
    catch (err) { alert('Gagal: ' + err.message); setBusy(false) }
  }
  function jumpToVideo() {
    try { sessionStorage.setItem('gmvJumpVideo', e.creative_video_id) } catch { /* storage penuh/di-block — lompat tanpa prefill */ }
    onClose()
    onNavigate?.('gmv_overview')
  }

  const measured = checkpoints.filter(c => c.roi != null)
  const bidLabel = (b) => (b === 'CREATIVE_NO_BID' ? 'Creative Boost' : b === 'NO_BID' ? 'Max Delivery' : (b || 'Sesi boost'))

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="glass-modal absolute right-0 top-0 h-full w-[600px] max-w-[94vw] border-l border-line/15 overflow-y-auto p-5">
        <button onClick={onClose} className="absolute top-4 right-4 text-ink-faint hover:text-ink" aria-label="Tutup">
          <X className="w-4 h-4" />
        </button>

        {/* Header sasaran */}
        <div className="flex items-center gap-2 flex-wrap pr-8">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md border text-blue-400 border-blue-500/30 bg-blue-500/10">{e.status}</span>
          <span className="text-[11px] text-ink-faint">{typeLabel(e.experiment_type)}</span>
        </div>
        <p className="text-[15px] font-semibold text-ink-strong mt-2">{e.treatment || '—'}</p>
        <p className="text-[11px] text-ink-faint mt-0.5 break-all">
          {e.creative_video_id ? <>video <span className="font-mono">{e.creative_video_id}</span></> : null}
          {e.product_id ? <> · produk <span className="font-mono">{e.product_id}</span></> : null}
          {e.campaign_id ? <> · campaign <span className="font-mono">{e.campaign_id}</span></> : null}
        </p>

        {/* Vonis + alasan */}
        <div className="mt-4 rounded-xl border border-line/15 bg-fill/[0.03] p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${CONC[oc.conclusion] || 'text-ink-muted'}`}>{CONCLUSION_LABEL[oc.conclusion] || oc.conclusion}</span>
            {oc.confidence && <span className="text-[11px] rounded-md border border-line/15 bg-fill/5 px-2 py-0.5 text-ink-muted">keyakinan <b className="text-ink">{oc.confidence}</b></span>}
            <span className="text-[11px] rounded-md border border-line/15 bg-fill/5 px-2 py-0.5 text-ink-muted">lantai ROI <b className="text-ink">{roiFloor != null ? fmtRoasX(roiFloor) : 'belum diset'}</b></span>
          </div>
          {(oc.reasons || []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {oc.reasons.map((r, i) => (
                <li key={i} className="text-xs text-ink-muted flex gap-2"><span className="text-ink-faint">·</span><span>{r}</span></li>
              ))}
            </ul>
          )}
        </div>

        {/* Grafik harian */}
        <div className="mt-5">
          <SubHead>Harian — revenue (hijau) vs cost (merah) · garis ROI · arsiran = baseline</SubHead>
          {chartRows == null && <p className="text-xs text-ink-faint py-6 text-center">Memuat deret harian…</p>}
          {chartRows != null && chartRows.length === 0 && <p className="text-xs text-ink-faint py-6 text-center">Belum ada data harian untuk sasaran ini.</p>}
          {chartRows != null && chartRows.length > 0 && (
            <DailyChart rows={chartRows} baselineStart={e.baseline_start} baselineEnd={e.baseline_end} startDate={startDate} checkpoints={checkpoints} />
          )}
        </div>

        {/* Checkpoint vs baseline */}
        <div className="mt-5">
          <SubHead>
            Checkpoint vs baseline
            {baseAgg?.roi != null ? <> — ROI baseline {fmtRoasX(baseAgg.roi)}{baseComparable != null && <> ({baseComparable ? 'sebanding ✓' : `tak sebanding — belanja ${fmtRpC(baseAgg.spendTotal)} < lantai ${fmtRpC(spendFloor)}`})</>}</> : null}
          </SubHead>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
                <th className="text-left font-semibold py-1.5 pr-2">Titik</th>
                <th className="text-left font-semibold py-1.5 pr-2">Tanggal</th>
                <th className="text-left font-semibold py-1.5 pr-2">ROI</th>
                <th className="text-left font-semibold py-1.5 pr-2">Δ ROI</th>
                <th className="text-left font-semibold py-1.5 pr-2">Revenue</th>
                <th className="text-left font-semibold py-1.5">Spend</th>
              </tr>
            </thead>
            <tbody>
              {ckRows.map(c => (
                <tr key={c.label} className="border-t border-line/10">
                  <td className="py-1.5 pr-2 font-medium text-ink">{c.label}</td>
                  <td className="py-1.5 pr-2 text-ink-muted">{fmtD(c.date)}</td>
                  <td className={`py-1.5 pr-2 ${c.roi != null ? 'text-emerald-400 font-semibold' : 'text-ink-faint'}`}>{c.roi != null ? fmtRoasX(Number(c.roi)) : 'menunggu'}</td>
                  <td className="py-1.5 pr-2">{c.roi_delta_vs_baseline != null
                    ? <span className={Number(c.roi_delta_vs_baseline) >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{Number(c.roi_delta_vs_baseline) >= 0 ? '+' : ''}{Number(c.roi_delta_vs_baseline).toFixed(1).replace('.', ',')}</span>
                    : <span className="text-ink-faint">—</span>}</td>
                  <td className="py-1.5 pr-2 text-ink-muted">{c.revenue != null ? fmtRp(Number(c.revenue)) : '—'}</td>
                  <td className="py-1.5 text-ink-muted">{c.spend != null ? fmtRp(Number(c.spend)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Metrik video: corong + retensi — hanya sasaran video */}
        {e.creative_video_id && (baseAgg || postAgg) && (
          <div className="mt-5">
            <SubHead>Metrik video — rata-rata/hari, baseline vs sejak mulai</SubHead>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="text-left font-semibold py-1.5 pr-2">Metrik</th>
                  <th className="text-left font-semibold py-1.5 pr-2">Baseline{baseAgg ? ` (${baseAgg.days}h)` : ''}</th>
                  <th className="text-left font-semibold py-1.5 pr-2">Sejak mulai{postAgg ? ` (${postAgg.days}h)` : ''}</th>
                  <th className="text-left font-semibold py-1.5">Δ</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Impresi', fmtN(baseAgg?.impD), fmtN(postAgg?.impD), deltaPctEl(baseAgg?.impD, postAgg?.impD)],
                  ['Klik', fmtN(baseAgg?.clkD), fmtN(postAgg?.clkD), deltaPctEl(baseAgg?.clkD, postAgg?.clkD)],
                  ['CTR', fmtPct(baseAgg?.ctr), fmtPct(postAgg?.ctr), deltaPtEl(baseAgg?.ctr, postAgg?.ctr)],
                  ['CVR', fmtPct(baseAgg?.cvr), fmtPct(postAgg?.cvr), deltaPtEl(baseAgg?.cvr, postAgg?.cvr)],
                  ['Order', fmtN(baseAgg?.ordD), fmtN(postAgg?.ordD), deltaPctEl(baseAgg?.ordD, postAgg?.ordD)],
                  ['Biaya / order', fmtRp(baseAgg?.cpo), fmtRp(postAgg?.cpo), deltaPctEl(baseAgg?.cpo, postAgg?.cpo, true)],
                ].map(([l, a, b, d]) => (
                  <tr key={l} className="border-t border-line/10">
                    <td className="py-1.5 pr-2 text-ink">{l}</td>
                    <td className="py-1.5 pr-2 text-ink-muted tabular-nums">{a}</td>
                    <td className="py-1.5 pr-2 text-ink tabular-nums">{b}</td>
                    <td className="py-1.5 tabular-nums">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(baseAgg?.vr || postAgg?.vr) && (
              <div className="mt-4">
                <SubHead>Retensi tontonan — baseline (redup) vs sejak mulai (hijau)</SubHead>
                <RetentionBars base={baseAgg?.vr} post={postAgg?.vr} />
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <div className="mt-5">
          <SubHead>Timeline</SubHead>
          <ul className="space-y-1.5">
            {e.contaminated && (
              <li className="text-xs text-amber-400 flex gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                <span><b>Tercampur</b> — ada perubahan lain di jendela ukur; eksperimen ini tidak dipakai menyimpulkan.</span>
              </li>
            )}
            {[...measured].reverse().map(c => (
              <li key={c.label} className="text-xs text-ink-muted flex gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <span><span className="font-mono text-ink-faint mr-1.5">{fmtD(c.date)}</span>Checkpoint <b className="text-ink">{c.label} terukur {fmtRoasX(Number(c.roi))}</b></span>
              </li>
            ))}
            {sessions.map(s => (
              <li key={s.session_id} className="text-xs text-ink-muted flex gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                <span><span className="font-mono text-ink-faint mr-1.5">{fmtD(s.first_seen)}</span>Sesi <b className="text-ink">{bidLabel(s.bid_type)}</b>{s.budget != null ? ` · ${fmtRp(Number(s.budget))}` : ''} · terlihat s/d {fmtD(s.last_seen)}</span>
              </li>
            ))}
            <li className="text-xs text-ink-muted flex gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
              <span><span className="font-mono text-ink-faint mr-1.5">{fmtD(e.start_at)}</span><b className="text-ink">Dicatat sebagai eksperimen</b> — {typeLabel(e.experiment_type)}</span>
            </li>
            {e.baseline_start && (
              <li className="text-xs text-ink-muted flex gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-faint mt-1.5 shrink-0" />
                <span><span className="font-mono text-ink-faint mr-1.5">{fmtD(e.baseline_start)}–{fmtD(e.baseline_end)}</span>Jendela baseline{baseAgg ? ` — rata-rata ${fmtRpC(baseAgg.spendTotal / baseAgg.days)}/hari, ROI ${fmtRoasX(baseAgg.roi)}` : ''}</span>
              </li>
            )}
          </ul>
        </div>

        {/* Footer aksi */}
        <div className="mt-5 pt-4 border-t border-line/10 flex items-center gap-2 flex-wrap">
          {e.creative_video_id && onNavigate && (
            <button onClick={jumpToVideo} className="text-xs px-3 py-1.5 rounded-lg bg-accent/15 text-accent font-medium hover:bg-accent/20 inline-flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> Lihat di Performa Video
            </button>
          )}
          {e.status === 'RUNNING' && (
            <span className="ml-auto flex items-center gap-2">
              <button disabled={busy} onClick={() => act(stopExperiment)} className="text-xs text-ink-muted border border-line/25 rounded-lg px-2.5 py-1.5 hover:bg-fill/5 disabled:opacity-50">Hentikan</button>
              <button disabled={busy} onClick={() => { if (confirm('Hapus eksperimen ini?')) act(deleteExperiment) }} className="text-xs text-red-400/80 border border-red-500/20 rounded-lg px-2.5 py-1.5 hover:bg-red-500/5 disabled:opacity-50">Hapus</button>
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Hentikan/Hapus hanya mengubah catatan eksperimen — TIDAK menghentikan boost/campaign di TikTok. Menghentikan iklan tetap lewat Seller Centre atau tombol eksekusi ber-approval.
        </p>
      </aside>
    </div>,
    document.body,
  )
}
