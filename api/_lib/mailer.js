// Pengirim email transaksional lewat Resend.
//
// Dipisah dari Supabase Auth dengan sengaja. Supabase hanya mengirim email
// bawaannya sendiri (reset kata sandi, magic link) memakai templat di
// dashboard; undangan tim memakai token kami sendiri di tabel
// workspace_invites, jadi isinya harus kami tulis dan kirim sendiri.
//
// ATURAN PALING PENTING DI BERKAS INI: kegagalan kirim TIDAK BOLEH
// menggagalkan operasi yang memanggilnya. Undangan sudah tercatat di basis
// data sebelum email disentuh; kalau Resend sedang mati atau kunci belum
// dipasang, pemilik workspace tetap harus dapat tautannya untuk dikirim
// lewat WhatsApp. Email itu kemudahan, bukan syarat.

const env = (...names) => {
  for (const n of names) { const v = String(process.env[n] ?? '').trim(); if (v) return v }
  return ''
}

// JANGAN pernah diberi awalan VITE_ — apa pun yang berawalan itu ikut
// dikompilasi ke bundel browser, dan kunci Resend bisa dipakai siapa saja
// untuk mengirim email atas nama domain kita.
export const mailerEnv = () => ({
  apiKey: env('RESEND_API_KEY'),
  // Harus alamat di domain yang SUDAH terverifikasi di Resend. Kalau tidak,
  // Resend menolak dengan 403 dan emailnya tak pernah terkirim.
  //
  // praiseagency.id sudah terverifikasi di akun Resend yang sama dengan Praise
  // Affiliate OS (rekaman send.* dan resend._domainkey.* sudah ada di DNS sejak
  // sebelum berkas ini dibuat), jadi alamat mana pun di domain itu langsung sah.
  // RESEND_FROM_EMAIL diterima sebagai nama cadangan supaya sama dengan
  // konvensi yang sudah dipakai Praise (src/lib/email.ts di repo itu).
  from: namaPengirim(env('MAIL_FROM', 'RESEND_FROM_EMAIL')),
})

// Alamat polos ("selleros@praiseagency.id") dibungkus nama tampilan, supaya di
// kotak masuk terbaca "SellerOS", bukan alamat mentah. Nilai yang sudah memuat
// "<" dianggap lengkap dan dibiarkan apa adanya. Praise melakukan hal yang sama
// di src/lib/email.ts — disamakan agar env bisa disalin antar-produk.
const namaPengirim = (raw) => {
  const v = String(raw || '').trim()
  if (!v) return 'SellerOS <noreply@praiseagency.id>'
  return v.includes('<') ? v : `SellerOS <${v}>`
}

export const mailerReady = () => Boolean(mailerEnv().apiKey)

// Nilai apa pun yang berasal dari pengguna (nama workspace, alamat email)
// WAJIB lewat sini sebelum masuk HTML. Nama workspace diketik pengguna dan
// bisa berisi < > & — tanpa ini, email undangan jadi jalan menyuntikkan markup.
export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export async function sendMail({ to, subject, html, text }) {
  const { apiKey, from } = mailerEnv()
  if (!apiKey) throw new Error('RESEND_API_KEY belum dipasang.')

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  })
  if (!r.ok) {
    // Pesan Resend dipotong: badan galat bisa panjang dan ikut masuk ke respons
    // API kami. Cukup untuk mendiagnosis (403 domain belum diverifikasi, 422
    // alamat pengirim salah), tak cukup untuk membanjiri log.
    throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
  return true
}
