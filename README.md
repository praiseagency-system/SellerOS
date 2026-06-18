# SellerOS — Growth Intelligence Platform (e-commerce)

> **Status:** internal operating system untuk **Praise Agency** (dipakai tim dulu,
> belum SaaS publik). Tujuan akhir bukan dashboard, melainkan **alat bantu
> pengambilan keputusan** untuk owner, marketplace specialist, dan ads specialist.

Webapp analitik untuk seller Shopee & TikTok Shop. Import file ekspor toko
(Excel/CSV), lalu petakan tiap produk ke **4 kuadran** (Traffic × Conversion Rate),
hitung fee & profit, analisis ROAS, performa toko, dan bandingkan antar-periode.

Marketplace Calculator + Quadrant Analysis adalah **titik masuk**; visinya
adalah Growth Intelligence Platform (lihat roadmap di bawah).

## Roadmap produk (visi founder)

- **Phase 1 — Marketplace Calculator** ✅ selesai
- **Phase 2 — Product Intelligence · Quadrant Analysis · Store Performance** 🟡 sebagian besar selesai
- **Phase 3 — Campaign Monitoring · Ads Monitoring** 🔴 belum
- **Phase 4 — AI Recommendation Engine** 🔴 belum

> **Affiliate Monitoring dipisah** menjadi produk tersendiri — bukan bagian dari repo ini.

## Arsitektur singkat

- **Frontend:** Vite + React + Tailwind + Recharts + SheetJS (`xlsx`).
- **Auth:** Supabase Auth (email/password + Google OAuth). **Sudah aktif.**
- **Data bisnis (workspace/periode/produk):** **masih di `localStorage` browser.**
  Skema Supabase (`supabase/migrations/0001_init.sql`) sudah dibuat, tapi
  **operasi data belum dipindah ke Supabase** — migrasi data masih berjalan.
  Lihat [HANDOFF.md](HANDOFF.md) untuk detail status.
- **Repo:** `github.com/praiseagency-system/SellerOS`.

## Menjalankan secara lokal

### 1. Prasyarat
Node.js v18+ (https://nodejs.org). Cek: `node -v` & `npm -v`.

### 2. Environment variables (WAJIB)
Aplikasi butuh kredensial Supabase untuk login. Salin `.env.example` → `.env.local`
lalu isi dari Supabase Dashboard → Project Settings → API:

```bash
cp .env.example .env.local
```

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

> Tanpa env ini, app tetap jalan tapi langsung menampilkan halaman login dengan
> pesan setup (tidak crash — ada fallback placeholder di `src/lib/supabase.js`).

### 3. Setup Supabase (sekali saja, per project Supabase)
1. Buka **SQL Editor** di Supabase Dashboard, jalankan isi
   `supabase/migrations/0001_init.sql` (membuat tabel, RLS, trigger).
2. Aktifkan provider **Email** dan **Google** di Authentication → Providers.
   Redirect URI Google: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Jadikan akun admin setelah signup:
   ```sql
   update public.profiles set role = 'admin' where email = 'kamu@contoh.com';
   ```

### 4. Install & jalankan
```bash
npm install
npm run dev          # default http://localhost:5173
npm run lint
npm run build        # output ke dist/
npm run preview      # uji hasil build
```

## Catatan data

- **Data bisnis tersimpan di `localStorage` browser**, di-scope per workspace
  (`quadrant_sessions_v1::<workspaceId>`). **Tidak ikut pindah** antar
  browser/device. Untuk memindahkan: **Riwayat Periode → Export** (`.json`) di
  PC lama, lalu **Import** di PC baru.
- Profil & role user tersimpan di Supabase (tabel `profiles`).

## Deploy

- Target deploy direncanakan **Vercel** (static `dist/`).
- Saat ini ada workflow GitHub Pages (`.github/workflows/deploy.yml`) dan
  `vite.config.js` memakai `base: './'` (relative, aman untuk Pages).
  **Catatan:** target deploy final perlu dikonfirmasi (Vercel vs GitHub Pages) —
  lihat [HANDOFF.md](HANDOFF.md) §Risiko.
- Untuk Vercel: set env `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY` di
  project settings, build command `npm run build`, output `dist`.

## Stack
Vite · React 19 · Tailwind CSS · Recharts · SheetJS (xlsx) · Supabase (Auth + Postgres) · lucide-react
