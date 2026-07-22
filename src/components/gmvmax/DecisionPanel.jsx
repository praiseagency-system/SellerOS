// AI Insight — Decision Intelligence (Phase 3C). READ-ONLY penampil output Skills
// 1/2/3/4/9 yang sudah di-persist (gmvmax_skill_outputs). Evidence-first, jujur:
// menampilkan confidence/severity, missing data, limitations, dan
// EXECUTION_ALLOWED=false. Tak ada tombol eksekusi (View/Copy saja).
import { useEffect, useState } from 'react'
import { loadLatestDecision } from '../../data/gmvmaxDecisions'
import { EmptyState, SectionTitle } from './ui'

const SEV = { CRITICAL: 'text-red-500 border-red-500/40 bg-red-500/10', HIGH: 'text-orange-500 border-orange-500/40 bg-orange-500/10', MEDIUM: 'text-amber-500 border-amber-500/40 bg-amber-500/10', LOW: 'text-blue-500 border-blue-500/40 bg-blue-500/10', INFO: 'text-ink-muted border-fill/20 bg-fill/5' }
const CONF = { HIGH: 'text-emerald-500', MEDIUM: 'text-amber-500', LOW: 'text-ink-muted', DATA_INSUFFICIENT: 'text-ink-faint' }
const LEVEL = { CONFIRMED_DRIVER: 'text-emerald-500', LIKELY_DRIVER: 'text-emerald-500', CONTRIBUTING_FACTOR: 'text-amber-500', CORRELATED_SIGNAL: 'text-blue-500', INSUFFICIENT_EVIDENCE: 'text-ink-faint' }

const Badge = ({ children, cls }) => <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${cls}`}>{children}</span>

export default function DecisionPanel() {
  const [s, setS] = useState({ loading: true })
  useEffect(() => {
    let live = true
    loadLatestDecision().then(r => live && setS({ loading: false, ...r })).catch(e => live && setS({ loading: false, error: e.message }))
    return () => { live = false }
  }, [])

  if (s.loading) return <p className="text-sm text-ink-faint py-10 text-center">Memuat keputusan…</p>
  if (s.error) return <EmptyState title="Gagal memuat" desc={s.error} />
  if (s.available === false) return <EmptyState title="Belum aktif" desc="Tabel decision intelligence (migrasi 0026/0027) belum di-apply, atau belum ada output ter-generate." />
  if (s.empty) return <EmptyState title="Belum ada keputusan" desc="Output belum di-generate untuk workspace ini. Akan muncul setelah pipeline harian dijalankan." />

  const s1 = s.skills.GMVMAX_SKILL_01?.payload, s2 = s.skills.GMVMAX_SKILL_02?.payload
  const s3 = s.skills.GMVMAX_SKILL_03?.payload, s4 = s.skills.GMVMAX_SKILL_04?.payload
  const s9 = s.skills.GMVMAX_SKILL_09?.payload
  const audit = s2?.attribution_audit || {}
  const dq = s.dataQuality || {}

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-ink-muted">Tanggal <b className="text-ink">{s.date}</b></span>
        <span className="text-ink-faint">·</span>
        <span className="text-ink-muted">Generated {s.generatedAt ? new Date(s.generatedAt).toLocaleString('id-ID') : '—'}</span>
        <span className="ml-auto"><Badge cls="text-ink-faint border-fill/20 bg-fill/5">EXECUTION_ALLOWED = false</Badge></span>
      </div>

      {/* 1) Kondisi Bisnis + Keandalan Data */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-fill/10 bg-fill/[0.03] p-4">
          <SectionTitle>Kondisi Bisnis <span className="text-ink-faint font-normal">(Skill 1)</span></SectionTitle>
          <p className="mt-2 text-sm">Kesiapan data: <b className={CONF[s.skills.GMVMAX_SKILL_01?.confidence] || 'text-ink'}>{s.skills.GMVMAX_SKILL_01?.confidence || '—'}</b></p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(s1?.blueprint?.DOWNSTREAM_SKILL_READINESS || []).map(r => (
              <Badge key={r.skill_code} cls={r.status === 'READY' ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5' : r.status === 'BLOCKED' ? 'text-red-500 border-red-500/30 bg-red-500/5' : 'text-amber-500 border-amber-500/30 bg-amber-500/5'}>
                {r.skill_code.slice(-2)}:{r.status}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-fill/10 bg-fill/[0.03] p-4">
          <SectionTitle>Keandalan Data <span className="text-ink-faint font-normal">(Skill 2)</span></SectionTitle>
          <div className="mt-2 space-y-1 text-sm">
            <p>Attribution confidence: <b className={CONF[audit.attribution_confidence] || 'text-ink'}>{audit.attribution_confidence || '—'}</b></p>
            <p>Decision readiness: <b className="text-ink">{audit.decision_readiness || '—'}</b></p>
            <p className="text-ink-muted">Incrementality: {audit.incrementality_confidence || '—'} · Organic: {audit.organic_overlap || '—'} · Cannibalization: {audit.cannibalization_risk || '—'}</p>
          </div>
        </div>
      </div>

      {/* 2) Perubahan Hari Ini (Skill 3) */}
      <div>
        <SectionTitle>Perubahan Hari Ini <span className="text-ink-faint font-normal">(Skill 3 · {s3?.event_count ?? 0} event)</span></SectionTitle>
        <div className="mt-2 space-y-1.5">
          {(s3?.events || []).slice(0, 8).map(e => (
            <div key={e.event_id} className="flex items-center gap-2 text-sm">
              <Badge cls={SEV[e.severity] || SEV.INFO}>{e.severity}</Badge>
              <span className="text-ink-faint text-[11px]">{e.category}</span>
              <span className="text-ink">{e.title_en || e.title}</span>
              {e.mode === 'DESCRIPTIVE_ONLY' && <span className="text-ink-faint text-[11px]">· deskriptif</span>}
            </div>
          ))}
          {!(s3?.events || []).length && <p className="text-sm text-ink-faint">Tak ada event material.</p>}
        </div>
      </div>

      {/* 3) Akar Masalah (Skill 4) */}
      <div>
        <SectionTitle>Akar Masalah <span className="text-ink-faint font-normal">(Skill 4 · {s4?.diagnosis_count ?? 0})</span></SectionTitle>
        <div className="mt-2 space-y-2">
          {(s4?.diagnoses || []).map(d => (
            <div key={d.diagnosis_id} className="rounded-lg border border-fill/10 bg-fill/[0.02] p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge cls={`${LEVEL[d.level] || 'text-ink-faint'} border-fill/20 bg-fill/5`}>{d.level}</Badge>
                <span className={`text-[11px] ${CONF[d.confidence] || 'text-ink-faint'}`}>{d.confidence}</span>
              </div>
              <p className="mt-1.5"><b className="text-ink">{d.observed_outcome}</b> <span className="text-ink-faint">→</span> {d.candidate_driver}</p>
              {!!(d.alternative_explanations || []).length && <p className="mt-1 text-[12px] text-ink-muted">Alternatif: {d.alternative_explanations.slice(0, 3).join(' · ')}</p>}
            </div>
          ))}
          {!(s4?.diagnoses || []).length && <p className="text-sm text-ink-faint">Belum ada diagnosis.</p>}
        </div>
      </div>

      {/* 4) Rekomendasi Aksi (Skill 9) */}
      <div>
        <SectionTitle>Rekomendasi Aksi <span className="text-ink-faint font-normal">(Skill 9 · maks 3)</span></SectionTitle>
        <div className="mt-2 space-y-2">
          {(s9?.primary_actions || []).map(a => (
            <div key={a.recommendation_id} className="rounded-lg border border-fill/10 bg-fill/[0.02] p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge cls="text-ink border-fill/20 bg-fill/5">{a.status}</Badge>
                {a.approval_required && <Badge cls="text-amber-500 border-amber-500/40 bg-amber-500/10">APPROVAL</Badge>}
                <span className="text-[11px] text-ink-faint">confidence {a.confidence}</span>
              </div>
              <p className="mt-1.5 text-ink">{a.title_en || a.title}</p>
              {a.explanation && <p className="mt-0.5 text-[12px] text-ink-muted">{a.explanation}</p>}
              <p className="mt-1 text-[11px] text-ink-faint">Sukses bila: {a.success_metric} · Stop: {a.stop_condition}</p>
            </div>
          ))}
          {!(s9?.primary_actions || []).length && <p className="text-sm text-ink-faint">Tak ada aksi utama — pertahankan.</p>}
          {!!(s9?.conflicts || []).length && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-600">
              <b>Konflik ({s9.conflicts.length}):</b> {s9.conflicts.map(c => c.description).join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* 5) Missing / Limitations + Evidence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[12px]">
        <div className="rounded-xl border border-fill/10 bg-fill/[0.03] p-4">
          <SectionTitle>Data Kurang & Batasan</SectionTitle>
          <ul className="mt-2 space-y-0.5 text-ink-muted list-disc list-inside">
            {[...new Set([...(s1?.missing_data || []), ...(s.skills.GMVMAX_SKILL_02?.payload?.missing_data || [])])].slice(0, 6).map((m, i) => <li key={'m' + i}>{m}</li>)}
            {(s1?.limitations || []).slice(0, 4).map((l, i) => <li key={'l' + i} className="text-ink-faint">{l}</li>)}
            {!(s1?.missing_data || []).length && !(s1?.limitations || []).length && <li className="text-ink-faint list-none">—</li>}
          </ul>
        </div>
        <div className="rounded-xl border border-fill/10 bg-fill/[0.03] p-4">
          <SectionTitle>Bukti (Evidence)</SectionTitle>
          <div className="mt-2 space-y-1 text-ink-muted">
            <p>Data quality: paginasi {String(dq.pagination_complete ?? '—')} · sumber {dq.sources_processed ?? '—'}/{dq.sources_expected ?? '—'} · parity {dq.parity_status ?? '—'}</p>
            <p className="break-all">Source snapshot: {(s.skills.GMVMAX_SKILL_01?.source_snapshot_ids || []).join(', ') || '—'}</p>
            <p className="break-all text-ink-faint">Signature: {s.skills.GMVMAX_SKILL_09?.deterministic_signature?.slice(0, 26) || '—'}…</p>
          </div>
        </div>
      </div>
    </div>
  )
}
