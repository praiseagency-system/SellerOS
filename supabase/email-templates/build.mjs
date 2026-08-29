// Menghasilkan templat email bawaan Supabase dari rangka yang SAMA dengan
// email undangan (api/_lib/emails.js). Tanpa ini, ada dua tampilan email yang
// harus disamakan dengan tangan setiap kali branding berubah — dan yang satu
// pasti tertinggal.
//
// Jalankan: node supabase/email-templates/build.mjs
// Hasilnya ditempel ke Supabase → Authentication → Emails.
//
// `{{ .ConfirmationURL }}` dan kawan-kawan adalah placeholder milik Supabase
// (sintaks Go template) — SENGAJA tak di-escape dan tak boleh diubah.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bungkus, tombol } from '../../api/_lib/emails.js'

const DIR = dirname(fileURLToPath(import.meta.url))
const URL_KONFIRMASI = '{{ .ConfirmationURL }}'

const catatanAbaikan = (apa) =>
  `<p style="margin:0;color:#71717a;font-size:13px;">Kalau bukan kamu yang ${apa}, abaikan email ini — tak ada yang berubah selama tautannya tidak dibuka.</p>`

const TEMPLAT = {
  'reset-password': {
    judul: 'Atur ulang kata sandi',
    isi: `
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:#18181b;">Atur ulang kata sandi</h1>
    <p style="margin:0 0 22px;">Klik tombol di bawah untuk memilih kata sandi baru SellerOS.</p>
    <p style="margin:0 0 22px;">${tombol(URL_KONFIRMASI, 'Pilih kata sandi baru')}</p>
    <p style="margin:0 0 14px;color:#52525b;font-size:14px;">Tautan ini hanya berlaku sebentar dan sekali pakai.</p>
    ${catatanAbaikan('meminta ini')}`,
  },
  'magic-link': {
    judul: 'Tautan masuk',
    isi: `
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:#18181b;">Tautan masuk SellerOS</h1>
    <p style="margin:0 0 22px;">Buka tautan ini untuk masuk tanpa kata sandi.</p>
    <p style="margin:0 0 22px;">${tombol(URL_KONFIRMASI, 'Masuk ke SellerOS')}</p>
    <p style="margin:0 0 14px;color:#52525b;font-size:14px;">Tautan ini hanya berlaku sebentar dan sekali pakai. Jangan teruskan ke siapa pun — siapa pun yang membukanya akan masuk sebagai kamu.</p>
    ${catatanAbaikan('meminta tautan ini')}`,
  },
  'confirm-signup': {
    judul: 'Konfirmasi alamat email',
    isi: `
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:#18181b;">Konfirmasi alamat email</h1>
    <p style="margin:0 0 22px;">Satu langkah lagi untuk mengaktifkan akun SellerOS-mu.</p>
    <p style="margin:0 0 22px;">${tombol(URL_KONFIRMASI, 'Konfirmasi email')}</p>
    ${catatanAbaikan('mendaftar')}`,
  },
}

for (const [nama, { judul, isi }] of Object.entries(TEMPLAT)) {
  const berkas = join(DIR, `${nama}.html`)
  writeFileSync(berkas, bungkus(isi) + '\n')
  console.log(`${nama}.html — subjek yang disarankan: "${judul}"`)
}
