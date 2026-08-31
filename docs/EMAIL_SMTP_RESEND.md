# Email transaksional — Resend + Supabase SMTP

Fase 2.3 dari [PUBLIC_READINESS_PLAN.md](PUBLIC_READINESS_PLAN.md).
Ditulis 2026-08-29, direvisi 2026-08-31.

## Ringkasan: akun Resend dipakai bersama Praise

**Domain `praiseagency.id` SUDAH terverifikasi di Resend** — dipakai Praise
Affiliate OS sejak sebelum berkas ini ada (`src/lib/email.ts` di repo itu,
mengirim dari `invite@praiseagency.id`). Diperiksa lewat DNS 2026-08-31:

```
send.praiseagency.id              MX   10 feedback-smtp.ap-northeast-1.amazonses.com
send.praiseagency.id              TXT  "v=spf1 include:amazonses.com ~all"
resend._domainkey.praiseagency.id TXT  p=MIGfMA0GCSqGSIb3...
```

Artinya **tak ada pekerjaan DNS tersisa** untuk SellerOS. Alamat mana pun di
`@praiseagency.id` langsung sah dikirim. Region Resend-nya `ap-northeast-1`
(Tokyo) — kebetulan sama dengan region Supabase SellerOS.

## Kenapa perlu

Tiga alur berhenti tanpa email yang benar-benar terkirim:

| Alur | Kode | Pengirim |
|---|---|---|
| Reset kata sandi | `src/contexts/AuthContext.jsx:76` | Supabase Auth |
| Magic link persetujuan `/approve` | `src/pages/ApprovalPage.jsx:429` | Supabase Auth |
| Undangan anggota tim | `api/team/invite.js` | Resend langsung (kita sendiri) |

SMTP bawaan Supabase dibatasi beberapa email per jam dan **tidak untuk
produksi**. Itu sebabnya undangan tim sampai sekarang hanya mengembalikan
tautan untuk disalin ke WhatsApp.

## ⚠️ DNS: sudah beres — jangan diutak-atik

Root `praiseagency.id` memegang kotak surat **Hostinger** yang aktif:

```
MX   praiseagency.id  →  mx1.hostinger.com (5), mx2.hostinger.com (10)
TXT  praiseagency.id  →  v=spf1 include:_spf.mail.hostinger.com ~all
```

Rekaman Resend semuanya di **subdomain** (`send`, `resend._domainkey`), jadi
keduanya hidup berdampingan tanpa bentrok. **Jangan** mengubah MX atau SPF di
root dengan alasan apa pun — itu mematikan kotak surat Hostinger. DNS dikelola
di Hostinger (nameserver `hermes/artemis.dns-parking.com`).

## Langkah yang tersisa

### 1. API key — kunci `seller os` (sejak 2026-08-31)

SellerOS memakai kunci Resend bernama **`seller os`** untuk KEDUA jalur: kolom
Password SMTP Supabase (reset kata sandi, magic link) dan env `RESEND_API_KEY`
di Vercel (undangan tim).

Kunci lama **"Supabase Integration"** sudah TIDAK SAH dan menjadi penyebab
seluruh email diam-diam tak terkirim — lihat "Jebakan diagnostik" di bawah.
Hapus saja dari daftar Resend supaya tak menyesatkan nanti.

**Konsekuensi yang harus diingat saat mendiagnosis:** satu kunci duduk di dua
tempat. Kalau ia dirotasi atau dicabut, yang mati BUKAN satu fitur tapi dua —
reset kata sandi dan undangan tim, berbarengan. Jadi kalau kedua fitur itu mati
bersamaan, curigai kuncinya lebih dulu, bukan kode di kedua sisi.

Kunci milik Praise Affiliate OS (kemungkinan bernama "Onboarding") TIDAK ikut
terpengaruh — itu kunci berbeda di akun yang sama.

### 2. Supabase — ✅ SUDAH TERPASANG (diperiksa 2026-08-31)

Custom SMTP sudah menyala di proyek `mhamqoqvemthumasqwrr`, lewat kunci Resend
bernama "Supabase Integration". **Jangan diganti** — cukup diverifikasi:

| Kolom | Nilai terpasang |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Sender email | `team@praiseagency.id` |
| Sender name | `Praise Agency` |

Bawaan `MAIL_FROM` di kode disamakan dengan ini, supaya reset kata sandi (dikirim
Supabase) dan undangan tim (dikirim `api/_lib/mailer.js`) tidak datang dari dua
identitas berbeda.

**Yang masih perlu dicek:** Authentication → **Rate Limits** → batas kirim email.
Supabase memasang batasnya sendiri di atas Resend — bawaannya rendah (puluhan per
jam), dan itu berlaku terpisah dari kuota Resend.

Lalu **Authentication → Emails → Templates**, tempel isi berkas dari
[`supabase/email-templates/`](../supabase/email-templates/):

| Templat Supabase | Berkas | Subjek |
|---|---|---|
| Reset Password | `reset-password.html` | Atur ulang kata sandi |
| Magic Link | `magic-link.html` | Tautan masuk |
| Confirm signup | `confirm-signup.html` | Konfirmasi alamat email |

Berkas-berkas itu **dihasilkan**, bukan ditulis tangan — jalankan
`node supabase/email-templates/build.mjs` setelah mengubah rangkanya di
`api/_lib/emails.js`, jangan sunting `.html`-nya langsung.

### 3. Vercel — untuk undangan tim

**Settings → Environment Variables**, scope **Production**:

| Nama | Nilai | Wajib? |
|---|---|---|
| `RESEND_API_KEY` | API key `selleros` | ya |
| `MAIL_FROM` | `Praise Agency <team@praiseagency.id>` | tidak — sudah jadi bawaan |

`RESEND_FROM_EMAIL` diterima sebagai nama cadangan `MAIL_FROM`, mengikuti
konvensi Praise. Alamat polos otomatis dibungkus jadi `Praise Agency <alamat>`.

> **JANGAN** beri awalan `VITE_`. Apa pun yang berawalan itu ikut dikompilasi ke
> bundel browser, dan kunci Resend yang bocor bisa dipakai siapa saja mengirim
> email atas nama domain kita. Aturan yang sama berlaku untuk
> `SUPABASE_SECRET_KEY` (lihat `api/_lib/guard.js`).

Setelah menambah env var, **redeploy** — env baru tak masuk ke deployment lama.

## Kuota dipakai berdua

Paket gratis Resend: **100 email/hari**, 3.000/bulan, 3 domain. Sejak SellerOS
ikut mengirim, kuota itu **dibagi dengan Praise** — dan batas harian yang lebih
ketat, bukan batas bulanan. Praise mengirim undangan workspace dan email
keputusan waitlist; kalau keduanya pernah dikirim berbarengan dalam jumlah
besar, periksa pemakaian di dashboard Resend sebelum membuka pendaftaran.
Paket Pro $20/bln menghapus batas harian (50.000/bulan).

## ⚠️ Jebakan diagnostik: Supabase TIDAK melaporkan kegagalan SMTP

Terjadi 2026-08-31 dan memakan waktu lama untuk ditemukan. Gejalanya:

- Email tak pernah sampai
- Resend tak mencatat apa pun — bukan "gagal", melainkan **tidak ada barisnya sama sekali**
- Log auth Supabase menulis `/signup | request completed` dan `/recover | request
  completed` dengan severity **INFO**, kolom `error` **kosong**, tanpa satu pun
  entri merah
- Akun pengguna tetap terbuat; `signUp` mengembalikan sukses ke browser

**Penyebabnya: kunci API yang tersimpan di kolom Password SMTP sudah tak sah.**
Supabase gagal autentikasi ke `smtp.resend.com`, lalu **melaporkannya sebagai
sukses**. Resend tak mencatat apa-apa karena autentikasi gagal tak pernah
menghasilkan catatan email.

**Aturan yang harus diingat:** "tidak ada galat di log auth Supabase" BUKAN
bukti email terkirim. Satu-satunya bukti adalah barisnya muncul di Resend, atau
emailnya benar-benar sampai.

**Cara memperbaikinya, tanpa menebak:** buat kunci Resend BARU, lalu tempel ke
kolom Password SMTP dan simpan. Kalau setelah itu email datang, kunci lamalah
penyebabnya. Jangan mencoba memulihkan nilai kunci lama — Resend maupun Vercel
hanya menampilkannya sekali, dan menebak-nebak di situ membuang waktu.

Yang SUDAH terbukti bukan penyebab (jangan diperiksa ulang lebih dulu): toggle
Enable custom SMTP, host/port/username, alamat pengirim, batas laju Supabase
(25 email/jam), dan rekaman DNS.

## Perilaku saat gagal

Undangan tim **tidak pernah** gagal karena email. Urutannya: baris undangan
ditulis ke basis data dulu, baru email dicoba. Kalau Resend mati, kuota habis,
atau `RESEND_API_KEY` belum ada, respons tetap 200 dan tetap memuat `url` untuk
disalin — hanya `emailed: false` (plus `email_error` bila ada sebabnya). Dijaga
test di `api/team/team.test.js` ("Resend gagal TIDAK menggagalkan undangan").

## Verifikasi setelah dipasang

1. Reset kata sandi dari halaman masuk → email masuk dalam <1 menit, berbahasa
   Indonesia, pengirim `team@praiseagency.id`.
2. Undang anggota ke workspace uji → respons memuat `"emailed": true`.
3. Buka salah satu email di Gmail → **Show original**: `SPF: PASS`,
   `DKIM: PASS`, `DMARC: PASS`.
4. Pastikan email Praise **masih terkirim** — kunci baru tidak mengganggu yang
   lama, tapi murah untuk dicek.
