// Creator — performa tiap akun TikTok yang videonya diiklankan, diukur terhadap
// TARGET ROI brand. Ukuran utamanya SURPLUS rupiah, bukan omzet mentah:
//   surplus = omzet − (biaya × target ROI)
// yaitu selisih antara omzet yang kreator hasilkan dan omzet yang dituntut
// target ROI dari biaya iklannya. Ini efisiensi iklan, BUKAN laba (modal produk
// belum ikut dihitung). Target ROI = ambang roasGood (bisa diubah di Pengaturan).
import { useState, useMemo } from 'react'
import { Search, Users, Clapperboard, Wallet, TrendingUp, Target, ShoppingCart } from 'lucide-react'
import { useGmvMax } from '../../contexts/GmvMaxContext'
import { RoasBadge, EmptyState, StatCard, DeltaBadge, fmtRp, fmtRpC, fmtRoasX } from '../../components/gmvmax/ui'
import { TableScroll, usePaged, Pager } from '../../components/ui/DataTable'
import CreatorVideosModal from '../../components/gmvmax/CreatorVideosModal'
import { NoteModal } from '../../components/gmvmax/modals'

const n = (v) => v.toLocaleString('id-ID')
const creatorBase = (arr) => arr.filter(c => c.cost > 0 || c.revenue > 0)

function sumCreators(arr) {
  const s = { kreator: arr.length, video: 0, cost: 0, revenue: 0, orders: 0, roas: null }
  for (const c of arr) {
    s.video += c.videoCount || 0
    s.cost += c.cost || 0
    s.revenue += c.revenue || 0
    s.orders += c.orders || 0
  }
  s.roas = s.cost > 0 ? s.revenue / s.cost : null
  return s
}

// Rupiah bertanda: +surplus hijau / −defisit merah.
function Surplus({ v }) {
  if (v == null) return <span className="text-ink-faint">—</span>
  const pos = v >= 0
  return (
    <span className={`font-mono tabular-nums font-semibold ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '+' : '−'}{fmtRp(Math.abs(Math.round(v))).replace('Rp ', 'Rp ')}
    </span>
  )
}

// Kartu ringkas 5 kreator teratas/terbawah menurut surplus.
function TopCard({ title, sub, rows, tone }) {
  return (
    <div className={`bg-surface rounded-2xl border p-4 shadow-sm ${tone === 'good' ? 'border-emerald-500/25' : 'border-red-500/25'}`}>
      <p className="text-sm font-semibold text-ink-strong">{title}</p>
      <p className="text-[11px] text-ink-faint mb-2.5">{sub}</p>
      <div className="space-y-1.5">
        {rows.map(c => (
          <div key={c.account || '__store__'} className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0">
              <span className="text-ink font-medium truncate">{c.isStore ? 'Akun toko' : c.account}</span>
              <span className="text-ink-faint"> · {c.videoCount} video · biaya {fmtRpC(c.cost)} · ROI {c.roas != null ? c.roas.toFixed(2) : '—'}</span>
            </span>
            <Surplus v={c.surplus} />
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-ink-faint py-2">Belum ada data.</p>}
      </div>
    </div>
  )
}

export default function CreatorPage({ onOpenUpload }) {
  const { creators, videos, notes, productNames, thresholds, hasData, prev, periodName } = useGmvMax()
  const [q, setQ] = useState('')
  const [order, setOrder] = useState('surplus')   // 'surplus' | 'defisit'
  const [detailCreator, setDetailCreator] = useState(null)
  const [noteVideo, setNoteVideo] = useState(null)

  const targetRoi = Number(thresholds?.roasGood) || 6

  // Surplus per kreator terhadap target ROI.
  const base = useMemo(
    () => creatorBase(creators).map(c => ({ ...c, surplus: (c.revenue || 0) - (c.cost || 0) * targetRoi })),
    [creators, targetRoi])

  // Kartu menang/rugi: HANYA kreator yang benar-benar memakai biaya iklan —
  // kreator biaya-nol punya surplus semu (omzet organik tanpa biaya).
  const paid = useMemo(() => base.filter(c => (c.cost || 0) > 0), [base])
  const winners = useMemo(() => [...paid].sort((a, b) => b.surplus - a.surplus).slice(0, 5), [paid])
  const losers = useMemo(() => [...paid].sort((a, b) => a.surplus - b.surplus).slice(0, 5), [paid])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const f = s ? base.filter(c => (c.account || 'akun toko').toLowerCase().includes(s)) : base
    return [...f].sort((a, b) => (order === 'surplus' ? b.surplus - a.surplus : a.surplus - b.surplus))
  }, [base, q, order])

  // Hook harus dipanggil sebelum early-return <EmptyState> di bawah.
  const pg = usePaged(list)
  const sum = useMemo(() => sumCreators(base), [base])
  const prevSum = useMemo(() => (prev ? sumCreators(creatorBase(prev.creators)) : null), [prev])

  if (!hasData) return <EmptyState title="Belum ada data" desc="Upload dulu di Input Data."
    action={<button onClick={onOpenUpload} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">Upload Data</button>} />

  return (
    <div className="p-6 space-y-4">
      {periodName && prev && (
        <p className="text-sm text-ink-muted -mb-1">{periodName} <span className="text-ink-faint">· vs {prev.name}</span></p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={Users} tone="violet" label="Total Kreator" value={n(sum.kreator)}
          delta={prevSum && <DeltaBadge cur={sum.kreator} prev={prevSum.kreator} />} />
        <StatCard icon={Clapperboard} tone="blue" label="Total Video" value={n(sum.video)}
          delta={prevSum && <DeltaBadge cur={sum.video} prev={prevSum.video} />} />
        <StatCard icon={Wallet} tone="amber" label="Total Cost" value={fmtRpC(sum.cost)}
          delta={prevSum && <DeltaBadge cur={sum.cost} prev={prevSum.cost} fmt={fmtRpC} goodDown />} />
        <StatCard icon={TrendingUp} tone="green" label="Revenue (GMV)" value={fmtRpC(sum.revenue)}
          delta={prevSum && <DeltaBadge cur={sum.revenue} prev={prevSum.revenue} fmt={fmtRpC} />} />
        <StatCard icon={Target} tone="blue" label="ROAS" value={fmtRoasX(sum.roas)}
          delta={prevSum && sum.roas != null && prevSum.roas != null && <DeltaBadge cur={sum.roas} prev={prevSum.roas} fmt={(v) => v.toFixed(2)} />} />
        <StatCard icon={ShoppingCart} tone="blue" label="Total Orders" value={n(sum.orders)}
          delta={prevSum && <DeltaBadge cur={sum.orders} prev={prevSum.orders} />} />
      </div>

      {/* ── Creator vs Target ROI ─────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-ink-strong">Creator vs Target ROI</h3>
        <p className="text-[11px] text-ink-faint mb-3 max-w-3xl">
          Selisih rupiah antara omzet yang kreator hasilkan dan omzet yang target ROI{' '}
          <span className="text-ink-muted font-mono">{targetRoi.toFixed(2)}</span> tuntut dari biaya iklannya.
          Ini efisiensi iklan, bukan laba — modal produk belum ikut dihitung. Ambang bisa diubah di Pengaturan.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <TopCard tone="good" title="Kreator menang" sub="Paling banyak melampaui target, dalam rupiah." rows={winners} />
          <TopCard tone="bad" title="Kreator paling rugi" sub="Paling jauh di bawah target, dalam rupiah." rows={losers} />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => { setQ(e.target.value); pg.setPage(0) }} placeholder="Cari kreator…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface border border-line/10 text-sm text-ink" />
        </div>
        {[['surplus', 'Surplus terbesar'], ['defisit', 'Defisit terbesar']].map(([id, label]) => (
          <button key={id} onClick={() => { setOrder(id); pg.setPage(0) }}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${order === id
              ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
              : 'border-line/15 text-ink-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-2xl border border-line/10 shadow-sm p-3">
        <TableScroll stickyFirst>
        <table className="w-full text-[12.5px] min-w-[820px]">
          <thead><tr className="border-b border-line/10">
            {['Akun', 'Video', 'Biaya', 'Omzet', 'Pesanan', 'ROI', `Surplus vs target ${targetRoi.toFixed(2)}`].map((h, i) => (
              <th key={h} className={`py-2.5 px-3 text-[10px] uppercase tracking-widest text-ink-faint font-semibold whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {pg.paged.map(c => (
              <tr key={c.account || '__store__'} onClick={() => setDetailCreator(c)} title="Lihat video kreator"
                className="border-b border-line/5 cursor-pointer hover:bg-fill/5 transition-colors">
                <td className="py-2.5 px-3">
                  <span className="text-ink font-medium">{c.isStore ? 'Akun toko / tanpa kreator' : c.account}</span>
                  {(c.cost || 0) > 0 && (
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-[9.5px] font-semibold ${c.surplus >= 0 ? 'bg-emerald-500/12 text-emerald-400' : 'bg-red-500/12 text-red-400'}`}>
                      {c.surplus >= 0 ? 'di atas target' : 'di bawah target'}
                    </span>
                  )}
                  {(c.cost || 0) === 0 && <span className="ml-2 px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-fill/10 text-ink-faint">tanpa biaya iklan</span>}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">{n(c.videoCount || 0)}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-muted">{fmtRp(Math.round(c.cost || 0))}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">{fmtRp(Math.round(c.revenue || 0))}</td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums">{n(c.orders || 0)}</td>
                <td className="py-2.5 px-3 text-right"><RoasBadge roas={c.roas} thresholds={thresholds} showLabel={false} /></td>
                <td className="py-2.5 px-3 text-right">{(c.cost || 0) > 0 ? <Surplus v={c.surplus} /> : <span className="text-ink-faint">—</span>}</td>
              </tr>
            ))}
            {pg.paged.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-sm text-ink-faint">Tidak ada kreator{q ? ' yang cocok' : ''}.</td></tr>
            )}
          </tbody>
        </table>
        </TableScroll>
        <Pager {...pg} unit="kreator" />
      </div>

      {detailCreator && (
        <CreatorVideosModal creator={detailCreator} videos={videos} thresholds={thresholds}
          notes={notes} productNames={productNames} periodName={periodName}
          onNote={setNoteVideo} onClose={() => setDetailCreator(null)} />
      )}
      {noteVideo && <NoteModal video={noteVideo} onClose={() => setNoteVideo(null)} />}
    </div>
  )
}
