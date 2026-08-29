// Identitas penyedia layanan untuk halaman publik & dokumen legal.
// Dipisah dari shell.jsx bukan karena selera: file .jsx yang mengekspor
// konstanta memecah fast-refresh (react-refresh/only-export-components).

// ⚠️ WAJIB DIISI SEBELUM DIPAKAI SEBAGAI DOKUMEN RESMI ⚠️
// Nilai-nilai ini tak bisa ditebak dari kode — hanya pemilik layanan yang tahu.
// Selama masih bertanda [ ... ], halaman menampilkan peringatan "masih draf"
// dan BELUM layak dikirim ke Google maupun ditunjukkan ke klien.
export const PENYEDIA = {
  badanHukum:   '[NAMA BADAN HUKUM — WAJIB DIISI]',
  alamat:       '[ALAMAT LENGKAP — WAJIB DIISI]',
  emailPrivasi: '[EMAIL KONTAK PRIVASI — WAJIB DIISI]',
  // Diverifikasi 2026-08-29 dari Supabase → Settings → Infrastructure (Primary Database).
  wilayahData:  'Tokyo, Jepang (ap-northeast-1)',
}

export const BERLAKU_SEJAK = '29 Agustus 2026'

export const belumDiisi = (v) => typeof v === 'string' && v.startsWith('[')
