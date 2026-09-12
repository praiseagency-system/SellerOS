import { useState, useEffect, useCallback } from 'react'
import { Lock, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ApproverShell, LoginBox, Spinner, Notice } from '../components/ApproverChrome'
import { getPortalCampaigns } from '../data/campaignPortal'
import { skuApprovalSummary } from '../utils/campaignPricing'
import { campaignStatus, periodsSummary } from '../utils/campaignPeriods'

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('t') || ''
const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }
const Shell = ({ children }) => <ApproverShell label="Portal Campaign" wide>{children}</ApproverShell>

// Chip filter. `match` menentukan campaign mana yang masuk tiap kelompok;
// "Jeda antar periode" ikut Berjalan karena campaign-nya memang belum kelar.
const FILTERS = [
  { key: 'need',      label: 'Perlu keputusan', match: r => r.sum.pending > 0 },
  { key: 'running',   label: 'Berjalan',        match: r => r.status.key === 'running' || r.status.key === 'gap' },
  { key: 'scheduled', label: 'Terjadwal',       match: r => r.status.key === 'scheduled' },
  { key: 'ended',     label: 'Selesai',         match: r => r.status.key === 'ended' },
  { key: 'all',       label: 'Semua',           match: () => true },
]

// Urutan tampil: yang menunggu keputusan dulu, lalu yang sedang berjalan.
const ORDER = { running: 0, gap: 1, scheduled: 2, draft: 3, ended: 4 }
function sortRows(a, b) {
  const needA = a.sum.pending > 0 ? 0 : 1
  const needB = b.sum.pending > 0 ? 0 : 1
  if (needA !== needB) return needA - needB
  const oa = ORDER[a.status.key] ?? 9, ob = ORDER[b.status.key] ?? 9
  if (oa !== ob) return oa - ob
  return (b.c.startDate || '').localeCompare(a.c.startDate || '')
}

export default function PortalPage() {
  const { loading: authLoading, user } = useAuth()
  const token = tokenFromUrl()

  if (!token) return <Shell><Notice icon={Lock} title="Link tidak valid" body="Tautan portal tidak lengkap. Minta link baru dari tim." /></Shell>
  if (authLoading) return <Shell><Spinner /></Shell>
  if (!user) return <Shell><LoginBox body="Masukkan email yang diundang ke portal. Kami kirim link masuk — tanpa password." /></Shell>
  return <Shell><PortalBody token={token} email={user.email} /></Shell>
}

function PortalBody({ token, email }) {
  const [state, setState] = useState({ loading: true, error: null, workspace: null, campaigns: [] })
  const [filter, setFilter] = useState(null)   // null = ikut isi data

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const res = await getPortalCampaigns(token)
      setState({ loading: false, error: null, workspace: res.workspace || null, campaigns: res.campaigns || [] })
    } catch (e) {
      const msg = /not authorized/i.test(e.message) ? `Email ${email} tidak diundang ke portal ini. Klik "Keluar" lalu masuk dengan email yang diundang, atau minta admin menambahkan email ini.`
        : /invalid token/i.test(e.message) ? 'Link portal tidak valid atau sudah dicabut.'
        : 'Gagal memuat daftar campaign.'
      setState({ loading: false, error: msg, workspace: null, campaigns: [] })
    }
  }, [token, email])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (state.loading) return <Spinner />
  if (state.error) return <Notice icon={Lock} title="Tidak bisa diakses" body={state.error} />

  const rows = state.campaigns
    .map(c => ({ c, sum: skuApprovalSummary(c.items, c.approvals), status: campaignStatus(c) }))
    .sort(sortRows)
  const counts = Object.fromEntries(FILTERS.map(f => [f.key, rows.filter(f.match).length]))
  const active = filter || (counts.need > 0 ? 'need' : 'all')
  const shown = rows.filter(FILTERS.find(f => f.key === active).match)

  const pendingSku = rows.reduce((s, r) => s + r.sum.pending, 0)
  const doneCount = rows.length - counts.need

  return (
    <div>
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-4 mb-3">
        <p className="text-[17px] font-semibold text-ink-strong">
          {pendingSku > 0 ? `${pendingSku} SKU menunggu keputusan Anda` : 'Semua campaign sudah diputuskan'}
        </p>
        <p className="text-[11px] text-ink-faint mt-0.5">
          {state.workspace?.name ? `${state.workspace.name} · ` : ''}
          {pendingSku > 0
            ? `di ${counts.need} campaign · ${doneCount} campaign lain sudah beres`
            : `${rows.length} campaign`}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} disabled={counts[f.key] === 0 && f.key !== 'all'}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-35 ${
                active === f.key ? 'bg-blue-600 text-white' : 'bg-fill/6 text-ink-muted hover:bg-fill/10'}`}>
              {f.label} {counts[f.key]}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-[12px] text-ink-faint text-center py-10">Tidak ada campaign di kelompok ini.</p>
      ) : (
        <div className="space-y-2.5">
          {shown.map(r => <CampaignCard key={r.c.id} row={r} portalToken={token} />)}
        </div>
      )}

      <p className="text-[11px] text-ink-faint text-center mt-5">
        Masuk sebagai {email}. Daftar ini mengikuti campaign yang dibagikan tim.
      </p>
    </div>
  )
}

// Badge status persetujuan — ringkasan per SKU, sejalan dengan halaman /approve.
function approvalBadge(sum) {
  if (!sum.total) return { label: 'Belum ada SKU', cls: 'bg-fill/8 text-ink-muted' }
  if (sum.pending > 0) return { label: `${sum.pending} SKU menunggu`, cls: 'bg-amber-500/12 text-amber-300' }
  if (sum.rejected === sum.total) return { label: 'Semua ditolak', cls: 'bg-red-500/12 text-red-300' }
  if (sum.rejected > 0) return { label: `${sum.approved} disetujui · ${sum.rejected} ditolak`, cls: 'bg-red-500/12 text-red-300' }
  return { label: 'Semua disetujui', cls: 'bg-green-500/12 text-green-300' }
}

function CampaignCard({ row, portalToken }) {
  const { c, sum, status } = row
  const badge = approvalBadge(sum)
  const needs = sum.pending > 0
  const href = c.shareToken
    ? `/approve?t=${encodeURIComponent(c.shareToken)}&p=${encodeURIComponent(portalToken)}`
    : null
  const pctOf = n => (sum.total ? (n / sum.total) * 100 : 0)

  return (
    <div className={`bg-surface rounded-2xl border shadow-sm p-4 ${needs ? 'border-blue-500/35' : 'border-line/10'} ${status.key === 'ended' ? 'opacity-90' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${status.cls}`}>{status.label}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${badge.cls}`}>{badge.label}</span>
        <span className="ml-auto text-[11px] text-ink-faint">{PLATFORM_LABEL[c.platform] || c.platform}</span>
      </div>

      <p className="text-[14px] font-semibold text-ink-strong mt-2 truncate">{c.name}</p>
      <p className="text-[11px] text-ink-faint mt-0.5 truncate">
        {c.parentCampaign ? `${c.parentCampaign} · ` : ''}{periodsSummary(c)} · {sum.total} SKU
      </p>

      {sum.total > 0 && (sum.approved > 0 || sum.rejected > 0) && (
        <div className="mt-2.5 h-1.5 rounded-full bg-fill/8 overflow-hidden flex">
          <span className="bg-green-400/80" style={{ width: `${pctOf(sum.approved)}%` }} />
          <span className="bg-red-400/80" style={{ width: `${pctOf(sum.rejected)}%` }} />
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        {href ? (
          <a href={href}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
              needs ? 'bg-blue-600 text-white hover:bg-blue-700' : 'border border-line/15 text-ink hover:bg-fill/8'}`}>
            {needs ? 'Tinjau & putuskan' : 'Lihat rincian'} <ChevronRight className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="text-[11px] text-ink-faint">Rincian belum dibagikan tim.</span>
        )}
        {sum.total > 0 && (
          <span className="text-[11px] text-ink-faint">
            {sum.approved} disetujui{sum.rejected > 0 ? ` · ${sum.rejected} ditolak` : ''}{sum.pending > 0 ? ` · ${sum.pending} menunggu` : ''}
          </span>
        )}
      </div>
    </div>
  )
}
