import { useState, useEffect, useCallback } from 'react'
import { Lock, ChevronRight, ChevronDown, Folder, Clock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ApproverShell, LoginBox, Spinner, Notice } from '../components/ApproverChrome'
import { getPortalCampaigns } from '../data/campaignPortal'
import { skuApprovalSummary, hrefOf } from '../utils/campaignPricing'
import { registrationBadge, registrationDetail, registrationStatus } from '../utils/campaignRegistration'
import { campaignStatus, periodsSummary, campaignPeriods, periodSpan, periodRange } from '../utils/campaignPeriods'
import { decisionUrgency } from '../utils/campaignUrgency'

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('t') || ''
const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok' }
const PLATFORM_TAB_CLS = { tiktok: 'bg-gray-700 text-white', shopee: 'bg-orange-500/20 text-orange-300' }
// Platform selain shopee dianggap tiktok — sama dengan daftar campaign in-app.
const platformOf = c => (c.platform === 'shopee' ? 'shopee' : 'tiktok')
const Shell = ({ children }) => <ApproverShell label="Portal Campaign" wide>{children}</ApproverShell>

// Chip filter. `match` menentukan campaign mana yang masuk tiap kelompok;
// "Jeda antar periode" ikut Berjalan karena campaign-nya memang belum kelar.
// `r.need` = masih ada SKU menunggu DAN campaign belum selesai — campaign
// yang sudah lewat tak perlu diputuskan lagi (keputusan user 14 Sep 2026).
const FILTERS = [
  { key: 'need',      label: 'Perlu keputusan', match: r => r.need },
  { key: 'decided',   label: 'Sudah diputuskan', match: r => r.sum.total > 0 && r.sum.pending === 0 },
  { key: 'running',   label: 'Berjalan',        match: r => r.status.key === 'running' || r.status.key === 'gap' },
  { key: 'scheduled', label: 'Terjadwal',       match: r => r.status.key === 'scheduled' },
  { key: 'ended',     label: 'Selesai',         match: r => r.status.key === 'ended' },
  { key: 'all',       label: 'Semua',           match: () => true },
]

// Urutan tampil: yang menunggu keputusan dulu — diurutkan menurut urgensi
// (sudah berjalan → paling dekat tanggal mulai) — lalu sisanya per status.
const ORDER = { running: 0, gap: 1, scheduled: 2, draft: 3, ended: 4 }
function sortRows(a, b) {
  if (a.need !== b.need) return a.need ? -1 : 1
  if (a.need) {
    if (a.urg.rank !== b.urg.rank) return a.urg.rank - b.urg.rank
    if (a.urg.sortKey !== b.urg.sortKey) return a.urg.sortKey - b.urg.sortKey
  }
  const oa = ORDER[a.status.key] ?? 9, ob = ORDER[b.status.key] ?? 9
  if (oa !== ob) return oa - ob
  return (b.c.startDate || '').localeCompare(a.c.startDate || '')
}

// Kelompokkan baris per judul campaign induk (folder). Campaign tanpa induk
// jadi kartu lepas. Folder diurutkan seperti kartu: yang menunggu dulu.
function groupRows(rows) {
  const map = new Map(), loose = []
  for (const r of rows) {
    const key = (r.c.parentCampaign || '').trim()
    if (!key) { loose.push(r); continue }
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  const folders = [...map].map(([key, items]) => {
    const span = periodSpan(items.flatMap(r => campaignPeriods(r.c)))
    const pending = items.reduce((s, r) => s + (r.need ? r.sum.pending : 0), 0)
    const running = items.filter(r => r.status.key === 'running' || r.status.key === 'gap').length
    return {
      type: 'folder', key, items, pending, running,
      range: (span.start || span.end) ? periodRange({ start: span.start, end: span.end }) : 'tanpa tanggal',
      // Wakil untuk pengurutan: sub-campaign paling mendesak.
      lead: items[0],
    }
  })
  const out = [...folders, ...loose.map(r => ({ type: 'card', row: r }))]
  out.sort((a, b) => sortRows(a.type === 'folder' ? a.lead : a.row, b.type === 'folder' ? b.lead : b.row))
  return out
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
  const [platformTab, setPlatformTab] = useState(null)   // null = ikut isi data
  // Folder yang user buka/tutup sendiri; sisanya ikut default (terbuka bila
  // masih ada SKU menunggu).
  const [folderToggles, setFolderToggles] = useState(() => new Map())

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

  const allRows = state.campaigns
    .map(c => {
      const sum = skuApprovalSummary(c.items, c.approvals), status = campaignStatus(c)
      const need = sum.pending > 0 && status.key !== 'ended'
      return { c, sum, status, need, urg: need ? decisionUrgency(c) : null }
    })
    .sort(sortRows)

  // Tab platform: TikTok & Shopee dipisah. Default ke platform yang punya
  // SKU menunggu; kalau tak ada, ke yang ada isinya.
  const perPlatform = { tiktok: { n: 0, pending: 0 }, shopee: { n: 0, pending: 0 } }
  for (const r of allRows) { const p = perPlatform[platformOf(r.c)]; p.n++; if (r.need) p.pending += r.sum.pending }
  const tab = platformTab
    || (perPlatform.tiktok.pending === 0 && perPlatform.shopee.pending > 0 ? 'shopee' : null)
    || (perPlatform.tiktok.n === 0 && perPlatform.shopee.n > 0 ? 'shopee' : 'tiktok')
  const rows = allRows.filter(r => platformOf(r.c) === tab)

  const counts = Object.fromEntries(FILTERS.map(f => [f.key, rows.filter(f.match).length]))
  const active = filter && counts[filter] > 0 ? filter : (counts.need > 0 ? 'need' : 'all')
  const shown = rows.filter(FILTERS.find(f => f.key === active).match)
  const grouped = groupRows(shown)

  const pendingSku = allRows.reduce((s, r) => s + (r.need ? r.sum.pending : 0), 0)
  const needAll = allRows.filter(r => r.need).length
  const endedUndecided = allRows.filter(r => !r.need && r.sum.pending > 0).length
  const doneCount = allRows.length - needAll - endedUndecided
  const urgentCount = allRows.filter(r => r.need && r.urg.cls.includes('red')).length
  const platformNote = ['tiktok', 'shopee']
    .filter(id => perPlatform[id].pending > 0)
    .map(id => `${PLATFORM_LABEL[id]} ${perPlatform[id].pending} SKU`).join(' · ')

  const isOpen = f => folderToggles.has(f.key) ? folderToggles.get(f.key) : f.pending > 0
  const toggleFolder = f => setFolderToggles(prev => new Map(prev).set(f.key, !isOpen(f)))

  return (
    <div>
      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-4 mb-3">
        <p className="text-[17px] font-semibold text-ink-strong">
          {pendingSku > 0 ? `${pendingSku} SKU menunggu keputusan Anda` : 'Semua campaign sudah diputuskan'}
        </p>
        <p className="text-[11px] text-ink-faint mt-0.5">
          {state.workspace?.name ? `${state.workspace.name} · ` : ''}
          {pendingSku > 0
            ? `di ${needAll} campaign (${platformNote})${urgentCount > 0 ? ` · ${urgentCount} mendesak` : ''} · ${doneCount} campaign lain sudah beres${endedUndecided > 0 ? ` · ${endedUndecided} selesai tanpa keputusan` : ''}`
            : `${allRows.length} campaign${endedUndecided > 0 ? ` · ${endedUndecided} selesai tanpa keputusan` : ''}`}
        </p>

        {/* Tab platform — campaign TikTok & Shopee dipisah */}
        <div className="flex items-center gap-1.5 mt-3 border-b border-line/8 pb-2.5">
          {['tiktok', 'shopee'].map(id => {
            const on = tab === id, p = perPlatform[id]
            return (
              <button key={id} type="button" onClick={() => setPlatformTab(id)} disabled={p.n === 0}
                className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-colors disabled:opacity-35 ${
                  on ? PLATFORM_TAB_CLS[id] : 'text-ink-muted hover:text-ink hover:bg-fill/8'}`}>
                {PLATFORM_LABEL[id]} <span className={on ? 'opacity-70' : 'text-ink-faint'}>· {p.n}</span>
                {p.pending > 0 && (
                  <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${on ? 'bg-white/15' : 'bg-amber-500/12 text-amber-300'}`}>
                    {p.pending} menunggu
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} disabled={counts[f.key] === 0 && f.key !== 'all'}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors disabled:opacity-35 ${
                active === f.key ? 'bg-blue-600 text-white' : 'bg-fill/6 text-ink-muted hover:bg-fill/10'}`}>
              {f.label} {counts[f.key]}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="text-[12px] text-ink-faint text-center py-10">Tidak ada campaign {PLATFORM_LABEL[tab]} di kelompok ini.</p>
      ) : (
        <div className="space-y-2.5">
          {grouped.map(g => g.type === 'card'
            ? <CampaignCard key={g.row.c.id} row={g.row} portalToken={token} />
            : <FolderGroup key={`f:${g.key}`} folder={g} open={isOpen(g)} onToggle={() => toggleFolder(g)} portalToken={token} />
          )}
        </div>
      )}

      <p className="text-[11px] text-ink-faint text-center mt-5">
        Masuk sebagai {email}. Daftar ini mengikuti campaign yang dibagikan tim.
      </p>
    </div>
  )
}

// Folder campaign induk: judul + ringkasan, sub-campaign di dalamnya.
function FolderGroup({ folder, open, onToggle, portalToken }) {
  const Chevron = open ? ChevronDown : ChevronRight
  const needs = folder.pending > 0
  return (
    <div>
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-surface border shadow-sm text-left transition-colors ${
          open ? 'border-line/20' : 'border-line/10 hover:border-line/25'} ${needs && !open ? 'border-blue-500/35' : ''}`}>
        <Chevron className="w-4 h-4 text-ink-faint flex-shrink-0" />
        <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-strong truncate">{folder.key}</p>
          <p className="text-[11px] text-ink-faint truncate">{folder.items.length} sub-campaign · {folder.range}</p>
        </div>
        {needs && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/12 text-amber-300 flex-shrink-0">
            {folder.pending} SKU menunggu
          </span>
        )}
        {folder.running > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-500/12 text-green-300 flex-shrink-0 inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />{folder.running} berjalan
          </span>
        )}
      </button>
      {open && (
        <div className="ml-5 mt-2 space-y-2 border-l border-line/10 pl-3">
          {folder.items.map(r => <CampaignCard key={r.c.id} row={r} portalToken={portalToken} />)}
        </div>
      )}
    </div>
  )
}

// Badge status persetujuan — ringkasan per SKU, sejalan dengan halaman /approve.
function approvalBadge(sum, ended) {
  if (!sum.total) return { label: 'Belum ada SKU', cls: 'bg-fill/8 text-ink-muted' }
  if (sum.pending > 0 && ended) return { label: `${sum.pending} SKU tak diputuskan`, cls: 'bg-gray-600/20 text-gray-400' }
  if (sum.pending > 0) return { label: `${sum.pending} SKU menunggu`, cls: 'bg-amber-500/12 text-amber-300' }
  if (sum.rejected === sum.total) return { label: 'Semua ditolak', cls: 'bg-red-500/12 text-red-300' }
  if (sum.rejected > 0) return { label: `${sum.approved} disetujui · ${sum.rejected} ditolak`, cls: 'bg-red-500/12 text-red-300' }
  return { label: 'Semua disetujui', cls: 'bg-green-500/12 text-green-300' }
}

function CampaignCard({ row, portalToken }) {
  const { c, sum, status, need: needs, urg } = row
  const badge = approvalBadge(sum, status.key === 'ended')
  // Status pendaftaran ke marketplace yang diisi tim (kolom registration).
  const reg = registrationBadge(c)
  const regNote = registrationDetail(c)
  const regLink = hrefOf(c.registration?.link)
  const href = c.shareToken
    ? `/approve?t=${encodeURIComponent(c.shareToken)}&p=${encodeURIComponent(portalToken)}`
    : null
  const pctOf = n => (sum.total ? (n / sum.total) * 100 : 0)

  return (
    <div className={`bg-surface rounded-2xl border shadow-sm p-4 ${needs ? 'border-blue-500/35' : 'border-line/10'} ${status.key === 'ended' ? 'opacity-90' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {urg && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 ${urg.cls}`}>
            <Clock className="w-3 h-3" />{urg.label}
          </span>
        )}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${status.cls}`}>{status.label}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${badge.cls}`}>{badge.label}</span>
        {reg && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${reg.cls}`}>{reg.label}</span>}
        <span className="ml-auto text-[11px] text-ink-faint">{PLATFORM_LABEL[c.platform] || c.platform}</span>
      </div>

      <p className="text-[14px] font-semibold text-ink-strong mt-2 truncate">{c.name}</p>
      <p className="text-[11px] text-ink-faint mt-0.5 truncate">
        {periodsSummary(c)} · {sum.total} SKU
      </p>
      {reg && (
        <p className="text-[11px] text-ink-faint mt-1">
          <span className={registrationStatus(c) === 'done' ? 'text-blue-300' : 'text-amber-300'}>{reg.label}</span>
          {regNote ? ` · ${regNote}` : ''}
          {regLink && <> · <a href={regLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">lihat di marketplace</a></>}
        </p>
      )}

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
