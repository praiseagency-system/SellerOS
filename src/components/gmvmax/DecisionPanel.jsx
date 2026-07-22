// AI Insight — Decision Intelligence (Phase 3C, redesign keterbacaan). READ-ONLY
// penampil output Skills 1/2/3/4/9 yang sudah di-persist (gmvmax_skill_outputs).
// Prinsip: kesimpulan dulu di atas, kontras tinggi, jargon diterjemahkan ke bahasa
// manusia, bukti teknis disembunyikan. Tetap jujur (confidence/severity/limitations)
// & EXECUTION_ALLOWED=false. Tak ada tombol eksekusi.
import { useEffect, useState } from 'react'
import { loadLatestDecision, markReviewed, dismissDecision, snoozeDecision, clearReview } from '../../data/gmvmaxDecisions'
import { EmptyState } from './ui'

// Nama modul (skill) dalam bahasa manusia — dari docs/gmvmax-skills.
const SKILL_LABEL = {
  GMVMAX_SKILL_02: 'Keandalan data', GMVMAX_SKILL_03: 'Deteksi perubahan',
  GMVMAX_SKILL_04: 'Akar masalah', GMVMAX_SKILL_05: 'Optimasi target ROI',
  GMVMAX_SKILL_06: 'Alokasi modal', GMVMAX_SKILL_07: 'Suplai kreatif',
  GMVMAX_SKILL_08: 'Data real-time (LIVE)', GMVMAX_SKILL_09: 'Rekomendasi aksi',
}
const skillLabel = (code) => SKILL_LABEL[code] || `Modul ${String(code).slice(-2)}`

// Confidence → kata + warna.
const CONF_WORD = { HIGH: ['Baik', 'text-emerald-400'], MEDIUM: ['Cukup', 'text-amber-400'], LOW: ['Terbatas', 'text-orange-400'], DATA_INSUFFICIENT: ['Kurang', 'text-red-400'] }
const conf = (c) => CONF_WORD[c] || [c || '—', 'text-ink']

// Status aksi (Skill 9) → tampilan verdict banner.
const VERDICT = {
  OBSERVE: { label: 'AMATI DULU', sub: 'belum ada bukti cukup untuk scale atau kill', wrap: 'border-amber-500/40 bg-amber-500/[0.07]', bar: 'bg-amber-500', chip: 'bg-amber-500 text-amber-950', subtxt: 'text-amber-300' },
  SCALE: { label: 'SCALE', sub: 'kinerja kuat — layak dinaikkan', wrap: 'border-emerald-500/40 bg-emerald-500/[0.07]', bar: 'bg-emerald-500', chip: 'bg-emerald-500 text-emerald-950', subtxt: 'text-emerald-300' },
  BOOST: { label: 'BOOST', sub: 'ada peluang untuk didorong', wrap: 'border-blue-500/40 bg-blue-500/[0.07]', bar: 'bg-blue-500', chip: 'bg-blue-500 text-blue-950', subtxt: 'text-blue-300' },
  KILL: { label: 'HENTIKAN', sub: 'rugi konsisten — pertimbangkan stop', wrap: 'border-red-500/40 bg-red-500/[0.07]', bar: 'bg-red-500', chip: 'bg-red-500 text-red-950', subtxt: 'text-red-300' },
  MAINTAIN: { label: 'PERTAHANKAN', sub: 'stabil — tak ada perubahan disarankan', wrap: 'border-fill/20 bg-fill/5', bar: 'bg-ink-faint', chip: 'bg-ink-muted text-surface', subtxt: 'text-ink-muted' },
}
const verdictFor = (status) => VERDICT[status] || VERDICT.MAINTAIN

// Kesiapan modul (Skill 1 readiness).
const READY_ICON = { READY: ['✓', 'text-emerald-400 bg-emerald-500/10'], PARTIAL: ['◐', 'text-amber-400 bg-amber-500/10'], BLOCKED: ['✕', 'text-red-400 bg-red-500/10'] }

// Level diagnosis (Skill 4) → kata.
const LEVEL_WORD = {
  CONFIRMED_DRIVER: ['Penyebab terkonfirmasi', 'text-emerald-400 bg-emerald-500/10'],
  LIKELY_DRIVER: ['Kemungkinan penyebab', 'text-emerald-400 bg-emerald-500/10'],
  CONTRIBUTING_FACTOR: ['Faktor pendukung', 'text-amber-400 bg-amber-500/10'],
  CORRELATED_SIGNAL: ['Baru sinyal korelasi', 'text-blue-400 bg-blue-500/10'],
  INSUFFICIENT_EVIDENCE: ['Bukti belum cukup', 'text-ink-muted bg-fill/10'],
}

// Kategori event (Skill 3) → label ID.
const CAT_LABEL = { PERFORMANCE: 'Kinerja', EFFICIENCY: 'Efisiensi', CREATIVE_SUPPLY: 'Suplai kreatif', PRODUCT_HEALTH: 'Kesehatan produk', BUDGET: 'Budget', SPEND: 'Belanja iklan' }

// Slug data yang belum tersedia → bahasa manusia.
const MISS_LABEL = {
  source_breakdown: 'rincian sumber traffic', prior_snapshots: 'snapshot periode pembanding',
  experiment_evidence: 'bukti eksperimen A/B', organic_store_data: 'data organik toko',
  live_data: 'data real-time (LIVE)',
}
const missLabel = (m) => MISS_LABEL[m] || String(m).replace(/_/g, ' ')

const DECISION_READY = { OBSERVE_ONLY: 'hanya untuk observasi', SCALE_READY: 'siap untuk keputusan scale', DECISION_READY: 'siap untuk keputusan' }

const Card = ({ children, className = '' }) => <div className={`rounded-xl border border-line/20 bg-surface p-4 ${className}`}>{children}</div>
const H = ({ children, sub }) => <div className="mb-3"><span className="text-sm font-semibold text-ink-strong">{children}</span>{sub && <span className="text-xs text-ink-muted font-normal"> {sub}</span>}</div>

export default function DecisionPanel() {
  const [s, setS] = useState({ loading: true })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    loadLatestDecision().then(r => live && setS({ loading: false, ...r })).catch(e => live && setS({ loading: false, error: e.message }))
    return () => { live = false }
  }, [])

  // Triase (#3a): tulis kolom review + update optimistik (revert bila gagal).
  async function doReview(fn, optimistic) {
    if (busy || !s.date) return
    const prev = s.review
    setBusy(true)
    setS(x => ({ ...x, review: optimistic }))
    try { await fn(s.date) }
    catch (e) { setS(x => ({ ...x, review: prev })); alert('Gagal menyimpan status tinjauan: ' + e.message) }
    finally { setBusy(false) }
  }
  const onReviewed = () => doReview(markReviewed, { reviewed_at: new Date().toISOString(), dismissed_at: null, snoozed_until: null })
  const onDismiss = () => doReview(dismissDecision, { ...(s.review || {}), dismissed_at: new Date().toISOString() })
  const onSnooze = (days) => { const u = new Date(Date.now() + days * 864e5).toISOString(); doReview(d => snoozeDecision(d, u), { reviewed_at: null, dismissed_at: null, snoozed_until: u }) }
  const onClear = () => doReview(clearReview, { reviewed_at: null, dismissed_at: null, snoozed_until: null })

  if (s.loading) return <p className="text-sm text-ink-muted py-10 text-center">Memuat keputusan…</p>
  if (s.error) return <EmptyState title="Gagal memuat" desc={s.error} />
  if (s.available === false) return <EmptyState title="Belum aktif" desc="Tabel decision intelligence (migrasi 0026/0027) belum di-apply, atau belum ada output ter-generate." />
  if (s.empty) return <EmptyState title="Belum ada keputusan" desc="Output belum di-generate untuk workspace ini. Akan muncul setelah pipeline harian dijalankan." />

  const s1 = s.skills.GMVMAX_SKILL_01?.payload, s2 = s.skills.GMVMAX_SKILL_02?.payload
  const s3 = s.skills.GMVMAX_SKILL_03?.payload, s4 = s.skills.GMVMAX_SKILL_04?.payload
  const s9 = s.skills.GMVMAX_SKILL_09?.payload
  const audit = s2?.attribution_audit || {}
  const dq = s.dataQuality || {}

  const actions = s9?.primary_actions || []
  const topAction = actions[0]
  const diagnoses = s4?.diagnoses || []
  const topDiag = diagnoses[0]
  const v = verdictFor(topAction?.status)
  const verdictSentence = topAction?.explanation || topAction?.title_en || topAction?.title
    || (topDiag ? `${topDiag.observed_outcome} — ${topDiag.candidate_driver}.` : 'Tak ada perubahan yang disarankan hari ini.')

  const readiness = s1?.blueprint?.DOWNSTREAM_SKILL_READINESS || []
  const [c1word, c1cls] = conf(s.skills.GMVMAX_SKILL_01?.confidence)
  const [c2word, c2cls] = conf(audit.attribution_confidence)

  // Kalimat keandalan angka (dinamis, honest).
  const relBits = []
  if (audit.incrementality_confidence === 'NOT_MEASURABLE') relBits.push('efek tambahan iklan belum bisa diukur')
  if (audit.organic_overlap && audit.organic_overlap !== 'NONE') relBits.push(`overlap organik ${audit.organic_overlap === 'UNKNOWN' ? 'tak diketahui' : audit.organic_overlap.toLowerCase()}`)
  if (audit.cannibalization_risk && audit.cannibalization_risk !== 'NONE') relBits.push(`kanibalisasi ${audit.cannibalization_risk === 'UNKNOWN' ? 'tak diketahui' : audit.cannibalization_risk.toLowerCase()}`)

  const missing = [...new Set([...(s1?.missing_data || []), ...(s2?.missing_data || [])])]
  const limitations = s1?.limitations || []

  return (
    <div className="space-y-5">
      {/* Meta */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink-muted">Tanggal <b className="text-ink-strong">{s.date}</b></span>
        <span className="text-ink-faint">· Generated {s.generatedAt ? new Date(s.generatedAt).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
        <span className="ml-auto rounded-md border border-line/30 bg-fill/5 px-2.5 py-1 text-ink-muted font-medium">Read-only · tak ada eksekusi</span>
      </div>

      {/* Triase keputusan (#3a) — hanya menandai status, tak mengeksekusi apa pun */}
      <ReviewBar review={s.review} busy={busy} onReviewed={onReviewed} onDismiss={onDismiss} onSnooze={onSnooze} onClear={onClear} />

      {/* Verdict banner — kesimpulan hari ini */}
      <div className={`rounded-xl border ${v.wrap} border-l-4 p-4 relative overflow-hidden`}>
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${v.bar}`} />
        <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${v.chip}`}>{v.label}</span>
          <span className={`text-sm ${v.subtxt}`}>{v.sub}</span>
        </div>
        <p className="text-[15px] text-ink-strong leading-relaxed">{verdictSentence}</p>
      </div>

      {/* Kesiapan data + Keandalan angka */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <div className="text-sm font-semibold text-ink-strong">Kesiapan data</div>
          <div className="text-xs text-ink-muted mb-3">Seberapa lengkap data untuk ambil keputusan</div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-2xl font-bold ${c1cls}`}>{c1word}</span>
            {readiness.length > 0 && <span className="text-xs text-ink-muted">{readiness.filter(r => r.status === 'READY').length}/{readiness.length} modul siap</span>}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {readiness.map(r => {
              const [icon, cls] = READY_ICON[r.status] || ['·', 'text-ink-muted bg-fill/10']
              return <span key={r.skill_code} className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md ${cls}`}><b>{icon}</b>{skillLabel(r.skill_code)}</span>
            })}
          </div>
        </Card>
        <Card>
          <div className="text-sm font-semibold text-ink-strong">Keandalan angka</div>
          <div className="text-xs text-ink-muted mb-3">Seberapa bisa dipercaya atribusi order</div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-2xl font-bold ${c2cls}`}>{c2word}</span>
            <span className="text-xs text-ink-muted">→ {DECISION_READY[audit.decision_readiness] || audit.decision_readiness || '—'}</span>
          </div>
          {relBits.length > 0 && <p className="text-xs text-ink-muted leading-relaxed">{relBits.join('; ')}.</p>}
        </Card>
      </div>

      {/* Perubahan hari ini (Skill 3) */}
      <div>
        <H sub={`— ${s3?.event_count ?? 0} catatan (deskriptif, bukan alarm)`}>Perubahan hari ini</H>
        {(s3?.events || []).length ? (
          <div className="rounded-xl border border-line/20 bg-surface overflow-hidden">
            {(s3.events).slice(0, 8).map((e, i) => (
              <div key={e.event_id || i} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-line/10' : ''}`}>
                <span className="text-sm text-ink flex-1">{e.title_en || e.title}</span>
                <span className="text-xs text-ink-muted whitespace-nowrap">{CAT_LABEL[e.category] || e.category}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-ink-muted">Tak ada perubahan material.</p>}
      </div>

      {/* Akar masalah (Skill 4) */}
      {diagnoses.length > 0 && (
        <div>
          <H sub={`— ${s4?.diagnosis_count ?? diagnoses.length}`}>Dugaan akar masalah</H>
          <div className="space-y-2">
            {diagnoses.map(d => {
              const [word, cls] = LEVEL_WORD[d.level] || ['—', 'text-ink-muted bg-fill/10']
              return (
                <Card key={d.diagnosis_id}>
                  <p className="text-[15px] text-ink-strong font-medium">{d.observed_outcome}</p>
                  <p className="text-sm text-ink-muted mt-1 mb-2.5">{d.candidate_driver}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] px-2 py-1 rounded-md ${cls}`}>{word}</span>
                    <span className="text-xs text-ink-muted">keyakinan {conf(d.confidence)[0].toLowerCase()} — belum tentu penyebab</span>
                  </div>
                  {!!(d.alternative_explanations || []).length && <p className="mt-2 text-xs text-ink-muted">Bisa juga karena: {d.alternative_explanations.slice(0, 3).join(' · ')}</p>}
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Rekomendasi aksi (Skill 9) */}
      <div>
        <H sub="— maks 3, tanpa eksekusi otomatis">Rekomendasi aksi</H>
        {actions.length ? (
          <div className="space-y-2">
            {actions.map(a => (
              <Card key={a.recommendation_id}>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-[11px] px-2 py-1 rounded-md bg-fill/10 text-ink font-semibold">{a.status}</span>
                  {a.approval_required && <span className="text-[11px] px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 font-semibold">perlu persetujuan</span>}
                  <span className="text-xs text-ink-muted">keyakinan {conf(a.confidence)[0].toLowerCase()}</span>
                </div>
                <p className="text-[15px] text-ink-strong">{a.title_en || a.title}</p>
                {a.explanation && <p className="text-sm text-ink-muted mt-1">{a.explanation}</p>}
                {(a.success_metric || a.stop_condition) && (
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {a.success_metric && <span className="text-ink-muted"><span className="text-emerald-400">Sukses bila:</span> {a.success_metric}</span>}
                    {a.stop_condition && <span className="text-ink-muted"><span className="text-red-400">Stop bila:</span> {a.stop_condition}</span>}
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : <p className="text-sm text-ink-muted">Tak ada aksi utama — pertahankan.</p>}
        {!!(s9?.conflicts || []).length && (
          <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
            <b>Konflik ({s9.conflicts.length}):</b> {s9.conflicts.map(c => c.description).join(' · ')}
          </div>
        )}
      </div>

      {/* Detail teknis — disembunyikan */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-ink-muted select-none list-none flex items-center gap-1.5 hover:text-ink">
          <span className="transition-transform group-open:rotate-90">▸</span> Detail teknis (bukti, snapshot, data yang belum tersedia)
        </summary>
        <div className="mt-2 rounded-xl border border-line/15 bg-fill/[0.02] p-4 text-xs text-ink-muted space-y-2">
          {(missing.length > 0 || limitations.length > 0) && (
            <p><b className="text-ink">Belum tersedia:</b> {[...missing.map(missLabel), ...limitations].slice(0, 8).join(' · ')}</p>
          )}
          <p>Kualitas data: paginasi {dq.pagination_complete === true ? 'lengkap' : String(dq.pagination_complete ?? '—')} · sumber {dq.sources_processed ?? '—'}/{dq.sources_expected ?? '—'} · parity {dq.parity_status === 'MISMATCH' ? <span className="text-amber-400">MISMATCH (perlu diverifikasi)</span> : (dq.parity_status ?? '—')}</p>
          <p className="break-all text-ink-faint">Snapshot {(s.skills.GMVMAX_SKILL_01?.source_snapshot_ids || []).join(', ') || '—'}</p>
          <p className="break-all text-ink-faint">Signature {s.skills.GMVMAX_SKILL_09?.deterministic_signature?.slice(0, 26) || '—'}…</p>
        </div>
      </details>
    </div>
  )
}

// Bar triase (#3a): tandai keputusan Sudah ditinjau / Snooze / Dismiss. Read-only —
// hanya menulis kolom review (reviewed_at/dismissed_at/snoozed_until), tak eksekusi.
function ReviewBar({ review, busy, onReviewed, onDismiss, onSnooze, onClear }) {
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const r = review || {}
  const fmt = (iso) => new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const fmtD = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
  const clearBtn = <button disabled={busy} onClick={onClear} className="ml-auto text-xs text-ink-muted border border-line/30 rounded-lg px-2.5 py-1 hover:bg-fill/5 disabled:opacity-50">Batalkan</button>
  const wrap = (cls, dot, children) => (
    <div className={`flex items-center gap-3 flex-wrap rounded-xl border px-4 py-2.5 text-sm ${cls}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />{children}
    </div>
  )

  if (r.reviewed_at) return wrap('border-emerald-500/30 bg-emerald-500/[0.06]', 'bg-emerald-500',
    <><span className="text-ink-strong">✓ Sudah ditinjau <span className="text-ink-muted">· {fmt(r.reviewed_at)}</span></span>{clearBtn}</>)
  if (r.snoozed_until) return wrap('border-blue-500/30 bg-blue-500/[0.06]', 'bg-blue-500',
    <><span className="text-ink-strong">⏰ Ditunda s/d <b>{fmtD(r.snoozed_until)}</b> <span className="text-ink-muted">· diingatkan lagi nanti</span></span>{clearBtn}</>)
  if (r.dismissed_at) return wrap('border-line/20 bg-fill/5', 'bg-ink-faint',
    <><span className="text-ink-muted">✕ Diabaikan · {fmt(r.dismissed_at)}</span>{clearBtn}</>)

  return wrap('border-line/20 bg-surface', 'bg-amber-500',
    <>
      <span className="text-ink">Keputusan hari ini <span className="text-ink-muted">· belum ditinjau</span></span>
      <div className="ml-auto flex items-center gap-2 flex-wrap">
        <button disabled={busy} onClick={onReviewed} className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1 hover:bg-emerald-500/15 disabled:opacity-50">✓ Tandai ditinjau</button>
        <div className="relative">
          <button disabled={busy} onClick={() => setSnoozeOpen(o => !o)} className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-lg px-2.5 py-1 hover:bg-blue-500/15 disabled:opacity-50">⏰ Snooze ▾</button>
          {snoozeOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 rounded-lg border border-line/20 bg-surface shadow-lg py-1">
              {[1, 3, 7].map(d => (
                <button key={d} disabled={busy} onClick={() => { setSnoozeOpen(false); onSnooze(d) }}
                  className="block w-full text-left text-xs text-ink-muted px-3 py-1.5 hover:bg-fill/5 whitespace-nowrap disabled:opacity-50">+{d} hari</button>
              ))}
            </div>
          )}
        </div>
        <button disabled={busy} onClick={onDismiss} className="text-xs text-ink-muted bg-fill/5 border border-line/20 rounded-lg px-2.5 py-1 hover:bg-fill/10 disabled:opacity-50">✕ Dismiss</button>
      </div>
    </>)
}
