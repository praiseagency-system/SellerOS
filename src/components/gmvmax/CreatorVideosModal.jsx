// Modal "video milik creator" — klik baris di leaderboard Creator → daftar
// video akun itu (dari rollup window aktif) pakai VideoTable yang bisa di-sort.
// Menampilkan kolom Produk agar tahu tiap video untuk produk mana.
import { useMemo, useEffect } from 'react'
import { X } from 'lucide-react'
import VideoTable from './VideoTable'
import { fmtRpC, fmtRoasX } from './ui'

function Cell({ label, value, tone = 'text-ink-strong' }) {
  return (
    <div className="flex-1 min-w-0 px-3 py-2">
      <p className="text-[9px] font-medium uppercase tracking-widest text-ink-faint mb-0.5">{label}</p>
      <p className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${tone}`}>{value}</p>
    </div>
  )
}

export default function CreatorVideosModal({ creator, videos, thresholds, notes, productNames, onNote, periodName, onClose }) {
  const mine = useMemo(
    () => videos.filter(v => creator.isStore ? !v.account : v.account === creator.account)
      .sort((a, b) => b.lifetime.revenue - a.lifetime.revenue),
    [videos, creator])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const name = creator.isStore ? 'Akun toko / tanpa kreator' : creator.account

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="glass-modal rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-strong truncate">{name}</p>
            <p className="text-[11px] text-ink-faint truncate">
              {creator.videoCount} video{periodName ? ` · ${periodName}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="text-ink-muted hover:text-ink p-1 -m-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-4 overflow-y-auto">
          {/* Ringkasan creator */}
          <div className="flex items-stretch divide-x divide-line/10 bg-fill/5 border border-line/10 rounded-xl mb-3 overflow-x-auto">
            <Cell label="Video" value={creator.videoCount.toLocaleString('id-ID')} />
            <Cell label="Cost" value={fmtRpC(creator.cost)} />
            <Cell label="Revenue" value={<span className="text-emerald-500">{fmtRpC(creator.revenue)}</span>} />
            <Cell label="ROAS" value={fmtRoasX(creator.roas)} />
            <Cell label="Orders" value={(creator.orders || 0).toLocaleString('id-ID')} />
          </div>

          <VideoTable videos={mine} thresholds={thresholds} notes={notes} productNames={productNames}
            onNote={onNote} showDelivery showStatus showProduct />

          <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
            Video milik creator ini pada periode terpilih. Klik header kolom untuk urut naik/turun,
            judul/ID untuk buka di TikTok.
          </p>
        </div>
      </div>
    </div>
  )
}
