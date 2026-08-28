// Pemilih sasaran boost/exclude — BARIS TABEL membentang, bukan dropdown melayang.
//
// Kenapa bukan dropdown: elemen ber-posisi absolut di dalam wadah `overflow-auto`
// PASTI dipotong wadahnya, dan bisa tembus melewati tepi jendela. Itu bug nyata
// yang dilaporkan user. Tak ada lebar yang bisa disetel untuk memperbaikinya —
// selama bentuknya melayang, ia akan selalu salah di dalam tabel bergulir.
//
// Baris membentang tak punya masalah itu, sekaligus memberi ruang menampilkan
// nama campaign, nama produk UTUH, dan bukti tiap pilihan — supaya keputusannya
// beralasan, bukan menebak dari ID telanjang.
import { pickBoostTarget } from '../../utils/gmvmaxBoostTarget'

const rp = (v) => Math.round(Number(v) || 0).toLocaleString('id-ID')

export default function TargetChooserRow({ video, exec, kind, colSpan, onPick, onCancel }) {
  const { options } = pickBoostTarget({
    video, anchorSpu: exec.anchorOf?.(video.videoId) || null, eligible: (p) => !!exec.resolve(p),
  })
  if (!options.length) return null

  return (
    <tr className="border-b border-line/5 bg-fill/[0.03]">
      <td colSpan={colSpan} className="px-3 py-3">
        <p className="text-[10px] uppercase tracking-widest text-ink-faint mb-2">
          {kind === 'BOOST' ? 'Boost di campaign mana?' : 'Keluarkan dari campaign mana?'}
        </p>
        <div className="space-y-1.5">
          {options.map(p => (
            <button key={`${p.campaignId}|${p.productId}`} onClick={() => onPick(p)}
              className="w-full text-left px-3 py-2 rounded-lg bg-surface2 border border-line/10 hover:border-blue-500/40 hover:bg-fill/10">
              <span className="block text-xs text-ink">{p.campaignName || p.campaignId}</span>
              <span className="block text-[11px] text-ink-muted">{exec.productName?.(p.productId) || p.productId}</span>
              <span className="block text-[10px] text-ink-faint mt-0.5">
                {p.revenue > 0 ? `omzet ${rp(p.revenue)} · ${p.orders || 0} order` : 'belum ada omzet'}
                {p.delivery ? ` · ${p.delivery}` : ''}
              </span>
            </button>
          ))}
          <button onClick={onCancel} className="text-[11px] text-ink-faint hover:text-ink px-1">batal</button>
        </div>
      </td>
    </tr>
  )
}
