// Feature Registry (read-only) — menampilkan kapabilitas GMV Max NYATA per
// workspace: eligibility tenant + fitur campaign/identity yang tersedia/aktif,
// beserta source & confidence. TIDAK ada tombol yang mengubah setting TikTok.
import { useEffect, useState, useMemo } from 'react'
import { Loader2, ShieldCheck, ShieldAlert, Info } from 'lucide-react'
import { loadFeatureRegistry, tenantStatusFrom } from '../../data/gmvmaxFeatureRegistry'
import { EmptyState } from '../../components/gmvmax/ui'

const SCOPE_LABEL = { TENANT: 'Tenant', STORE: 'Store', CAMPAIGN: 'Campaign', PRODUCT: 'Produk', CREATIVE: 'Kreatif', IDENTITY: 'Identitas', LIVE: 'LIVE' }
const SCOPE_ORDER = ['TENANT', 'STORE', 'PRODUCT', 'CAMPAIGN', 'CREATIVE', 'IDENTITY', 'LIVE']

// Warna badge availability.
const AVAIL_TONE = {
  AVAILABLE: 'bg-emerald-500/15 text-emerald-500', ENABLED: 'bg-emerald-500/15 text-emerald-500', ACTIVE: 'bg-emerald-500/15 text-emerald-500',
  INACTIVE: 'bg-slate-500/15 text-slate-400', NOT_AVAILABLE: 'bg-red-500/15 text-red-500',
  AUTHORIZATION_MISMATCH: 'bg-red-500/15 text-red-500', PERMISSION_DENIED: 'bg-red-500/15 text-red-500',
  ROLLOUT_LIMITED: 'bg-amber-500/15 text-amber-500', UNKNOWN: 'bg-slate-500/15 text-slate-400',
  NOT_RETURNED: 'bg-amber-500/10 text-amber-500/80', DATA_UNAVAILABLE: 'bg-amber-500/10 text-amber-500/80',
  SCHEMA_ONLY: 'bg-violet-500/15 text-violet-400',
}
const CONF_TONE = { HIGH: 'text-emerald-500', MEDIUM: 'text-amber-500', LOW: 'text-slate-400', DATA_UNAVAILABLE: 'text-slate-500' }
const CAP_LABEL = { READ: 'Read', MONITOR: 'Monitor', RECOMMEND: 'Recommend', EXECUTE_SCHEMA_ONLY: 'Execute (schema-only)', EXECUTE_RUNTIME_VERIFIED: 'Execute (verified)' }

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
const yesno = (v) => (v === true ? 'Ya' : v === false ? 'Tidak' : '—')

function limitationOf(r) {
  const m = r.metadata || {}
  if (r.availability_status === 'NOT_RETURNED') return 'Field tak dikembalikan API'
  if (m.execute === 'SELLER_CENTER_ONLY') return 'Eksekusi hanya di Seller Center'
  if (m.execute === 'SCHEMA_ONLY' || r.capability_level === 'EXECUTE_SCHEMA_ONLY') return 'Eksekusi schema-only (belum diuji)'
  if (r.availability_status === 'DATA_UNAVAILABLE') return m.note || 'Data tak tersedia'
  if (r.availability_status === 'NOT_AVAILABLE') return m.note || 'Tak tersedia di API'
  if (m.note) return m.note
  return '—'
}

export default function FeatureRegistryPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    loadFeatureRegistry()
      .then(r => { if (alive) setRows(r) })
      .catch(e => { if (alive) setErr(e.message || String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const tenant = useMemo(() => tenantStatusFrom(rows), [rows])
  const groups = useMemo(() => {
    const by = {}
    for (const r of rows) (by[r.feature_scope] ||= []).push(r)
    return SCOPE_ORDER.filter(s => by[s]?.length).map(s => ({ scope: s, rows: by[s] }))
  }, [rows])

  const blocked = ['NOT_AVAILABLE', 'AUTHORIZATION_MISMATCH', 'PERMISSION_DENIED', 'STORE_NOT_FOUND'].includes(tenant.status)

  if (loading) return <div className="flex items-center justify-center py-32"><Loader2 className="w-6 h-6 text-accent animate-spin" /></div>
  if (err) return <div className="p-6"><div className="bg-red-500/10 text-red-500 rounded-xl p-4 text-sm">Gagal memuat registry: {err}</div></div>
  if (!rows.length) return <EmptyState title="Feature Registry belum terisi"
    desc="Registry diisi oleh proses verifikasi read-only per-tenant (Phase 1). Jalankan deteksi registry untuk workspace ini, atau tunggu worker read-only mengisinya." />

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* Banner eligibility tenant */}
      <div className={`rounded-2xl border p-4 flex items-start gap-3 ${blocked ? 'bg-red-500/5 border-red-500/20' : 'bg-emerald-500/5 border-emerald-500/20'}`}>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${blocked ? 'bg-red-500/15 text-red-500' : 'bg-emerald-500/15 text-emerald-500'}`}>
          {blocked ? <ShieldAlert className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Eligibility GMV Max: {tenant.status}</p>
          <p className="text-xs text-ink-faint mt-0.5">
            {blocked
              ? 'GMV Max tidak tersedia untuk advertiser yang tersambung ke workspace ini. Otorisasi eksklusif mungkin milik advertiser lain.'
              : (tenant.reason || 'Workspace ini eligible untuk GMV Max. Fitur di bawah terverifikasi read-only via MCP.')}
          </p>
        </div>
      </div>

      <p className="text-xs text-ink-faint flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" /> Read-only. Registry membedakan “ada di schema” vs “tersedia di runtime”. Tak ada aksi yang mengubah setting TikTok.
      </p>

      {groups.map(g => (
        <section key={g.scope} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{SCOPE_LABEL[g.scope] || g.scope}</h3>
          <div className="overflow-x-auto rounded-2xl border border-line/10 bg-surface">
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-faint border-b border-line/10">
                  <th className="text-left font-medium px-4 py-2.5">Feature</th>
                  <th className="text-left font-medium px-3 py-2.5">Availability</th>
                  <th className="text-center font-medium px-3 py-2.5">Enabled</th>
                  <th className="text-center font-medium px-3 py-2.5">Active</th>
                  <th className="text-left font-medium px-3 py-2.5">Capability</th>
                  <th className="text-left font-medium px-3 py-2.5">Source</th>
                  <th className="text-left font-medium px-3 py-2.5">Conf.</th>
                  <th className="text-left font-medium px-3 py-2.5">Last detected</th>
                  <th className="text-left font-medium px-3 py-2.5">Last changed</th>
                  <th className="text-left font-medium px-4 py-2.5">Limitation</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map(r => (
                  <tr key={r.id} className="border-b border-line/5 last:border-0">
                    <td className="px-4 py-2.5 text-ink font-medium whitespace-nowrap">{r.feature_code}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-medium ${AVAIL_TONE[r.availability_status] || 'bg-slate-500/15 text-slate-400'}`}>
                        {r.availability_status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-ink-faint">{yesno(r.enabled)}</td>
                    <td className="px-3 py-2.5 text-center text-ink-faint">{yesno(r.active)}</td>
                    <td className="px-3 py-2.5 text-ink-faint whitespace-nowrap">{CAP_LABEL[r.capability_level] || r.capability_level}</td>
                    <td className="px-3 py-2.5 text-ink-faint">{r.source}</td>
                    <td className={`px-3 py-2.5 font-medium ${CONF_TONE[r.confidence] || 'text-ink-faint'}`}>{r.confidence}</td>
                    <td className="px-3 py-2.5 text-ink-faint whitespace-nowrap">{fmtDate(r.last_detected_at)}</td>
                    <td className="px-3 py-2.5 text-ink-faint whitespace-nowrap">{fmtDate(r.last_changed_at)}</td>
                    <td className="px-4 py-2.5 text-ink-faint text-xs">{limitationOf(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
