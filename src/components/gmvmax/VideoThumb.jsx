// Thumbnail video TikTok untuk baris tabel & daftar aksi.
//
// MALAS MENURUT PRINSIP, bukan demi hemat: Performa Video memuat ratusan baris
// sekaligus, dan menembakkan ratusan permintaan oEmbed akan membuat TikTok
// menjawab 429 — semua gambar gagal, termasuk 10 baris yang sedang dilihat.
// IntersectionObserver membuat yang diminta hanya yang benar-benar terlihat.
//
// UKURAN DIKUNCI di semua keadaan (memuat / ada gambar / gagal). Kotak yang
// tumbuh saat gambar datang membuat baris melompat persis ketika jari hendak
// menekan tombol Exclude.
import { useState, useEffect, useRef } from 'react'
import { Play, VideoOff } from 'lucide-react'
import { muatThumb, thumbTersimpan } from '../../utils/gmvmaxThumb'
import { tiktokVideoUrl } from './ui'

const UKURAN = {
  row: 'w-12 h-[4.5rem]',   // daftar aksi (48×72) — cukup besar untuk mengenali wajah & produk
  table: 'w-9 h-[3.25rem]', // tabel Performa Video (36×52) — baris lebih padat
}

export default function VideoThumb({ videoId, account, title, size = 'row', className = '' }) {
  const box = `${UKURAN[size] || UKURAN.row} rounded-lg border border-line/10 bg-surface2 overflow-hidden flex-none ${className}`
  const ref = useRef(null)
  const [data, setData] = useState(() => thumbTersimpan(videoId))

  // Baris tabel di-key per videoId sehingga biasanya komponen ini ter-mount ulang,
  // tapi paginasi bisa memakai ulang instansnya. Penyesuaian SAAT RENDER (pola
  // resmi React untuk "state turunan prop") — bukan efek, supaya tak ada render
  // beruntun yang membuat gambar lama sempat menempel di baris baru.
  const [idLama, setIdLama] = useState(videoId)
  if (idLama !== videoId) {
    setIdLama(videoId)
    setData(thumbTersimpan(videoId))
  }

  useEffect(() => {
    if (!videoId || data?.url) return undefined
    const el = ref.current
    let batal = false
    const minta = () => { muatThumb(videoId).then(r => { if (!batal) setData(r) }) }
    if (!el) { minta(); return () => { batal = true } }

    // DUA pemicu, bukan satu. IntersectionObserver menangani baris yang baru
    // digulir masuk — itu inti hemat permintaannya. Tapi ia tak bisa jadi
    // SATU-SATUNYA jalan: di pane pratinjau (dan lingkungan render tanpa
    // kompositor) callback-nya tak pernah dipanggil meski elemennya jelas
    // terlihat, dan seluruh kolom gambar tinggal kotak kosong tanpa error.
    // Maka pemeriksaan posisi sekali saat pasang menangkap yang SUDAH terlihat,
    // dan observer mengurus sisanya.
    const M = 250
    const sudahTerlihat = () => {
      const r = el.getBoundingClientRect()
      if (!r.width && !r.height) return false
      return r.bottom > -M && r.top < (window.innerHeight || 0) + M
        && r.right > -M && r.left < (window.innerWidth || 0) + M
    }
    if (sudahTerlihat()) { minta(); return () => { batal = true } }

    if (typeof IntersectionObserver === 'undefined') { minta(); return () => { batal = true } }
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); minta() }
    }, { rootMargin: `${M}px` })
    io.observe(el)
    return () => { batal = true; io.disconnect() }
  }, [videoId, data?.url])

  if (!videoId) return <span ref={ref} className={box} aria-hidden="true" />

  const isi = data?.url
    ? (
      <>
        <img src={data.url} alt="" loading="lazy" decoding="async"
          className="w-full h-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover/th:bg-black/35 transition-colors">
          <Play className="w-3.5 h-3.5 text-white opacity-0 group-hover/th:opacity-100 transition-opacity" />
        </span>
      </>
    )
    : data?.status === 'notfound' || data?.status === 'error'
      // Video privat/dihapus, atau oEmbed menolak. Bukan kesalahan pengguna —
      // cukup ikon diam, tanpa teks yang mencuri perhatian dari angka.
      ? <span className="w-full h-full flex items-center justify-center"><VideoOff className="w-3.5 h-3.5 text-ink-faint/60" /></span>
      : <span className="w-full h-full block animate-pulse bg-fill/5" />

  return (
    <a ref={ref} href={tiktokVideoUrl(videoId, account) || '#'} target="_blank" rel="noreferrer"
      title={title ? `Buka di TikTok — ${title}` : 'Buka di TikTok'}
      onClick={e => e.stopPropagation()}
      className={`group/th relative block ${box}`}>
      {isi}
    </a>
  )
}
