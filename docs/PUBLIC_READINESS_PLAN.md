# PUBLIC_READINESS_PLAN — SellerOS

> Rencana perbaikan menuju peluncuran publik, hasil audit 2026-08-28
> (HEAD `6e39691`). Baseline: **±50%** siap sebagai SaaS publik,
> **±75%** sebagai internal tool multi-akun.
>
> Aturan pelaporan (mengikuti pola Praise): progres dilaporkan sebagai
> **% per area dengan bukti** (file:baris / hasil uji), bukan klaim.
> Tiap fase punya **gerbang (gate)** — fase berikutnya tidak dimulai
> sebelum gerbang lolos.

## Ringkasan fase

| Fase | Isi | Estimasi | Target kumulatif |
|---|---|---|---|
| 0 | Keandalan cepat (reset password, atomic import, git) | 1–2 hari | 57% |
| 1 | Keamanan (proxy, token, video_meta) + Gate pentest | 3–4 hari | 67% |
| 2 | Identitas & akun (profil ke DB, OAuth keluar Testing) | 3–5 hari | 75% |
| 3 | Team multi-user per workspace (jalur kritis terbesar) | 1–2 minggu | 85% |
| 4 | Komersial & legal (billing, ToS/privacy, onboarding) | 1–2 minggu | 95% |
| 5 | Ops & kualitas (Sentry, test, lint penuh) — paralel | 2–3 hari | — |

Total ±4–6 minggu kerja efektif. Fase 5 boleh berjalan paralel sejak Fase 1.

---

## Fase 0 — Keandalan cepat (1–2 hari)

**0.1 Reset password** (blocker fatal, effort kecil)
- Tambah link "Lupa password?" di `LoginPage.jsx` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin })`.
- Tangani event `PASSWORD_RECOVERY` di `AuthContext.jsx:35` (`onAuthStateChange`) → tampilkan form password baru → `supabase.auth.updateUser({ password })`.
- Bukti lolos: alur lupa-password end-to-end di `selleros.praiseagency.id` (kirim email → set password baru → login).

**0.2 Atomic import jalur browser**
- Fakta: `gmvmax_replace_snapshot` (migrasi 0017) sudah `SECURITY INVOKER`
  (patuh RLS pemanggil) tapi grant hanya `service_role` (0017:114).
- Migrasi baru: `grant execute ... to authenticated` — aman karena invoker.
- `src/data/gmvmaxImports.js` `saveImport` (baris 235–260): ganti
  delete-lalu-insert dengan satu panggilan `supabase.rpc('gmvmax_replace_snapshot', …)`.
- Bukti lolos: simulasi insert gagal (payload rusak) → snapshot lama TETAP ada.

**0.3 Higiene repo**
- Commit 12 file untracked (`deploy/vps-shadow/*`, `scripts/gmvmax-*`).
- `.gitignore`: `logs/`, `dist/`, `dist-vps/`, `*.log`, `vite-*.log`.

**Gate 0:** ketiganya terbukti + `npm run test` & build hijau.

---

## Fase 1 — Keamanan (3–4 hari) — 1.1 & 1.3 SELESAI 2026-08-28

**1.1 Hardening proxy Vercel — SELESAI.** Cakupan ternyata LEBIH LUAS dari
audit Juli yang menyebut "2 fungsi Vercel". Saat dikerjakan ditemukan **4**
endpoint, dan dua yang tak terdaftar justru yang paling berbahaya:

| Endpoint | Sifat | Kondisi sebelumnya |
|---|---|---|
| `api/tiktok/token` | relai token OAuth | terbuka |
| `api/tiktok/advertisers` | baca daftar akun | terbuka |
| `api/gmvmax/tt-video` | baca video/katalog | terbuka (tak terdaftar di audit) |
| **`api/gmvmax/execute`** | **TULIS ke TikTok** — ikat spark, ubah budget/ROI, buat sesi boost | **terbuka** (tak terdaftar di audit) |

Keempatnya kini lewat `api/_lib/guard.js`: wajib `Authorization: Bearer <JWT
Supabase>` (diverifikasi ke `/auth/v1/user`), allowlist Origin, batas laju
per user+IP, dan **gagal tertutup** bila env auth tak tersedia.

**1.1b Verifikasi `approval_id` — SELESAI, dan ternyata TIDAK butuh service_role.**
Sebelumnya `execute` menerima `approval_id` apa adanya (hanya dicek tak kosong),
sehingga user login bisa mengeksekusi aksi tanpa melewati antrean persetujuan —
padahal SEMUA pagar bisnis (batas kenaikan budget, cooldown, kill switch) ada di
jalur pembuatan/persetujuan approval, bukan di endpoint ini.

Asumsi awal "butuh baca DB sisi server, jadi butuh `SUPABASE_SECRET_KEY`" **salah**.
Gerbang sudah memverifikasi JWT pemanggil, jadi endpoint cukup bertanya ke
PostgREST **memakai JWT itu** (`selectAsUser`): RLS `gmvmax_approvals_owner_all`
mengevaluasi `auth.uid()` sebagai pemanggil, sehingga baris milik tenant lain
tak pernah terbaca. Hak istimewa tak diperlukan — cukup bertanya sebagai user itu.

Kini ditolak: approval milik akun lain / tak ada (403), belum APPROVED (409),
untuk jenis aksi berbeda (400), `approval_id` bukan UUID (400). "Tak ditemukan"
dan "bukan milikmu" sengaja berjawaban sama agar keberadaan approval orang lain
tak bocor. Semua penolakan terjadi SEBELUM TikTok tersentuh.

**1.2 Token TikTok tidak lagi terbaca client — BELUM, asumsi awal SALAH.**
Rencana awal menyebut "client tak butuh membaca isi token". Setelah dibaca,
ternyata **butuh**: `renew` memanggil `refreshAccessToken(conn.refresh_token)`
dan keempat endpoint di atas dipanggil dengan `access_token` dari browser.
Jadi mencabut SELECT kolom token akan mematikan Integrasi TikTok.

Urutan yang benar (ini yang MEMANG butuh `SUPABASE_SECRET_KEY` di env Vercel —
keputusan user; berbeda dari verifikasi approval di 1.1b yang ternyata cukup
dengan JWT pemanggil):
1. Pindahkan `renew` + pengambilan token ke sisi server: endpoint membaca token
   via service_role berdasarkan workspace milik pemanggil, jadi token tak pernah
   menyentuh browser. Di sini service_role tak terhindarkan — justru tujuannya
   adalah membaca yang TIDAK boleh dibaca pemanggil.
2. Baru cabut SELECT kolom token dari `authenticated`.
3. Enkripsi at-rest (pgsodium) menyusul.

**1.3 `gmvmax_video_meta` — SELESAI** (migrasi 0050). Policy `using(true) with
check(true)` diganti: baca bebas, insert hanya `video_id` numerik, update hanya
untuk baris yang belum `ok` (baris berhasil jadi beku → tak bisa ditimpa).
Sisa risiko yang disadari: user login masih bisa mengisi video yang belum
ter-cache dengan nama karangan — menutupnya menuntut enrichment pindah ke
server (kini di browser karena oEmbed mengizinkan CORS).

**Gate 1:** pentest ringan pakai **Strix** (sudah terpasang di Mac, via Colima)
terhadap proxy + auth; temuan High/Critical = 0.

---

## Fase 2 — Identitas & akun (3–5 hari)

**2.1 Profil & brand pindah dari localStorage ke DB**
- `profiles`: + `full_name`, `phone`, `avatar_url`; `workspaces`: + `logo_url`.
- Avatar/logo → Supabase Storage (bucket baru `avatars`, private + signed URL,
  atau ikuti pola bucket `product-images`).
- Migrasi baca-tulis di `SettingsPage.jsx` + fallback baca localStorage sekali
  untuk migrasi data lama per user.

**2.2 Google OAuth keluar dari status Testing**
- Ajukan verifikasi app di GCP (`praise-agency`, dipakai bersama Praise — koordinasikan).
- Custom domain auth Supabase agar consent menampilkan domain sendiri, bukan supabase.co.

**2.3 Email auth di domain sendiri** — SMTP custom + template Bahasa Indonesia
untuk confirm/reset.

**Gate 2:** daftar akun baru dari nol di HP orang lain → profil + logo tampil
di device kedua (bukti data di DB, bukan localStorage).

---

## Fase 3 — Team: multi-user per workspace (1–2 minggu, JALUR KRITIS)

Saat ini 1 workspace = 1 `user_id`; tab Team stub (`SettingsPage.jsx:456`).

**3.1 Skema**
- `workspace_members(workspace_id, user_id, role: owner|editor|viewer, invited_by, created_at)`.
- Backfill: owner lama → baris member `owner`.
- `workspace_invites(token, email, role, expires_at)` untuk undangan.

**3.2 Refactor RLS — bagian terbesar**
- Helper `is_member(ws_id)` / `can_edit(ws_id)` (SECURITY DEFINER, pola
  `is_admin()` di migrasi 0001).
- Ganti policy `user_id = auth.uid()` → membership-based di SEMUA tabel bisnis
  (±20 tabel, migrasi 0001–0048). Satu migrasi besar, per-tabel dicek.
- `tiktok_connections`: kelola koneksi hanya `owner`.

**3.3 UI Team tab**
- Undang via email (magic link berisi token invite — pola magic-link `/approve`
  yang sudah ada bisa ditiru), ubah role, keluarkan anggota.

**Gate 3 (wajib bukti, bukan klaim):**
- Dua akun riil dalam satu workspace: keduanya lihat data yang sama.
- Akun ketiga di luar workspace: query langsung via anon key → 0 baris.
- Script uji isolasi SQL diarsipkan di `scripts/`.

---

## Fase 4 — Komersial & legal (1–2 minggu)

> ⚠️ Butuh KEPUTUSAN USER dulu: (A) peluncuran gated waitlist (seperti Praise
> "Ajukan Akses") vs open signup + billing langsung. Scope 4.1–4.2 mengikuti.

**4.1 Billing** — Xendit (implementasi penuh sudah ada di Praise → replikasi
pola): tabel plan + subscription, trial, gate kuota (jumlah workspace, anggota,
retensi hari snapshot).
**4.2 Halaman publik** — landing page, Privacy Policy, ToS; noindex dilepas
hanya untuk halaman publik (JANGAN blokir robots.txt — mematikan preview WA,
lihat memori SellerOS Web Meta).
**4.3 Onboarding** — wizard workspace pertama + panduan import pertama
(contoh file), karena user publik tak didampingi seperti user internal.

**Gate 4:** satu user eksternal betulan menyelesaikan daftar → bayar/trial →
import pertama tanpa bantuan.

---

## Fase 5 — Ops & kualitas (paralel sejak Fase 1, 2–3 hari)

- **Sentry** di SPA + fungsi Vercel (sekarang nol observability).
- **Test jalur uang**: `parseShopeeData` / `parseTikTokData` / `parseGmvMax` /
  `calc.js` (vitest sudah terpasang; test baru worker-only 20 file).
- **Lint penuh di CI**: perbaiki 6 error react-hooks lama, hapus pengecualian
  di `validate.yml` (catatan di file itu sendiri menyebut ini utang PR #20).
- Hapus workflow GitHub Pages usang bila masih ada (konflik dengan `api/` Vercel).

---

## Keputusan yang menunggu user

1. **Model peluncuran** (Fase 4): gated waitlist dulu atau open + billing?
2. **Level enkripsi token** (1.2): opsi ringan (sembunyikan dari client) cukup
   dulu, atau langsung pgsodium?
3. **Struktur role Team** (3.1): owner/editor/viewer cukup, atau perlu role
   khusus (mis. ads-specialist read-only campaign)?
