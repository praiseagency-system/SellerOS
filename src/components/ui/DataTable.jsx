/* eslint-disable react-refresh/only-export-components */
// File ini sengaja mengekspor hook + konstanta bersama komponen, sama seperti
// contexts/*.jsx di repo ini. Aturan fast-refresh dimatikan mengikuti konvensi itu.
// Primitif tabel bersama untuk SELURUH app (bukan hanya GMV Max).
//
// Dua masalah yang diselesaikan di sini:
//  1. Tabel metrik meluber ke samping dan scrollbar bawaannya terlalu tipis
//     untuk ditemukan. <TableScroll> memberi REL geser yang selalu terlihat +
//     tombol panah, dan menyembunyikan scrollbar native supaya tak dobel.
//  2. Daftar panjang (Performa Video pernah merender 2.424 baris DOM sekaligus)
//     bikin render berat. usePaged() + <Pager> memotongnya jadi 10/20/50.
//
// Sengaja TIDAK memakai <table> sendiri: tiap tabel di app punya kolom & sel
// yang berbeda-beda. Komponen ini hanya membungkus, jadi bisa dipasang tanpa
// menulis ulang markup tabel mana pun.
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const PER_PAGE_OPTIONS = [10, 20, 50]
const DEFAULT_PER_PAGE = 20
// Satu kunci global: pilihan 10/20/50 berlaku untuk semua tabel sekaligus,
// jadi pengguna tidak perlu mengaturnya ulang di tiap halaman.
const STORAGE_KEY = 'sq_table_per_page'

function readPerPage() {
  try {
    const v = parseInt(localStorage.getItem(STORAGE_KEY), 10)
    return PER_PAGE_OPTIONS.includes(v) ? v : DEFAULT_PER_PAGE
  } catch { return DEFAULT_PER_PAGE }
}

/**
 * Memotong `rows` jadi satu halaman. Pengurutan/penyaringan tetap dikerjakan
 * pemanggil atas SELURUH data — paginasi hanya lapisan tampilan paling akhir,
 * jadi "ROAS tertinggi" tetap tertinggi dari seluruh baris, bukan dari 20 yang
 * kebetulan tampil.
 */
export function usePaged(rows) {
  const [perPage, setPerPageRaw] = useState(readPerPage)
  const [page, setPage] = useState(0)

  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  // Dijepit saat render, bukan lewat useEffect: begitu filter menyusutkan data
  // dan halaman aktif jadi di luar jangkauan, kita tidak ingin sekali render
  // kosong dulu baru diperbaiki.
  const page_ = Math.min(page, pageCount - 1)

  const paged = useMemo(
    () => rows.slice(page_ * perPage, page_ * perPage + perPage),
    [rows, page_, perPage]
  )

  const setPerPage = useCallback((n) => {
    setPerPageRaw(n)
    setPage(0)
    try { localStorage.setItem(STORAGE_KEY, String(n)) } catch { /* ignore */ }
  }, [])

  return {
    paged, perPage, setPerPage, total, pageCount,
    page: page_, setPage,
    from: total ? page_ * perPage + 1 : 0,
    to: Math.min((page_ + 1) * perPage, total),
  }
}

/**
 * Pembungkus geser horizontal. Rel hanya muncul kalau isinya memang meluber,
 * supaya tabel sempit tidak kebagian kontrol yang tak berguna.
 *
 * stickyFirst: kolom pertama dipaku di kiri — dipakai tabel lebar supaya
 * identitas baris (nama video/produk) tidak hilang saat metrik digeser.
 */
export function TableScroll({ children, stickyFirst = false, className = '' }) {
  const scRef = useRef(null)
  const railRef = useRef(null)
  const [geom, setGeom] = useState({ ratio: 1, pos: 0 })
  const dragRef = useRef(false)

  const measure = useCallback(() => {
    const el = scRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setGeom({
      ratio: el.scrollWidth > 0 ? el.clientWidth / el.scrollWidth : 1,
      pos: max > 0 ? el.scrollLeft / max : 0,
    })
  }, [])

  useEffect(() => {
    const el = scRef.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // Kolom bisa berubah lebar saat data/paginasi berganti, bukan hanya saat
    // window di-resize — makanya ResizeObserver, bukan listener resize saja.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => { el.removeEventListener('scroll', measure); ro.disconnect() }
  }, [measure])

  const overflowing = geom.ratio < 0.999
  const thumbPct = Math.max(10, geom.ratio * 100)

  const seek = useCallback((clientX) => {
    const rail = railRef.current
    const el = scRef.current
    if (!rail || !el) return
    const r = rail.getBoundingClientRect()
    const thumbW = (thumbPct / 100) * r.width
    const span = r.width - thumbW
    const p = span > 0 ? (clientX - r.left - thumbW / 2) / span : 0
    el.scrollLeft = Math.min(1, Math.max(0, p)) * (el.scrollWidth - el.clientWidth)
  }, [thumbPct])

  const nudge = (dir) => scRef.current?.scrollBy({ left: dir * 260, behavior: 'smooth' })

  return (
    <div className={className}>
      <div
        ref={scRef}
        // data-no-wheel-x: minta handler roda di App.jsx TIDAK membajak scroll
        // vertikal jadi horizontal di sini. Sudah ada rel + panah, dan
        // pembajakan itu bikin gulir halaman terasa nyangkut di atas tabel.
        data-no-wheel-x=""
        className={`tbl-scroll overflow-x-auto${stickyFirst ? ' tbl-sticky-first' : ''}`}
      >
        {children}
      </div>

      {overflowing && (
        <div className="flex items-center gap-2 mt-2">
          <button type="button" onClick={() => nudge(-1)} aria-label="Geser ke kiri"
            className="p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-fill/10 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div
            ref={railRef}
            role="scrollbar"
            aria-label="Geser kolom"
            aria-orientation="horizontal"
            aria-valuenow={Math.round(geom.pos * 100)}
            className="flex-1 h-2.5 rounded-full bg-fill/8 border border-line/8 relative cursor-pointer"
            onPointerDown={(e) => {
              dragRef.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              seek(e.clientX)
            }}
            onPointerMove={(e) => { if (dragRef.current) seek(e.clientX) }}
            onPointerUp={() => { dragRef.current = false }}
            onPointerCancel={() => { dragRef.current = false }}
          >
            <div
              className="absolute top-px bottom-px rounded-full bg-fill/35 hover:bg-fill/50 transition-colors"
              style={{ width: `${thumbPct}%`, left: `${geom.pos * (100 - thumbPct)}%` }}
            />
          </div>
          <button type="button" onClick={() => nudge(1)} aria-label="Geser ke kanan"
            className="p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-fill/10 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Kaki tabel: keterangan jangkauan + pemilih 10/20/50 + navigasi halaman.
 * Tidak dirender kalau datanya masih muat di halaman terkecil — tabel ringkas
 * 3 baris tidak perlu kontrol paginasi.
 */
export function Pager({ page, pageCount, perPage, setPerPage, setPage, total, from, to, unit = 'baris' }) {
  if (total <= PER_PAGE_OPTIONS[0]) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-line/8 text-xs">
      <div className="flex items-center gap-2 text-ink-faint">
        <span>
          {from.toLocaleString('id-ID')}–{to.toLocaleString('id-ID')} dari{' '}
          <span className="text-ink-muted">{total.toLocaleString('id-ID')}</span> {unit}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-ink-faint">
          <span>Tampilkan</span>
          <select
            value={perPage}
            onChange={(e) => setPerPage(Number(e.target.value))}
            className="bg-surface2 border border-line/12 rounded-lg px-2 py-1 text-ink outline-none focus:border-accent/50"
          >
            {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page <= 0}
            aria-label="Halaman sebelumnya"
            className="p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-fill/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-ink-muted tabular-nums px-1">{page + 1}/{pageCount}</span>
          <button type="button" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}
            aria-label="Halaman berikutnya"
            className="p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-fill/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
