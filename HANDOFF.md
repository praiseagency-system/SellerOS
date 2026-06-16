# HANDOFF — Seller Tools: Kuadran Traffic Conversion (Shopee Quadrant)

> Dokumen ini dibuat agar AI/dev lain bisa langsung melanjutkan pekerjaan tanpa
> penjelasan tambahan. Ditulis berdasarkan inspeksi langsung terhadap kode sumber
> pada `2026-06-17`. Tidak ada riwayat Git di folder ini (tidak ada `.git`), jadi
> sebagian "status pengerjaan" disimpulkan dari kode itu sendiri (flag `soon: true`,
> komentar, struktur file) — bukan dari commit log atau percakapan sebelumnya.

---

## 1. Ringkasan Tujuan Project

**Nama produk:** Seller Tools — Kuadran Traffic Conversion
**Apa ini:** Webapp analitik 100% client-side (tanpa server/database) untuk
membantu seller Shopee (dan TikTok Shop) menganalisis performa produk dengan:

- Memetakan setiap produk ke dalam **4 kuadran** berdasarkan:
  - Sumbu X: **Traffic** (jumlah pengunjung)
  - Sumbu Y: **Conversion Rate**
  - Kuadran: High Traffic/High Conversion, High Traffic/Low Conversion,
    Low Traffic/High Conversion, Low Traffic/Low Conversion
- Mengimpor data ekspor toko Shopee/TikTok Shop (file Excel) lalu mem-parsing-nya
  menjadi data produk yang siap dianalisis.
- Menghitung kalkulasi biaya & profitabilitas produk (fee Shopee, fee ongkir,
  fee TikTok, dsb).
- Membandingkan periode (period-over-period) untuk melihat **movement**
  produk antar kuadran dari waktu ke waktu.
- Menyimpan riwayat per **workspace** (multi-toko) di `localStorage` browser —
  tidak butuh akun/server.

Target pengguna: seller/penjual online (Shopee & TikTok Shop) yang ingin
keputusan data-driven soal produk mana yang perlu didorong iklannya, diturunkan
harganya, atau dihentikan.

---

## 2. Status Pengerjaan Saat Ini

Aplikasi **sudah fungsional dan bisa dijalankan** (bukan prototipe kosong).
Sudah ada `dist/` hasil build sebelumnya, dan ada portable zip
(`shopee-quadrant-portable.zip` di `Downloads`) yang dipakai untuk memindahkan
project ke PC lain — ini kemungkinan PC tujuan dari proses pemindahan tersebut.

Tidak ada version control (Git) di folder ini — **sangat disarankan untuk
`git init` + commit awal sebelum melanjutkan pengembangan**, supaya ada riwayat
perubahan yang bisa dilacak.

Tidak ditemukan file `.env` atau env var apa pun — aplikasi ini murni
client-side, tidak butuh secret/API key (lihat bagian 5).

---

## 3. Struktur Folder dan File Penting

Lokasi project: `C:\Users\OC\Documents\shopee-quadrant-portable\shopee-quadrant`

```
shopee-quadrant/
├── .claude/
│   └── launch.json              # config debug launcher (npm run dev --port 5173)
├── public/
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── main.jsx                 # entry point React
│   ├── App.jsx                  # root component, routing antar "page" via state
│   ├── i18n.js                  # semua string UI (ID/EN?) — cek isinya untuk nav/page labels
│   ├── App.css / index.css      # styling global
│   ├── contexts/
│   │   ├── QuadrantContext.jsx  # state global data produk & kuadran per workspace
│   │   ├── LanguageContext.jsx  # context bahasa (useLang(), t())
│   │   └── ThemeContext.jsx     # context tema (light/dark)
│   ├── components/
│   │   ├── Layout.jsx           # shell aplikasi: sidebar nav, header — KUNCI untuk lihat semua menu/fitur
│   │   ├── WorkspaceSwitcher.jsx# UI ganti/buat workspace (multi-toko)
│   │   ├── HeaderControls.jsx
│   │   ├── HistoryPanel.jsx     # riwayat periode + export/import session .json
│   │   ├── FileUpload.jsx       # upload file Excel ekspor Shopee/TikTok
│   │   ├── CategoryPicker.jsx
│   │   ├── OngkirPicker.jsx     # pilihan program ongkir (gratis ongkir/XTRA) utk hitung fee
│   │   ├── TikTokPicker.jsx
│   │   ├── ProductTable.jsx
│   │   ├── QuadrantChart.jsx    # chart scatter kuadran (pakai Recharts)
│   │   ├── QuadrantSummary.jsx
│   │   ├── QuadrantTableView.jsx
│   │   ├── MovementView.jsx     # perbandingan pergerakan produk antar kuadran/periode
│   │   ├── RoasIntelligence.jsx # analisis ROAS
│   │   └── Settings.jsx
│   ├── pages/
│   │   ├── ImportPage.jsx       # halaman import data
│   │   ├── QuadrantPage.jsx     # halaman utama kuadran
│   │   ├── CalculatorPage.jsx   # kalkulator biaya/profitabilitas produk (file TERBESAR, 691 baris)
│   │   ├── ProductsPage.jsx     # daftar produk + buka di calculator
│   │   └── StorePerformancePage.jsx # performa toko (506 baris)
│   └── utils/
│       ├── workspace.js         # CRUD workspace, localStorage keys
│       ├── storage.js           # CRUD session/riwayat periode per workspace
│       ├── parseShopeeData.js   # parser file Excel ekspor Shopee
│       ├── parseTikTokData.js   # parser file Excel ekspor TikTok Shop
│       ├── quadrantUtils.js     # logika pembagian 4 kuadran
│       ├── calc.js              # kalkulasi biaya/profit
│       ├── feeData.js           # tabel fee Shopee per kategori (360 baris — data referensi)
│       ├── ongkirFeeData.js     # tabel fee ongkir/XTRA (272 baris)
│       ├── tiktokFeeData.js     # tabel fee TikTok Shop
│       ├── compareData.js       # logika compare antar periode
│       ├── products.js          # helper data produk
│       ├── storeData.js / storeAnalytics.js / storeIngest.js  # data & analitik performa toko
│       └── (semua data tabel fee perlu di-update manual jika Shopee/TikTok ubah skema biaya)
├── README.md                    # instruksi pindah PC, build, stack (sudah ada, bahasa Indonesia)
├── package.json
├── vite.config.js               # config default Vite + plugin React, TANPA alias/env khusus
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── start-dev-5175.bat           # shortcut Windows: jalankan dev server di port 5175 (127.0.0.1)
├── dist/                        # hasil build produksi (sudah ada, mungkin sudah usang — rebuild ulang)
└── vite-dev.out.log / vite-dev.err.log / vite-bg-out.log / vite-bg-err.log
    # log sisa dev server sebelumnya — saat ini KOSONG (tidak ada error tercatat)
```

**File paling kritikal untuk dipahami lebih dulu:**
1. [src/App.jsx](src/App.jsx) — routing & daftar page (`PAGE_KEYS`)
2. [src/components/Layout.jsx](src/components/Layout.jsx) — daftar menu nav (`NAV` array) → di sinilah terlihat fitur `reports` dan `ai` masih `soon: true`
3. [src/utils/workspace.js](src/utils/workspace.js) & [src/utils/storage.js](src/utils/storage.js) — arsitektur penyimpanan data
4. [src/contexts/QuadrantContext.jsx](src/contexts/QuadrantContext.jsx) — state management inti

---

## 4. Teknologi yang Digunakan

| Layer | Teknologi | Versi (package.json) |
|---|---|---|
| Build tool | Vite | ^8.0.12 |
| UI framework | React | ^19.2.6 |
| Styling | Tailwind CSS | ^3.4.19 + PostCSS + Autoprefixer |
| Charts | Recharts | ^3.8.1 |
| Parsing Excel | SheetJS (`xlsx`) | ^0.18.5 |
| Icons | lucide-react | ^1.17.0 |
| Linting | ESLint (flat config) | ^10.3.0 |
| Penyimpanan data | **Browser `localStorage`** — TIDAK ada backend/database/API eksternal |

Tidak ada framework routing (React Router dll.) — navigasi antar "page"
dilakukan murni via `useState` di `App.jsx`. Tidak ada state management
eksternal (Redux/Zustand) — pakai React Context API bawaan.

---

## 5. Environment Variables yang Diperlukan

**Tidak ada environment variable yang diperlukan.** Aplikasi ini:
- Tidak memanggil API eksternal/backend.
- Tidak punya file `.env`/`.env.example` di project.
- `vite.config.js` polos, tanpa `import.meta.env.*` custom.

Jika ke depan menambah integrasi AI (lihat menu "AI Tools" yang masih `soon`),
kemungkinan besar akan butuh API key (misal untuk LLM) — saat itu baru perlu
ditambahkan `.env` + entri di `.gitignore` (saat ini `.gitignore` belum punya
baris `.env`, perlu ditambahkan nanti).

---

## 6. Dependency dan Cara Instalasi

Prasyarat: **Node.js v18+** ([nodejs.org](https://nodejs.org)).

```bash
# 1. Masuk ke folder project
cd shopee-quadrant

# 2. Install dependency (node_modules sudah ada di PC ini, tapi jika pindah PC lagi
#    tanpa node_modules, jalankan ini)
npm install

# 3. Jalankan dev server
npm run dev
# default port Vite: 5173 (atau custom — lihat bagian 11)
```

`node_modules` **sudah terpasang** di environment ini (folder ada). Jika
memindahkan project ke PC ketiga, **jangan** ikut copy `node_modules` (besar),
cukup `npm install` ulang — sudah diinstruksikan di [README.md](README.md).

---

## 7. Fitur yang Sudah Selesai

Berdasarkan kode yang sudah utuh & terhubung di `App.jsx` / `Layout.jsx`
(bukan `soon: true`):

1. **Import data** (`ImportPage` + `FileUpload` + `parseShopeeData.js` /
   `parseTikTokData.js`) — upload file Excel ekspor toko Shopee & TikTok Shop.
2. **Multi-workspace** (`WorkspaceSwitcher`, `workspace.js`) — kelola beberapa
   toko terpisah, masing-masing dengan riwayat sendiri di localStorage.
3. **Analisis Kuadran** (`QuadrantPage`, `QuadrantChart`, `QuadrantTableView`,
   `QuadrantSummary`, `quadrantUtils.js`) — scatter chart + tabel pembagian
   4 kuadran traffic × conversion.
4. **Riwayat periode** (`HistoryPanel`, `storage.js`) — simpan snapshot per
   periode, export/import sebagai file `.json` (ini juga mekanisme migrasi
   data antar PC, karena localStorage tidak ikut pindah folder).
5. **Movement / Perbandingan periode** (`MovementView`, `compareData.js`,
   `getPreviousSession()` di `storage.js`) — lihat pergerakan produk antar
   kuadran dari periode sebelumnya ke periode terbaru.
6. **Kalkulator biaya & profitabilitas** (`CalculatorPage`, `calc.js`,
   `feeData.js`, `ongkirFeeData.js`, `tiktokFeeData.js`, `CategoryPicker`,
   `OngkirPicker`, `TikTokPicker`) — hitung fee admin Shopee per kategori,
   fee program ongkir/XTRA, fee TikTok Shop, dan estimasi profit produk.
7. **Daftar Produk** (`ProductsPage`, `ProductTable`, `products.js`) — lihat
   semua produk, buka salah satu untuk diedit di kalkulator.
8. **Performa Toko** (`StorePerformancePage`, `storeData.js`,
   `storeAnalytics.js`, `storeIngest.js`) — analitik level toko (bukan hanya
   per produk), file ini termasuk terbesar (506 baris) jadi cukup matang.
9. **ROAS Intelligence** (`RoasIntelligence.jsx`) — analisis return on ad spend.
10. **Multi-bahasa** (`i18n.js`, `LanguageContext.jsx`) — semua label UI lewat
    fungsi `t()`, mendukung ganti bahasa.
11. **Dark/Light theme** (`ThemeContext.jsx`).
12. **Settings** (`Settings.jsx`) — pengaturan aplikasi.
13. **Build produksi** — sudah pernah berhasil di-build (`dist/` folder ada).

---

## 8. Fitur yang Sedang Dikerjakan / Belum Dimulai

Terlihat eksplisit di [src/components/Layout.jsx](src/components/Layout.jsx)
(array `NAV`), kedua menu ini diberi flag `soon: true` (nonaktif, tidak bisa
diklik, label "Soon" muncul di sidebar):

1. **"Reports"** (`id: 'reports'`, section "ANALISIS CERDAS") — menu laporan,
   **belum ada implementasi sama sekali**. Saat diklik akan tetap menampilkan
   placeholder `{t('page.wip')}` dari `App.jsx` (karena `'reports'` ada di
   `PAGE_KEYS` tapi tidak punya kondisi render page-nya di `App.jsx`).
2. **"AI Tools"** (`id: 'ai'`, section "AI TOOLS") — fitur AI, **belum ada
   implementasi sama sekali**. Sama seperti di atas, hanya placeholder WIP.
   Kemungkinan rencana: integrasi LLM untuk insight otomatis dari data kuadran
   (belum ada kode/desain apa pun untuk ini — perlu didiskusikan ulang scope-nya
   dengan user sebelum mulai, karena tidak ada catatan rencana di kode).

Tidak ditemukan kode setengah-jadi (commented-out blocks besar, fungsi stub
kosong dengan TODO) di luar dua menu di atas — selain itu codebase terlihat
"selesai" untuk scope yang sudah dibangun.

---

## 9. Bug / Kendala yang Belum Selesai

**Tidak ditemukan bug tercatat secara eksplisit** (tidak ada komentar `TODO`,
`FIXME`, `BUG`, `HACK`, dan log file dev server — `vite-dev.err.log`,
`vite-bg-err.log` — kosong, tidak ada stack trace error).

Hal-hal yang perlu **diverifikasi manual** oleh siapa pun yang melanjutkan
(bukan bug pasti, tapi titik risiko arsitektural yang layak dicek ulang):

1. **`dist/` mungkin usang** — dibuild dari kode versi sebelumnya, belum tentu
   sinkron dengan `src/` saat ini. Rebuild (`npm run build`) sebelum deploy.
2. **Data tidak portable otomatis** — workspace & riwayat tersimpan di
   `localStorage` browser, bukan di file project. Jika lanjut di PC/browser
   lain, data lama **tidak akan muncul** kecuali sudah di-export manual lewat
   `HistoryPanel` (lihat README bagian "Catatan penting"). **Tanyakan ke user
   apakah data lama sudah di-export sebelum pindah PC.**
3. **`feeData.js`, `ongkirFeeData.js`, `tiktokFeeData.js`** berisi tabel fee
   hardcoded — jika Shopee/TikTok mengubah skema biaya admin/ongkir, tabel ini
   harus diupdate manual (tidak ada mekanisme fetch otomatis dari API resmi).
4. Tidak ada test otomatis (tidak ditemukan folder `__tests__`, file `*.test.js`,
   atau dependency testing framework di `package.json`) — semua verifikasi
   fitur saat ini manual via UI.
5. Tidak ada Git — **tidak ada cara melihat riwayat perubahan/rollback** jika
   ada regresi. Sangat disarankan inisialisasi repo Git sesegera mungkin.

---

## 10. Daftar Task Berikutnya (Berdasarkan Prioritas)

**P0 — Sebelum lanjut coding apa pun:**
1. `git init` di folder `shopee-quadrant/`, buat `.gitignore` sudah ada (cek
   ulang sudah include `node_modules`, `dist`, `*.log` — sudah benar), commit
   baseline awal supaya ada titik aman untuk rollback.
2. Konfirmasi ke user: apakah data localStorage dari PC lama sudah di-export
   (`.json` per periode via HistoryPanel) dan perlu di-import di PC ini?

**P1 — Lanjutkan fitur yang sudah direncanakan (terlihat dari UI "Soon"):**
3. Tentukan scope **"Reports"** — laporan apa yang dibutuhkan? (ringkasan
   periode, ekspor PDF/Excel, dashboard gabungan semua workspace?) — perlu
   klarifikasi user, belum ada spesifikasi di kode.
4. Tentukan scope **"AI Tools"** — insight otomatis dari LLM atas data kuadran?
   Jika ya, akan butuh API key (env var baru, lihat bagian 5) dan keputusan
   provider (OpenAI/Anthropic/dll).

**P2 — Pengerasan kualitas (tidak urgent tapi disarankan):**
5. Tambahkan automated test minimal untuk `utils/` murni (parsing, calc,
   quadrantUtils) — logika ini krusial dan mudah diuji tanpa UI.
6. Rebuild `dist/` dan verifikasi `npm run preview` cocok dengan `npm run dev`.
7. Review ulang tabel fee (`feeData.js`, `ongkirFeeData.js`, `tiktokFeeData.js`)
   terhadap kebijakan terbaru Shopee/TikTok (kebijakan biaya sering berubah).

---

## 11. Perintah Build, Run, Test, dan Deploy

```bash
# Development (hot reload), port default 5173
npm run dev

# Development di port custom (sudah ada shortcut Windows)
# start-dev-5175.bat -> jalankan npm run dev -- --host 127.0.0.1 --port 5175

# Lint
npm run lint

# Build produksi -> output ke dist/
npm run build

# Preview hasil build secara lokal (simulasi production)
npm run preview
```

**Test:** Tidak ada script `test` di `package.json` dan tidak ada test
framework terpasang — belum ada automated testing sama sekali.

**Deploy:** Tidak ada konfigurasi deploy (tidak ada `vercel.json`,
`netlify.toml`, CI/CD workflow). Sesuai README, `dist/` adalah static site
biasa — bisa di-host di Netlify/Vercel/static hosting apa pun dengan cara
upload folder `dist/` atau connect repo Git lalu set build command
`npm run build` dan publish directory `dist`.

---

## 12. Keputusan Arsitektur Penting yang Sudah Dibuat

1. **Tanpa backend/database** — semua logika & state ada di browser. Pilihan
   ini menyederhanakan deployment (cukup static hosting) tapi membuat data
   tidak otomatis sinkron antar device/browser (lihat bagian 9, poin 2).
2. **`localStorage` sebagai sumber kebenaran data**, dengan key dinamis
   `quadrant_sessions_v1::<workspaceId>` (lihat `workspace.js` →
   `sessionsKeyFor()`) — setiap workspace (toko) punya riwayat sesi terisolasi.
3. **Migrasi data legacy otomatis**: saat tidak ada workspace tersimpan,
   `getWorkspaces()` membuat workspace default "Toko Utama" dan memindahkan
   sesi lama dari key global `quadrant_sessions_v1` (versi sebelum
   multi-workspace ada) ke key workspace baru — lihat `migrateLegacySessions()`
   di [workspace.js:97](src/utils/workspace.js). Ini menandakan app sempat
   di-refactor dari single-workspace ke multi-workspace, dan kompatibilitas
   mundur dijaga.
4. **Identitas "periode" = kombinasi `label` + `platform`**: re-upload data
   untuk periode yang sama akan **mengganti** snapshot lama, bukan membuat
   duplikat (lihat komentar di `saveSession()`, [storage.js:16-21](src/utils/storage.js)).
5. **Pemilihan "periode pembanding"** untuk movement view memprioritaskan
   periode kronologis terdekat sebelumnya (`periodValue` lexicographic compare,
   format semacam `"2026-05"`), dengan fallback ke sesi tersimpan terakhir
   yang platform-nya sama tapi periode beda — lihat `getPreviousSession()`
   di [storage.js:29-38](src/utils/storage.js).
6. **Routing tanpa library** — `App.jsx` mengelola halaman aktif lewat
   `useState('currentPage')` + daftar string `PAGE_KEYS`, bukan React Router.
   Sederhana karena tidak butuh deep-linking/URL per halaman.
7. **Remount-by-key pattern** dipakai dua kali secara sengaja di `App.jsx`:
   - `calcKey` membump remount `CalculatorPage` agar form ter-reset saat ganti
     produk yang diedit.
   - `wsKey` membump remount `QuadrantProvider` (seluruh context data) saat
     ganti workspace, supaya data lama tidak "nyangkut" dari workspace
     sebelumnya.
8. **Fitur masa depan di-stub via flag UI** (`soon: true`) di `Layout.jsx`,
   bukan via route/komponen kosong yang bisa diakses — pendekatan ini mencegah
   user mengklik fitur yang belum ada.
9. **Tabel fee (Shopee/TikTok/ongkir) disimpan sebagai data statis di kode**
   (`feeData.js` dkk.), bukan fetch dari API — trade-off: tidak butuh
   koneksi/API key, tapi harus dirawat manual saat kebijakan platform berubah.

---

## 13. Konteks Diskusi yang Perlu Diketahui

- **Tidak ada riwayat percakapan/sesi sebelumnya yang tersimpan** terkait
  project ini di environment yang dipakai untuk membuat dokumen ini — seluruh
  isi dokumen ini disusun dari **pembacaan langsung source code**, bukan dari
  ringkasan obrolan dengan user sebelumnya. Jika ada keputusan desain/diskusi
  lisan dengan user yang belum tercermin di kode atau komentar, **informasi
  itu HILANG** dan AI/dev penerus harus menanyakan ulang ke user, terutama untuk:
  - Scope pasti fitur **"Reports"** dan **"AI Tools"**.
  - Apakah ada rencana menambah platform e-commerce lain (selain Shopee &
    TikTok Shop) — kode parser (`parseShopeeData.js`, `parseTikTokData.js`)
    saat ini eksplisit hanya 2 platform.
  - Apakah perlu migrasi dari `localStorage` ke penyimpanan lain (cloud sync,
    file lokal) — saat ini desainnya murni offline-first single-browser.
- **Bahasa kode & UI**: komentar kode dan string `i18n.js` dominan **Bahasa
  Indonesia** (termasuk README). Pertahankan konsistensi bahasa ini saat
  menambah fitur baru, kecuali user secara eksplisit minta full English.
- **File ekspor zip** `shopee-quadrant-portable.zip` ada di
  `C:\Users\OC\Downloads\` — ini kemungkinan adalah arsip yang dipakai untuk
  memindahkan project ini ke PC saat ini. Folder aktif yang harus dipakai
  untuk melanjutkan kerja adalah:
  `C:\Users\OC\Documents\shopee-quadrant-portable\shopee-quadrant\`
  (BUKAN file zip-nya, dan bukan folder `dist/` di dalamnya — itu hanya hasil
  build, bukan source).
- **Tidak ada CLAUDE.md atau dokumen panduan AI lain** di project ini sebelum
  dokumen `HANDOFF.md` ini dibuat — jadi dokumen ini menjadi sumber konteks
  utama untuk AI assistant berikutnya. **Update bagian 2, 7, 8, 9, 10 di
  dokumen ini setiap kali progres berubah signifikan**, supaya tetap akurat
  untuk handoff selanjutnya.

---

*Dokumen ini dihasilkan otomatis oleh Claude (Sonnet 4.6) berdasarkan inspeksi
source code pada 2026-06-17. Tidak ada data rahasia/credential apa pun yang
disertakan karena project ini memang tidak menggunakan environment variable
atau API key.*
