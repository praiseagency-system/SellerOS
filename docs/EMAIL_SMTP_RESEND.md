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

### 1. API key terpisah untuk SellerOS

Di akun Resend yang sama → **API Keys → Create**, izin *Sending access* saja,
beri nama `selleros`.

**Jangan menyalin kunci milik Praise.** Kunci SellerOS akan hidup di dua tempat
tambahan (env Vercel + kolom password SMTP Supabase); kalau ia bocor atau perlu
dirotasi, kunci terpisah membuat rotasinya tidak ikut mematikan undangan dan
email keputusan waitlist di Praise. Resend juga melaporkan pemakaian per kunci,
jadi terlihat produk mana yang mengirim.

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
