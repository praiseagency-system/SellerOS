// Susunan tab AI Insight.
//
// Sampai 8 Sep 2026 halaman ini punya ENAM tab, dan TIGA di antaranya menjawab
// pertanyaan yang sama — "video mana yang harus dinaikkan atau dihentikan" —
// dengan tiga kosakata berbeda, sementara hanya satu yang punya tombol:
//   · Insight            → kartu band SCALE/WATCH/KILL, tanpa aksi
//   · Decision Intelligence → vonis harian, sengaja EXECUTION_ALLOWED=false
//   · Rekomendasi Aksi   → kartu kerja + tombol antre ke persetujuan
// Itu bukan tiga fitur, itu satu fitur yang terpotong tiga.
//
// Sisanya kini dua tab:
//   aksi  → vonis harian (banner) + kartu kerja, di satu layar
//   bukti → eksperimen + aksi yang dikerjakan langsung di Seller Centre.
//           Keduanya memang membaca ledger eksperimen yang sama; sebelum ini
//           mereka membacanya lewat dua pintu terpisah (OutOfBandPanel sudah
//           mengimpor listExperiments sejak hari pertamanya).
//
// Tab lama TIDAK dihapus, hanya keluar dari baris tab — pola yang sama sudah
// dipakai Feature Registry (lihat NAV di components/Layout.jsx): rutenya tetap
// hidup, dibuka lewat URL saat mendiagnosis. Pintunya di sini:
//   /?page=gmv_insight&tab=di
export const MAIN_TABS = [
  { id: 'aksi', label: 'Aksi Hari Ini' },
  { id: 'bukti', label: 'Bukti & Riwayat' },
]

// Tak muncul di baris tab. Dibuka lewat `?tab=` atau tautan "rincian" di banner
// vonis — bukan karena isinya buruk, tapi karena tak menghasilkan pekerjaan.
export const HIDDEN_TABS = [
  { id: 'di', label: 'Decision Intelligence' },
  { id: 'insight', label: 'Insight (kartu band)' },
  { id: 'framework', label: 'Winning Framework' },
]

export const DEFAULT_TAB = 'aksi'

// Id tab versi lama → rumah barunya, supaya tautan lama & kebiasaan mengetik
// URL tak mendarat di tab yang salah (atau di default, diam-diam).
const LEGACY = { plan: 'aksi', exp: 'bukti', luar: 'bukti' }

const KNOWN = new Set([...MAIN_TABS, ...HIDDEN_TABS].map(t => t.id))

// Query sembarang tidak boleh mendudukkan halaman di tab yang tak ada — aturan
// yang sama dipakai deep-link `?page=` di App.jsx.
export function resolveInsightTab(raw) {
  const id = String(raw ?? '').trim()
  if (LEGACY[id]) return LEGACY[id]
  return KNOWN.has(id) ? id : DEFAULT_TAB
}

export const isHiddenTab = (id) => HIDDEN_TABS.some(t => t.id === id)

export const hiddenTabLabel = (id) => HIDDEN_TABS.find(t => t.id === id)?.label || id
