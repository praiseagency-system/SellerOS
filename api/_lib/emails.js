// Isi email transaksional. Dipisah dari mailer.js supaya bisa diuji tanpa
// menyentuh jaringan, dan supaya teksnya bisa dibaca-ulang tanpa membaca kode
// pengiriman.
//
// Gaya HTML sengaja kuno: tabel tunggal, gaya inline, tanpa <style> di kepala.
// Klien email (terutama Gmail dan Outlook) membuang stylesheet dan sebagian
// besar CSS modern; yang selamat cuma atribut inline.
import { esc } from './mailer.js'

const PERAN = { editor: 'Editor — bisa melihat dan mengubah data', viewer: 'Viewer — hanya bisa melihat' }

// Subjek TIDAK boleh memuat baris baru. Nama workspace diketik pengguna, dan
// "\n" di dalam subjek adalah cara klasik menyuntikkan header email tambahan
// (Bcc, Reply-To). esc() tak menolong di sini — subjek bukan HTML.
const subjekAman = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 180)

// Kerangka bersama: satu kolom 560px, latar terang. Latar dipaku terang
// (bukan mengikuti tema) karena mode gelap klien email tak bisa diandalkan —
// warna teks gelap di atas latar transparan berakhir hitam-di-hitam.
export const bungkus = (isi) => `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px 12px;background:#f4f4f5;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
<tr><td style="padding:28px 28px 8px;font:600 13px/1.4 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#71717a;letter-spacing:.06em;text-transform:uppercase;">Praise Agency</td></tr>
<tr><td style="padding:0 28px 24px;font:400 15px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#27272a;">${isi}</td></tr>
</table>
<div style="max-width:560px;margin:16px auto 0;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#a1a1aa;text-align:center;">SellerOS — alat bantu analitik &amp; iklan marketplace</div>
</body></html>`

export const tombol = (url, label) =>
  `<a href="${esc(url)}" style="display:inline-block;padding:11px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">${esc(label)}</a>`

export function inviteEmail({ workspaceName, inviterEmail, url, role, expiresAt }) {
  const ws = esc(workspaceName || 'sebuah workspace')
  const peran = PERAN[role] || esc(role)
  const kadaluarsa = expiresAt
    ? new Date(expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
    : null

  const html = bungkus(`
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.35;color:#18181b;">Kamu diundang ke workspace <b>${ws}</b></h1>
    <p style="margin:0 0 14px;">${esc(inviterEmail || 'Pemilik workspace')} mengundangmu bergabung di SellerOS sebagai <b>${peran}</b>.</p>
    <p style="margin:0 0 22px;">${tombol(url, 'Terima undangan')}</p>
    <p style="margin:0 0 14px;color:#52525b;font-size:14px;">Undangan ini terikat pada alamat email yang menerimanya${kadaluarsa ? ` dan berlaku sampai ${esc(kadaluarsa)}` : ''}. Kalau kamu masuk dengan email lain, undangan akan ditolak.</p>
    <p style="margin:0;color:#71717a;font-size:13px;">Tidak merasa mengharapkan undangan ini? Abaikan saja — tanpa diterima, tautannya tak melakukan apa pun.</p>`)

  const text = [
    `Kamu diundang ke workspace "${workspaceName || 'sebuah workspace'}" di SellerOS.`,
    `${inviterEmail || 'Pemilik workspace'} mengundangmu sebagai ${PERAN[role] || role}.`,
    '', 'Terima undangan:', url, '',
    `Undangan terikat pada alamat email penerima${kadaluarsa ? ` dan berlaku sampai ${kadaluarsa}` : ''}.`,
    'Kalau kamu tak mengharapkannya, abaikan saja.',
  ].join('\n')

  return { subject: subjekAman(`Undangan ke workspace ${workspaceName || 'SellerOS'}`), html, text }
}
