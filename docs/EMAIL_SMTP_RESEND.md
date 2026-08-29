# Email transaksional — Resend + Supabase SMTP

Fase 2.3 dari [PUBLIC_READINESS_PLAN.md](PUBLIC_READINESS_PLAN.md). Ditulis 2026-08-29.

## Kenapa perlu

Tiga alur berhenti tanpa email yang benar-benar terkirim:

| Alur | Kode | Pengirim |
|---|---|---|
| Reset kata sandi | `src/contexts/AuthContext.jsx:76` | Supabase Auth |
| Magic link persetujuan `/approve` | `src/pages/ApprovalPage.jsx:429` | Supabase Auth |
| Undangan anggota tim | `api/team/invite.js` | Resend langsung (kita sendiri) |

SMTP bawaan Supabase dibatasi beberapa email per jam dan **tidak untuk produksi**.
Itu sebabnya undangan tim sampai sekarang hanya mengembalikan tautan untuk
disalin ke WhatsApp.

## ⚠️ Jebakan DNS — baca sebelum menyentuh apa pun

Domain `praiseagency.id` **sudah punya email yang berjalan**:

```
MX   praiseagency.id  →  mx1.hostinger.com (5), mx2.hostinger.com (10)
TXT  praiseagency.id  →  v=spf1 include:_spf.mail.hostinger.com ~all
```

Kotak surat itu milik Hostinger dan **tidak boleh terganggu**. Kabar baiknya:
rekaman yang diminta Resend semuanya berada di **subdomain**, bukan di root —

| Tipe | Host | Bentrok dengan Hostinger? |
|---|---|---|
| MX | `send` | Tidak — root tetap milik Hostinger |
| TXT (SPF) | `send` | Tidak — SPF root tetap utuh |
| TXT (DKIM) | `resend._domainkey` | Tidak — rekaman baru |

**Yang TIDAK boleh dilakukan:** mengubah atau mengganti MX di root, dan
mengganti (bukan menambah) TXT SPF di root. Keduanya akan mematikan email
Hostinger. Kalau panel Hostinger menawarkan "replace existing records" saat
menambah domain, tolak dan tambahkan satu per satu.

DNS dikelola di **Hostinger** (nameserver `hermes/artemis.dns-parking.com`),
jadi rekaman ditambahkan di hPanel → Domains → DNS Zone Editor.

## Langkah

### 1. Resend
1. Buat akun di [resend.com](https://resend.com).
2. **Domains → Add Domain** → isi `praiseagency.id`, pilih region terdekat
   (Tokyo/Singapore bila tersedia).
3. Resend menampilkan 3 rekaman. Salin **persis**, termasuk nilai region di
   `feedback-smtp.<region>.amazonses.com` — nilainya berbeda per region, jadi
   jangan pakai contoh dari dokumen mana pun.
4. Tambahkan ketiganya di Hostinger DNS Zone Editor. Saat mengisi kolom "Name",
   tulis hanya `send` dan `resend._domainkey` — **tanpa** `.praiseagency.id`
   di belakangnya (Hostinger menambahkannya sendiri; kalau ditulis, hasilnya
   jadi `send.praiseagency.id.praiseagency.id`).
5. Kembali ke Resend → **Verify**. Perlu beberapa menit sampai satu jam.
6. **API Keys → Create** → izin *Sending access* saja. Salin kuncinya sekali;
   Resend tak menampilkannya lagi.

### 2. Supabase (untuk reset kata sandi & magic link)
**Authentication → Emails → SMTP Settings → Enable custom SMTP:**

| Kolom | Nilai |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | API key Resend |
| Sender email | `noreply@praiseagency.id` |
| Sender name | `SellerOS` |

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

### 3. Vercel (untuk undangan tim)
**Settings → Environment Variables**, scope **Production**:

| Nama | Nilai |
|---|---|
| `RESEND_API_KEY` | API key Resend |
| `MAIL_FROM` | `SellerOS <noreply@praiseagency.id>` |

`MAIL_FROM` opsional — bawaannya sudah `SellerOS <noreply@praiseagency.id>`.

> **JANGAN** beri awalan `VITE_`. Apa pun yang berawalan itu ikut dikompilasi ke
> bundel browser, dan kunci Resend yang bocor bisa dipakai siapa saja mengirim
> email atas nama domain kita. Aturan yang sama berlaku untuk
> `SUPABASE_SECRET_KEY` (lihat `api/_lib/guard.js`).

Setelah menambah env var, **redeploy** — env baru tak masuk ke deployment lama.

## Perilaku saat gagal

Undangan tim **tidak pernah** gagal karena email. Urutannya: baris undangan
ditulis ke basis data dulu, baru email dicoba. Kalau Resend mati, domain belum
terverifikasi, atau `RESEND_API_KEY` belum ada, respons tetap 200 dan tetap
memuat `url` untuk disalin — hanya `emailed: false` (plus `email_error` bila ada
sebabnya). Dijaga oleh test di `api/team/team.test.js`
("Resend gagal TIDAK menggagalkan undangan").

## Verifikasi setelah dipasang

1. Reset kata sandi dari halaman masuk → email masuk dalam <1 menit, berbahasa
   Indonesia, pengirim `noreply@praiseagency.id`.
2. Undang anggota ke workspace uji → respons memuat `"emailed": true`.
3. Kirim satu email uji ke alamat Gmail dan periksa **Show original**:
   `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
4. Pastikan email Hostinger yang lama **masih masuk** — kirim satu pesan ke
   kotak surat `@praiseagency.id` yang ada.
