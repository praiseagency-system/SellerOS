// Identitas penyedia layanan untuk halaman publik & dokumen legal.
// Dipisah dari shell.jsx bukan karena selera: file .jsx yang mengekspor
// konstanta memecah fast-refresh (react-refresh/only-export-components).

// Diisi pemilik layanan 2026-08-29. Selama ada nilai bertanda [ ... ], halaman
// menampilkan peringatan "masih draf"; sekarang sudah bersih.
//
// CATATAN untuk pengajuan verifikasi Google (fase 2.2): `badanHukum` di bawah
// adalah nama dagang, bukan bentuk badan hukum (PT/CV), dan `alamat` baru
// tingkat kota. Google mencocokkan keduanya dengan dokumen usaha saat verifikasi
// OAuth consent screen — bila pengajuan ditolak karena tak cocok, perbaiki di
// sini dulu, bukan di form Google.
export const PENYEDIA = {
  badanHukum:   'Praise Agency',
  alamat:       'Bogor, Indonesia',
  emailPrivasi: 'praiseagency.id@gmail.com',
  // Diverifikasi 2026-08-29 dari Supabase → Settings → Infrastructure (Primary Database).
  wilayahData:  'Tokyo, Jepang (ap-northeast-1)',
}

export const BERLAKU_SEJAK = '29 Agustus 2026'

export const belumDiisi = (v) => typeof v === 'string' && v.startsWith('[')
