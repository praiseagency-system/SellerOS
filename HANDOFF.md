# HANDOFF — SellerOS (Growth Intelligence Platform)

> Dokumen ini agar AI/dev lain bisa langsung melanjutkan tanpa penjelasan
> tambahan. Diperbarui **2026-06-18** berdasarkan inspeksi source code + git log
> + konteks dari founder. **Menggantikan versi sebelumnya** (2026-06-17) yang
> sudah usang — versi lama mendeskripsikan app sebagai murni offline/no-backend,
> padahal autentikasi kini sudah memakai **Supabase**.

---

## 1. Posisi & Visi Produk (BACA DULU)

**Nama:** SellerOS. **Repo:** `github.com/praiseagency-system/SellerOS`.

**Posisi saat ini:** **internal operating system** untuk **Praise Agency** —
dipakai founder + tim agency dulu, **belum** SaaS publik. Jangan over-engineer
untuk skala ribuan user. SaaS adalah langkah masa depan, bukan fokus sekarang.

**Tujuan akhir:** bukan dashboard, melainkan **alat bantu pengambilan keputusan**
untuk owner, marketplace specialist, dan ads specialist — berbasis data.

**Prioritas founder saat ini (urut):**
1. Fondasi data yang benar.
2. Workflow analisis yang lebih baik.
3. Bantu keputusan marketplace & iklan.
4. Validasi kegunaan operasional harian.

**Roadmap produk (visi):**
- **Phase 1 — Marketplace Calculator** ✅ selesai
- **Phase 2 — Product Intelligence · Quadrant Analysis · Store Performance** 🟡 sebagian besar selesai (fungsional, tapi fondasi data masih localStorage)
- **Phase 3 — Campaign Monitoring · Ads Monitoring** 🔴 belum (sinyal iklan ada, entitas belum)
- **Phase 4 — AI Recommendation Engine** 🔴 belum (stub `soon`)

> **Affiliate Monitoring DIPISAH** jadi produk sendiri — jangan gabung ke repo ini.

---

## 2. Status Pengerjaan Saat Ini

App **fungsional & bisa dijalankan**. Migrasi ke Supabase berjalan bertahap dan
sudah mencakup: **auth/profiles**, **workspaces**, dan **periods + products
(data import & analisis kuadran)** — semuanya kini di Supabase (per-akun,
multi-user-ready & terverifikasi end-to-end). Yang **masih di `localStorage`**:
(1) produk tersimpan Kalkulator (`quadrant_products_v1`), (2) data Performa Toko
(`quadrant_store_v1`) — slice migrasi berikutnya.

**Migrasi Supabase — Step 1–3 + Settings SELESAI** (git: `10245e6`, `4fdab46`):
- `src/lib/supabase.js` — client; baca env `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.
  Pakai **fallback placeholder URL** agar `createClient` tak throw saat env kosong;
  `isSupabaseConfigured` untuk guard.
- `src/contexts/AuthContext.jsx` — sesi persisten, `signInWithPassword/signUp/
  signInWithGoogle/signOut/refreshProfile`, expose `user/profile/isAdmin/loading`.
  Short-circuit `setLoading(false)` bila env belum di-set.
- `src/pages/LoginPage.jsx` — login/signup + Google (dark theme).
- `src/pages/SettingsPage.jsx` — info akun + toggle consent `share_with_admin` + logout.
- `supabase/migrations/0001_init.sql` — tabel `profiles/workspaces/periods/products`,
  RLS consent-based, trigger auto-profile + anti-eskalasi role, GRANTs.
- `.env.example` (committed); `.env.local` gitignored.

**SELESAI:** workspaces → Supabase (`src/data/workspaces.js`); periods + products
→ Supabase (`src/data/periods.js`, migration `0003`). **PENDING:** Kalkulator
produk & Performa Toko → Supabase; halaman `/admin` (belum ada); validasi upload.
**Catatan posisi:** RLS rumit / panel admin consent **bisa ditunda** selama masih
internal tool (semua anggota tim = trusted). Prioritaskan fondasi data & workflow,
bukan multi-tenant. Akun dummy test: `dummy.tester@selleros.app`.

Git repo aktif (branch `main`, remote `origin` = SellerOS). Tidak ada perubahan
uncommitted saat dokumen ini dibuat.

---

## 3. Struktur Folder Penting

```
shopee-quadrant/
├── src/
│   ├── main.jsx          # entry; provider nesting: Theme → Language → Auth → App
│   ├── App.jsx           # AUTH GATE (loading→spinner, !user→LoginPage) + thin router via useState(PAGE_KEYS)
│   ├── lib/
│   │   └── supabase.js   # client Supabase + isSupabaseConfigured
│   ├── contexts/
│   │   ├── AuthContext.jsx      # Supabase auth (user/profile/isAdmin)
│   │   ├── QuadrantContext.jsx  # STATE INTI kuadran; handleUpload/loadSession; baca localStorage
│   │   ├── LanguageContext.jsx  # i18n (t()), ID/EN
│   │   └── ThemeContext.jsx     # dark/light
│   ├── pages/
│   │   ├── LoginPage.jsx        # NEW — login/signup/Google
│   │   ├── SettingsPage.jsx     # NEW — akun + consent toggle + logout
│   │   ├── ImportPage.jsx       # upload Excel/CSV + period picker
│   │   ├── QuadrantPage.jsx     # tampilan kuadran (display-only, consume context)
│   │   ├── CalculatorPage.jsx   # kalkulator fee/profit (file besar)
│   │   ├── ProductsPage.jsx     # daftar produk → buka di calculator
│   │   └── StorePerformancePage.jsx
│   ├── components/
│   │   ├── Layout.jsx           # sidebar (array NAV) + WorkspaceSwitcher + HistoryPanel
│   │   ├── HeaderControls.jsx   # tema/bahasa/notif/periode + avatar→Settings + logout
│   │   ├── WorkspaceSwitcher.jsx, HistoryPanel.jsx, FileUpload.jsx
│   │   ├── QuadrantChart/Summary/TableView.jsx, MovementView.jsx, RoasIntelligence.jsx
│   │   ├── CategoryPicker/OngkirPicker/TikTokPicker.jsx, ProductTable.jsx, CalcBreakdown.jsx
│   │   └── PlatformIcon.jsx, Settings.jsx
│   └── utils/
│       ├── workspace.js  # CRUD workspace (localStorage); key quadrant_sessions_v1::<wsId>
│       ├── storage.js    # CRUD sesi/periode (localStorage); makeSession/compactProduct/getPreviousSession
│       ├── parseShopeeData.js / parseTikTokData.js  # parser Excel/CSV (+ data iklan → roas)
│       ├── quadrantUtils.js, calc.js, compareData.js, products.js
│       ├── feeData.js / ongkirFeeData.js / tiktokFeeData.js  # tabel fee HARDCODED
│       └── storeData.js / storeAnalytics.js / storeIngest.js
├── supabase/migrations/0001_init.sql
├── .env.example / .env.local(gitignored)
├── .github/workflows/deploy.yml   # GitHub Pages (lihat §Risiko: konflik vs target Vercel)
└── README.md / HANDOFF.md
```

**File paling kritikal dipahami lebih dulu:**
1. `src/App.jsx` — auth gate + routing.
2. `src/contexts/QuadrantContext.jsx` — state inti & alur upload/restore data.
3. `src/utils/storage.js` + `workspace.js` — model data localStorage saat ini.
4. `supabase/migrations/0001_init.sql` — skema Supabase target.

---

## 4. Teknologi

| Layer | Teknologi |
|---|---|
| Build | Vite ^8 |
| UI | React ^19, Tailwind ^3.4, lucide-react |
| Charts | Recharts ^3.8 |
| Parsing | SheetJS `xlsx` ^0.18 |
| Auth + DB | **Supabase** (`@supabase/supabase-js` ^2.108) |
| Data bisnis | **`localStorage` (belum dimigrasi ke Supabase)** |

Routing tanpa library (state `currentPage` + `PAGE_KEYS`). State via Context API.
Belum ada test framework.

---

## 5. Environment Variables (WAJIB sekarang)

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

Salin `.env.example` → `.env.local`. Tanpa env, app tidak crash (fallback
placeholder), tapi login tidak berfungsi — langsung tampil pesan setup.
Di Vercel/CI: set kedua env di project settings.

Setup Supabase: jalankan `0001_init.sql` di SQL Editor, aktifkan provider
Email + Google, jadikan admin via
`update public.profiles set role='admin' where email='...';`.

---

## 6. Fitur yang Sudah Berfungsi

1. **Auth Supabase** — login/signup email-pass + Google, sesi persisten.
2. **Import Data** — `ImportPage`: platform (Shopee/TikTok) + tipe (mingguan 7h/
   bulanan 30h) + period picker + upload zones. Shopee (Performa Produk .xlsx +
   Iklan .csv), TikTok (Products .xlsx + multi-file iklan .xlsx).
3. **Analisis Kuadran** — table view 2×2, scatter chart, tabel sortable.
4. **Auto-save + Auto-compare** — tiap upload tersimpan & dibandingkan dengan
   periode sebelumnya (tab "Perubahan" + delta + badge naik/turun kuadran).
5. **Kalkulator fee & profit** — fee Shopee per kategori, ongkir/XTRA, fee TikTok,
   logistik LSF (TikTok-only), modal rincian + ROAS scaling ladder.
6. **Daftar Produk** → buka di kalkulator.
7. **Performa Toko** — analitik level toko + marketplace filter + tab Transaksi.
8. **Riwayat Periode** — arsip read-only, export/import `.json`, tombol "Buka".
9. **Multi-workspace** — tiap workspace = 1 brand/toko (localStorage).
10. **Settings** — info akun + consent toggle + logout.
11. **i18n (ID/EN)** + **dark/light theme**.

Auto-restore: `QuadrantContext` me-restore periode terbaru saat mount; `App.jsx`
initial page = `getSessions().length>0 ? 'quadrant' : 'import'`.

---

## 7. Fitur Stub (`soon: true` di `Layout.jsx` NAV)

- **"Reports"** (`id: reports`) — belum ada implementasi (placeholder WIP).
- **"AI Tools"** (`id: ai`) — belum ada implementasi (calon Phase 4).

---

## 8. Risiko & Keterbatasan (titik perhatian utama)

1. **Inkonsistensi auth-vs-data (RISIKO #1):** auth = Supabase, data = localStorage.
   Data tidak sinkron antar device walau sudah login. Step 4 migrasi harus
   menutup ini.
2. **Model data marketplace-specific & terpecah:** `compactProduct()`
   ([storage.js](src/utils/storage.js)) memakai field Shopee-centric
   (`pengunjung`, `kode_produk`, `conversion_rate`), sedangkan skema Supabase
   pakai field ternormalisasi (`traffic_value`, `conversion_value`, `raw_data`).
   **Dua model belum direkonsiliasi.** Untuk jadi decision-tool/AI engine,
   butuh **canonical data model** + sumbu waktu (time-series) yang bersih.
   Tiga namespace localStorage terpisah (`sessions`/`products`/`store`) menyulitkan
   query lintas-entitas.
3. **Konflik target deploy:** README/HANDOFF menyebut rencana **Vercel**, tapi
   ada workflow **GitHub Pages** (`.github/workflows/deploy.yml`) + `base:'./'`.
   Pilih satu, rapikan.
4. **Tabel fee hardcoded** (`feeData.js` dll.) — harus update manual saat
   Shopee/TikTok ubah skema biaya. Untuk akurasi profit historis, idealnya jadi
   data versioned + tanggal-berlaku.
5. **Nol automated test** — parser & calc adalah logika kritikal (keputusan uang),
   tapi belum ada test. Risiko regresi diam-diam.
6. **Routing via state** — memadai untuk sekarang; `/admin` atau deep-link nanti
   mungkin perlu router.
7. **Data tidak portable otomatis** — localStorage tidak ikut pindah; pakai
   export/import `.json` di Riwayat Periode.

---

## 9. Rekomendasi Langkah Berikutnya (sesuai posisi internal-tool + decision-making)

**P0 — Fondasi data:**
1. **Definisikan canonical data model** (Product/Period-Snapshot/AdSpend/Metric +
   `raw` per-platform) SEBELUM menambah fitur Phase 3. Ini keputusan termahal
   untuk ditunda.
2. Selesaikan migrasi data localStorage → Supabase (tutup inkonsistensi #1).
   Pertahankan export/import `.json` sebagai tambahan.
3. Bangun data access layer tunggal (`src/data/`) — hentikan akses localStorage
   tersebar.

**P1 — Leverage keputusan tertinggi:**
4. **Time-series N-periode** (bukan compare 2-periode) → tren, bukan snapshot.
5. **Movement/transisi kuadran sebagai daftar aksi**, bukan sekadar badge.
6. **Korelasi Ads ↔ Produk ↔ Kuadran** (di mana spend tidak sejalan performa).
7. **Decision/outcome log** — catat aksi specialist + alasan + hasilnya. **Ini
   data paling strategis untuk AI Recommendation nanti; mulai kumpulkan sekarang
   walau manual** (histori tidak bisa dibangun surut).

**P2 — Pengerasan:**
8. Test untuk `utils/` murni (parser, calc, quadrant).
9. Putuskan deploy (Vercel) + rapikan workflow.
10. Tunda: panel admin consent rumit, multi-tenant, integrasi API marketplace —
    sampai ada kebutuhan nyata / arah SaaS.

---

## 10. Perintah

```bash
npm install
npm run dev       # http://localhost:5173
npm run lint
npm run build     # → dist/
npm run preview
```

Tidak ada `npm test` (belum ada test). Data uji: file `public/test-*.xlsx`.

---

## 11. Keputusan Arsitektur yang Sudah Dibuat

1. **Auth via Supabase**; data bisnis masih localStorage (transisi).
2. **Workspace = tenant**, sesi di-scope per workspace (`quadrant_sessions_v1::<wsId>`).
3. **Periode = `label` + `platform`**; re-upload periode sama → ganti snapshot,
   bukan duplikat ([storage.js](src/utils/storage.js)).
4. **`periodValue`** (mis. `"2026-05"`) = sumbu waktu untuk perbandingan kronologis.
5. **Routing tanpa library**; remount-by-key (`calcKey`, `wsKey`).
6. **Fitur masa depan di-stub** via flag `soon` di NAV, bukan route kosong.
7. **Tabel fee statis di kode** — trade-off: tanpa API, tapi rawat manual.
8. **RLS consent-based di skema Supabase** sudah dirancang (helper SECURITY DEFINER,
   anti-eskalasi role) — siap dipakai jika/ketika data dipindah ke Supabase.

---

*Diperbarui 2026-06-18. Perbarui §1, §2, §6–§9 setiap progres signifikan agar
tetap akurat untuk handoff berikutnya.*
