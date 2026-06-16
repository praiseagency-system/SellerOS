# Seller Tools — Kuadran Traffic Conversion

Webapp analitik untuk memetakan produk Shopee & TikTok Shop ke dalam 4 kuadran
(High/Low Traffic × High/Low Conversion). Semua jalan di browser — tidak butuh
server/database. Data tersimpan di `localStorage` browser, per workspace.

## Menjalankan di komputer lain

### 1. Prasyarat
Pasang **Node.js** (versi 18 atau lebih baru) dari https://nodejs.org

Cek terpasang:
```bash
node -v
npm -v
```

### 2. Salin folder project
Pindahkan folder ini ke PC tujuan **tanpa folder `node_modules`**
(folder itu besar & akan dibuat ulang otomatis).

### 3. Install dependency & jalankan
Buka terminal di dalam folder project, lalu:
```bash
npm install
npm run dev
```
Buka alamat yang muncul (biasanya http://localhost:5173).

### 4. (Opsional) Build versi produksi
Untuk hasil siap-pakai yang bisa dibuka tanpa dev server:
```bash
npm run build      # hasil ada di folder dist/
npm run preview    # uji hasil build secara lokal
```
Isi folder `dist/` bisa di-host di mana saja (Netlify, Vercel, hosting statis biasa).

## Catatan penting: data tidak ikut pindah otomatis

Workspace & riwayat periode disimpan di **localStorage browser**, jadi **tidak**
ikut terbawa saat folder dipindah ke PC lain. Untuk memindahkan data:

1. Di PC lama: buka **Riwayat Periode**, klik **Export** (tombol unduh) pada tiap
   periode → tersimpan sebagai file `.json`.
2. Di PC baru: buka **Riwayat Periode**, klik **Import**, pilih file `.json` tadi.

## Stack
Vite + React + Tailwind CSS + Recharts + SheetJS (xlsx)
