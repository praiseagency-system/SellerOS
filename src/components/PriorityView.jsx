import { useMemo, useState } from 'react'
import { ListChecks, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { QUADRANT_CONFIG, fmtNum, fmtIDR, fmtCompact } from '../utils/quadrantUtils'
import { scoreProducts, funnelMedians, weakestStage } from '../utils/quadrantScoring'
import { recommendFor, PROBLEM_LABEL } from '../utils/quadrantRecommend'
import { STATUS, STATUS_LABEL } from '../data/quadrantPriorities'

// Prioritas: daftar kerja, bukan sekadar diagnosis.
// Peringkat memakai potensi rupiah × keyakinan data — bukan kuadran semata,
// dan produk bersampel kecil tak pernah diberi status "Segera".

const CONF_CLS = { high: 'bg-green-500/12 text-green-300', medium: 'bg-amber-500/12 text-amber-300', low: 'bg-gray-600/20 text-gray-400' }
const CONF_LABEL = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' }

const SORTS = [
  { id: 'score', label: 'Priority score tertinggi' },
  { id: 'potential', label: 'Potensi GMV terbesar' },
  { id: 'traffic', label: 'Traffic terbesar' },
  { id: 'gmv', label: 'GMV terbesar' },
  { id: 'due', label: 'Due date terdekat' },
]

export default function PriorityView({
  products, benchmark, marketplaceMode, periodValue, savedItems = [],
  onCreateLog, onUpdate, onOpenProduct,
}) {
  const [band, setBand] = useState('all')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('score')
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(null)

  const medians = useMemo(() => funnelMedians(products), [products])
  const savedByProduct = useMemo(() => {
    const m = new Map()
    for (const it of savedItems) m.set(it.canonicalProductId, it)
    return m
  }, [savedItems])

  const rows = useMemo(() => {
    const scored = scoreProducts(products || [], benchmark)
    return scored.map(s => {
      const rec = recommendFor(s.product, { medians, confidence: s.confidence, benchmark })
      const key = s.product.canonicalProductId || s.product.kode_produk
      return { ...s, rec, key, weak: weakestStage(s.product, medians), saved: savedByProduct.get(key) || null }
    })
  }, [products, benchmark, medians, savedByProduct])

  const shown = useMemo(() => {
    let arr = rows
    if (band !== 'all') arr = arr.filter(r => r.band.key === band)
    if (status !== 'all') arr = arr.filter(r => (r.saved?.status || 'none') === status)
    const n = v => (v == null ? -1 : v)
    return [...arr].sort((a, b) => {
      switch (sort) {
        case 'potential': return n(b.opportunity.potentialGmv) - n(a.opportunity.potentialGmv)
        case 'traffic': return n(b.product.qualifiedTraffic) - n(a.product.qualifiedTraffic)
        case 'gmv': return n(b.product.gmv) - n(a.product.gmv)
        case 'due': return (a.saved?.dueDate || '9999').localeCompare(b.saved?.dueDate || '9999')
        default: return n(b.priorityScore) - n(a.priorityScore)
      }
    })
  }, [rows, band, status, sort])

  async function act(fn, key) {
    setBusy(key)
    try { await fn() } catch (e) { alert(`Gagal menyimpan.\n\n${e?.message || ''}`) } finally { setBusy(null) }
  }

  if (!rows.length) {
    return (
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-10 text-center">
        <ListChecks className="w-7 h-7 text-ink-faint mx-auto mb-2" />
        <p className="text-sm text-ink-muted">Belum ada produk untuk dinilai pada periode ini.</p>
      </div>
    )
  }

  const counts = k => rows.filter(r => r.band.key === k).length

  return (
    <div className="bg-surface rounded-2xl border border-line/10 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-line/8 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-ink-strong">Prioritas</p>
          <p className="text-[11px] text-ink-faint">
            Peringkat dari potensi rupiah × keyakinan data · {shown.length} dari {rows.length} produk
          </p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {[['all', 'Semua'], ['urgent', 'Segera'], ['medium', 'Menengah'], ['watch', 'Pantau'], ['insufficient', 'Data kurang']].map(([id, label]) => (
            <button key={id} onClick={() => setBand(id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                band === id ? 'bg-blue-600 text-white' : 'text-ink-muted hover:text-ink hover:bg-fill/8'}`}>
              {label}{id !== 'all' && <span className="opacity-70"> · {counts(id)}</span>}
            </button>
          ))}
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="bg-fill/5 border border-line/10 rounded-lg px-2 py-1 text-[11px] text-ink focus:outline-none">
            <option value="all">Semua status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="bg-fill/5 border border-line/10 rounded-lg px-2 py-1 text-[11px] text-ink focus:outline-none">
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="divide-y divide-line/8">
        {shown.map(r => {
          const p = r.product
          const cfg = QUADRANT_CONFIG[p.quadrant]
          const open = openId === r.key
          const Chev = open ? ChevronDown : ChevronRight
          return (
            <div key={r.key} className="px-4 py-3">
              {/* Baris ringkas — detail lengkap disembunyikan sampai dibuka */}
              <div className="flex items-center gap-3">
                <button onClick={() => setOpenId(open ? null : r.key)} className="text-ink-faint hover:text-ink flex-shrink-0">
                  <Chev className="w-4 h-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] text-ink truncate max-w-[280px]" title={p.nama_produk}>{p.shortName || p.nama_produk}</p>
                    {cfg && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{ background: cfg.color + '22', color: cfg.color }}>Q{p.quadrant} · {cfg.short}</span>}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${r.band.cls}`}>{r.band.label}</span>
                    {r.saved && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-600/15 text-blue-300 flex-shrink-0">
                        {STATUS_LABEL[r.saved.status]}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-faint truncate mt-0.5">
                    {PROBLEM_LABEL[r.rec.category]}
                    {r.weak ? ` · tahap terlemah ${r.weak.label}` : ''}
                    {(p.platforms || []).length ? ` · ${(p.platforms).map(x => x.platform).join('+')}` : ''}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[9px] text-ink-faint leading-none mb-0.5">Potensi</p>
                  <span className="text-[12px] font-semibold text-ink-strong tabular-nums">
                    {r.opportunity.potentialGmv == null ? '—' : fmtCompact(r.opportunity.potentialGmv)}
                  </span>
                </div>
                <div className="text-right flex-shrink-0 w-14">
                  <p className="text-[9px] text-ink-faint leading-none mb-0.5">Skor</p>
                  <span className="text-[12px] font-semibold text-ink-strong tabular-nums">
                    {r.priorityScore == null ? '—' : `${r.priorityScore}`}
                  </span>
                </div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${CONF_CLS[r.confidence.level]}`}
                  title={r.confidence.reasons.join(' · ') || 'data lengkap'}>
                  {CONF_LABEL[r.confidence.level]}
                </span>
              </div>

              {open && (
                <div className="mt-3 rounded-xl border border-line/10 bg-fill/5 p-3 space-y-2.5">
                  <p className="text-[12px] text-ink">{r.rec.diagnosis}</p>
                  <ul className="space-y-1">
                    {r.rec.actions.map((a, i) => (
                      <li key={i} className="text-[12px] text-ink-muted flex items-start gap-1.5">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />{a}
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint pt-1.5 border-t border-line/8">
                    <span>Traffic <b className="text-ink">{fmtNum(p.qualifiedTraffic)}</b></span>
                    <span>ATC <b className="text-ink">{p.atcRate == null ? '—' : `${p.atcRate.toFixed(2)}%`}</b></span>
                    <span>CR <b className="text-ink">{p.conversionRate == null ? '—' : `${p.conversionRate.toFixed(2)}%`}</b></span>
                    <span>Benchmark CR <b className="text-ink">{benchmark?.conversionThreshold == null ? '—' : `${benchmark.conversionThreshold.toFixed(2)}%`}</b></span>
                    <span>GMV <b className="text-ink">{p.gmv == null ? '—' : fmtIDR(p.gmv)}</b></span>
                    <span>Potensi GMV <b className="text-ink">{r.opportunity.potentialGmv == null ? '—' : fmtIDR(Math.round(r.opportunity.potentialGmv))}</b></span>
                  </div>

                  {r.saved && (
                    <div className="text-[11px] text-ink-faint pt-1.5 border-t border-line/8">
                      Log dibuat {new Date(r.saved.createdAt).toLocaleDateString('id-ID')}
                      {r.saved.owner ? ` · penanggung jawab ${r.saved.owner}` : ''}
                      {r.saved.dueDate ? ` · tenggat ${r.saved.dueDate}` : ''}
                      {r.saved.beforeSnapshot?.conversionRate != null && (
                        <> · CR sebelum {r.saved.beforeSnapshot.conversionRate.toFixed(2)}%
                          {p.conversionRate != null && <>, sekarang {p.conversionRate.toFixed(2)}% ({(p.conversionRate - r.saved.beforeSnapshot.conversionRate) >= 0 ? '+' : ''}{(p.conversionRate - r.saved.beforeSnapshot.conversionRate).toFixed(2)} pp — perubahan terobservasi, bukan bukti sebab-akibat)</>}
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap pt-1.5 border-t border-line/8">
                    {!r.saved ? (
                      <button disabled={busy === r.key}
                        onClick={() => act(() => onCreateLog?.({ product: p, scored: r, recommendation: r.rec, marketplaceMode, periodValue, benchmark }), r.key)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                        Buat Log Optimasi
                      </button>
                    ) : (
                      <>
                        {r.saved.status === STATUS.OPEN && (
                          <button disabled={busy === r.key} onClick={() => act(() => onUpdate?.(r.saved.id, { status: STATUS.IN_PROGRESS }), r.key)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-line/15 text-ink-muted hover:text-ink transition-colors">
                            Tandai dikerjakan
                          </button>
                        )}
                        {r.saved.status !== STATUS.DONE && (
                          <button disabled={busy === r.key} onClick={() => act(() => onUpdate?.(r.saved.id, { status: STATUS.DONE }), r.key)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-line/15 text-green-400 hover:bg-green-500/10 transition-colors">
                            Tandai selesai
                          </button>
                        )}
                        {r.saved.status !== STATUS.DISMISSED && (
                          <button disabled={busy === r.key} onClick={() => act(() => onUpdate?.(r.saved.id, { status: STATUS.DISMISSED }), r.key)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-line/15 text-ink-faint hover:text-ink transition-colors">
                            Abaikan
                          </button>
                        )}
                      </>
                    )}
                    {onOpenProduct && (
                      <button onClick={() => onOpenProduct(p)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-line/15 text-ink-muted hover:text-ink transition-colors inline-flex items-center gap-1.5">
                        <ExternalLink className="w-3 h-3" /> Buka produk
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {shown.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-ink-faint">
            Tak ada produk pada filter ini. Kalau semua tindakan sudah selesai, ini kabar baik.
          </p>
        )}
      </div>
      <p className="px-4 py-2.5 text-[11px] text-ink-muted border-t border-line/8">
        Skor = potensi rupiah dinormalisasi × keyakinan data. Produk yang sampelnya belum memenuhi ambang minimum tidak diberi skor dan tidak pernah berstatus "Segera".
      </p>
    </div>
  )
}
