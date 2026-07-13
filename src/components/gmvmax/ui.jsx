/* eslint-disable react-refresh/only-export-components */
// Komponen UI bersama modul GMV Max — memakai token tema (bg-surface, text-ink,
// accent) agar selaras palet Praise. Gaya kartu/badge meniru dashboard Praise.
import { useState, useMemo } from 'react'
import { ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { fmtNum, fmtCompact } from '../../utils/quadrantUtils'
import { roasBadge, STATUS_META } from '../../utils/gmvmaxClassify'

// ─── Sortir tabel: setiap kolom metrik bisa diurut turun ↔ naik ↔ default ───
// accessors = { key: (row) => number }. 3-state: klik → turun → naik → kembali
// ke urutan asal (parent). null diperlakukan paling kecil.
export function useSortableRows(rows, accessors) {
  const [sort, setSort] = useState(null) // { key, dir: 'desc'|'asc' } | null
  const sorted = useMemo(() => {
    const get = sort && accessors[sort.key]
    if (!get) return rows
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b)
      const na = va == null ? -Infinity : va, nb = vb == null ? -Infinity : vb
      return na === nb ? 0 : (na < nb ? -mul : mul)
    })
  }, [rows, sort, accessors])
  const toggle = (key) => setSort(s =>
    s?.key !== key ? { key, dir: 'desc' } : s.dir === 'desc' ? { key, dir: 'asc' } : null)
  return { sorted, sort, toggle }
}

// Header kolom yang bisa diklik untuk sortir. `align` = 'right' (metrik) / 'left'.
export function SortTh({ label, sortKey, sort, onSort, align = 'right', className = '' }) {
  const active = sort?.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort.dir === 'desc' ? ChevronDown : ChevronUp
  return (
    <th className={`py-2.5 px-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-ink' : ''}`}>
        {label}
        <Icon className={`w-3 h-3 ${active ? 'text-accent' : 'text-ink-faint/60'}`} />
      </button>
    </th>
  )
}

// URL video TikTok dari video ID. TikTok me-resolve video dari ID-nya, jadi
// handle di path boleh placeholder bila akun tak URL-safe (mis. ada emoji).
export function tiktokVideoUrl(videoId, account) {
  if (!videoId) return null
  const safe = account && /^[a-zA-Z0-9_.]{2,24}$/.test(account) ? account : 'tiktok'
  return `https://www.tiktok.com/@${safe}/video/${videoId}`
}

export const fmtRp = (n) => (n == null ? '—' : 'Rp ' + fmtNum(Math.round(n)))
export const fmtRpC = (n) => (n == null ? '—' : 'Rp ' + fmtCompact(n))
export const fmtRoasX = (r) => (r == null ? '—' : (r >= 100 ? Math.round(r) : r.toFixed(1)) + 'x')

const TONE = {
  green: 'bg-emerald-500/15 text-emerald-500',
  amber: 'bg-amber-500/15 text-amber-500',
  red: 'bg-red-500/15 text-red-500',
  blue: 'bg-blue-500/15 text-blue-500',
  muted: 'bg-fill/10 text-ink-faint',
  violet: 'bg-violet-500/15 text-violet-500',
}

// Badge ROAS dengan label tier (Bagus/Sedang/Buruk).
export function RoasBadge({ roas, thresholds, showLabel = true }) {
  const b = roasBadge(roas, thresholds)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${TONE[b.tone]}`}>
      {fmtRoasX(roas)}{showLabel && b.text !== '—' && <span className="opacity-70 font-medium">· {b.text}</span>}
    </span>
  )
}

// Badge status PENGIRIMAN TikTok mentah (Delivering/Excluded/Learning/…).
// Beda dari StatusBadge (yang = tier penilaian Scale/Watch/Kill).
export function DeliveryBadge({ delivery }) {
  if (!delivery) return <span className="text-ink-faint text-xs">—</span>
  const t = delivery.toLowerCase()
  const del = (t.includes('deliver') || t.includes('ditayangkan')) && !t.includes('not') && !t.includes('tidak')
  const tone = del ? 'green'
    : (t.includes('learning') || t.includes('mempelajari') || t.includes('belajar')) ? 'blue'
    : (t.includes('queue') || t.includes('antrean')) ? 'amber'
    : (t.includes('exclud') || t.includes('dikecualikan')) ? 'red'
    : 'muted'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${TONE[tone]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />{delivery}
    </span>
  )
}

// Badge status lifecycle (Scale/Active/Watch/Kill/Nonaktif).
export function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.inactive
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${TONE[m.tone]}`}>
      <span aria-hidden>{m.icon}</span>{m.label}
    </span>
  )
}

// Rincian status pengiriman per produk: 3 pill (Delivering/In queue/Learning),
// sembunyikan yang nol. `counts` = { delivering, in_queue, learning }.
const DELIVERY_META = {
  delivering: { label: 'Delivering', tone: 'green' },
  in_queue:   { label: 'In queue',   tone: 'amber' },
  learning:   { label: 'Learning',   tone: 'blue' },
}
export function DeliveryPills({ counts }) {
  const keys = counts ? ['delivering', 'in_queue', 'learning'].filter(k => (counts[k] || 0) > 0) : []
  if (!keys.length) return <span className="text-ink-faint text-xs">—</span>
  return (
    <div className="flex flex-col items-end gap-0.5">
      {keys.map(k => {
        const m = DELIVERY_META[k]
        return (
          <span key={k} title={m.label}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold ${TONE[m.tone]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {counts[k]} <span className="font-medium opacity-70">{m.label}</span>
          </span>
        )
      })}
    </div>
  )
}

// Kartu statistik COMPACT glass (opsi 1, dipilih user 2026-07-12): micro-label
// uppercase + ikon garis kecil, angka & delta sejajar satu baris. Dipakai
// halaman full-glass (Overview, GMV Max Dashboard).
export function StatCompact({ icon: Icon, label, value, delta, sub }) {
  return (
    <div className="glass-card rounded-xl px-3.5 py-2.5 min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-widest text-ink-faint flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="w-3 h-3 text-blue-400/80 flex-shrink-0" />}
        <span className="truncate">{label}</span>
      </p>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[15px] font-semibold text-ink-strong tabular-nums whitespace-nowrap">{value}</span>
        {delta}
      </div>
      {sub && <p className="text-[10px] text-ink-faint mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

// Kartu statistik — sejak 2026-07-12 dibuat COMPACT (resep sama dgn StatCompact
// di Overview/Dashboard, permintaan user "seluruh menu"). API lama dipertahankan
// (icon/label/value/sub/delta/tone) agar semua pemakai ikut tanpa diubah;
// `tone` kini mewarnai ikon kecil, bukan tile besar.
const ICON_TONE = {
  green: 'text-emerald-500', amber: 'text-amber-400', red: 'text-red-400',
  blue: 'text-blue-400', muted: 'text-ink-faint', violet: 'text-violet-400',
}
export function StatCard({ icon: Icon, label, value, sub, delta, tone = 'blue' }) {
  return (
    <div className="glass-card rounded-xl px-3.5 py-2.5 min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-widest text-ink-faint flex items-center gap-1.5 mb-1">
        {Icon && <Icon className={`w-3 h-3 flex-shrink-0 ${ICON_TONE[tone] || ICON_TONE.blue}`} />}
        <span className="truncate">{label}</span>
      </p>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[15px] font-semibold text-ink-strong tabular-nums whitespace-nowrap">{value}</span>
        {delta}
      </div>
      {sub && <p className="text-[10px] text-ink-faint mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

// Delta vs periode sebelumnya (bulan lalu), gaya Monitoring Praise:
// ▲ hijau (naik = baik) · ▼ merah (turun) · → Sama. `goodDown` membalik warna
// untuk metrik yang "naik = buruk" (mis. Cost). prev null → tak dirender.
export function DeltaBadge({ cur, prev, fmt = (v) => v.toLocaleString('id-ID'), goodDown = false, percent = true }) {
  if (prev == null || cur == null) return null
  const diff = cur - prev
  if (Math.abs(diff) < 1e-9) return <span className="text-xs font-medium text-ink-faint">→ Sama</span>
  const up = diff > 0
  const good = goodDown ? !up : up
  const pct = prev !== 0 ? Math.abs(diff / prev) * 100 : null
  return (
    <span className={`text-xs font-medium ${good ? 'text-emerald-500' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {fmt(Math.abs(diff))}{percent && pct != null ? ` (${pct.toFixed(1)}%)` : ''}
    </span>
  )
}

// Chip filter/segmen.
export function Pill({ active, onClick, children, tone = 'blue', count }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
        ${active ? TONE[tone] + ' ring-1 ring-current/20' : 'text-ink-muted hover:bg-fill/5'}`}
    >
      {children}
      {count != null && <span className="text-xs opacity-70">{count}</span>}
    </button>
  )
}

export function SectionTitle({ children, tone = 'ink', right }) {
  const c = tone === 'green' ? 'text-emerald-500' : tone === 'amber' ? 'text-amber-500'
    : tone === 'red' ? 'text-red-500' : 'text-ink-muted'
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className={`text-xs font-bold uppercase tracking-wider ${c}`}>{children}</h3>
      {right}
    </div>
  )
}

// Grafik batang tren harian (incremental): revenue (hijau) vs cost (merah) per
// snapshot. Batang terakhir disorot. Scroll horizontal bila hari banyak.
export function TrendBars({ series, height = 128 }) {
  if (!series || series.length === 0) return null
  const max = Math.max(1, ...series.map(d => Math.max(d.revenue || 0, d.cost || 0)))
  const n = series.length
  const step = 26, gap = 6, bw = (step - gap) / 2
  const w = n * step
  const pad = 16                         // ruang label tanggal di bawah
  const yOf = v => (height - pad) - (Math.max(0, v) / max) * (height - pad - 6)
  const day = iso => (iso ? String(+iso.slice(8, 10)) : '')
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${height}`} width={w} height={height}
        className="block" style={{ minWidth: Math.min(w, 280) }} preserveAspectRatio="xMinYMin meet">
        {series.map((d, i) => {
          const x = i * step
          const last = i === n - 1
          return (
            <g key={d.date || i}>
              <title>{`${d.label}\nRevenue ${fmtRpC(d.revenue)} · Cost ${fmtRpC(d.cost)} · ROAS ${fmtRoasX(d.roas)}`}</title>
              <rect x={x + gap / 2} width={bw} y={yOf(d.revenue)} height={(height - pad) - yOf(d.revenue)}
                rx="1.5" fill="currentColor" className="text-emerald-500" opacity={last ? 1 : 0.8} />
              <rect x={x + gap / 2 + bw} width={bw} y={yOf(d.cost)} height={(height - pad) - yOf(d.cost)}
                rx="1.5" fill="currentColor" className="text-red-500" opacity={last ? 0.95 : 0.65} />
              <text x={x + step / 2} y={height - 4} textAnchor="middle" fontSize="8"
                fill="currentColor" className={last ? 'text-ink font-semibold' : 'text-ink-faint'}>{day(d.date)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function EmptyState({ title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-ink-strong font-semibold mb-1">{title}</p>
      {desc && <p className="text-sm text-ink-faint max-w-sm mb-4">{desc}</p>}
      {action}
    </div>
  )
}

// Judul + akun video. Opsi linkVideo → judul jadi tautan buka video di TikTok
// (dipakai di list/kartu yang tak punya kolom ID terpisah).
export function VideoLabel({ title, account, videoId, compact, linkVideo }) {
  const label = title || '…' + String(videoId || '').slice(-6)
  const cls = `font-medium text-ink truncate ${compact ? 'text-sm' : ''}`
  const url = tiktokVideoUrl(videoId, account)
  return (
    <div className="min-w-0">
      {linkVideo && url
        ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            title="Buka video di TikTok" className={`${cls} block hover:text-accent hover:underline`}>{label}</a>
        : <p className={cls}>{label}</p>}
      <p className="text-xs text-ink-faint truncate">{account || 'Akun toko'}</p>
    </div>
  )
}

// Tautan video ID yang bisa diklik — untuk kolom "VIDEO ID" tersendiri.
export function VideoIdLink({ videoId, account, full }) {
  if (!videoId) return <span className="text-ink-faint">—</span>
  return (
    <a href={tiktokVideoUrl(videoId, account)} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()} title={`Buka video ${videoId} di TikTok`}
      className="inline-flex items-center gap-1 text-accent hover:underline font-mono text-xs">
      <span className={full ? '' : 'truncate max-w-[7rem]'}>{videoId}</span>
      <ExternalLink className="w-3 h-3 shrink-0" />
    </a>
  )
}
