# Business Threshold Decisions — Worksheet

**Untuk:** owner (kamu). **Sifat:** lembar keputusan, BUKAN kode. Setiap baris di sini
adalah `TBD_BUSINESS_DECISION` yang menahan sebuah rule dari "berguna". Angka
"usulan awal" hanyalah **titik mulai untuk kamu pertimbangkan/ubah** — TIDAK
dimasukkan ke kode sampai kamu setujui, dan invariant tetap: **rule ber-TBD tak
pernah APPROVED / tak pernah jalan** (`ruleRegistry.assertRuleTypeConsistency`).

Cara sebuah keputusan mengaktifkan rule (lihat `src/gmvmax/skills/thresholdConfig.mjs`):
```
kamu putuskan nilai → isi thresholdConfig → status rule jadi APPROVED + enabled +
threshold konkret → rule aktif. Selama kosong: semua business rule tetap DRAFT/disabled.
```

Prioritas diurut dari yang **membuka skill paling siap dulu** (S2/S3), lalu S5/S6, lalu S7/S8.

---

## TIER 1 — membuka Skill 2 & 3 (paling siap)

### T1.1 — Material GMV movement % · `GMVMAX-S3-PERF-001`
- **Menggerakkan:** kapan perubahan GMV harian dianggap "material" (bukan noise) → jadi event PERFORMANCE ber-severity, bukan sekadar deskriptif.
- **Pertanyaan:** berapa % perubahan GMV vs H-1 (atau vs rata-rata 7 hari) yang layak dinaikkan jadi peringatan?
- **Usulan awal (pertimbangkan):** turun ≥ 20% → MEDIUM; ≥ 35% → HIGH. Naik besar bisa dibiarkan INFO.
- **Perlu juga:** dasar pembanding (H-1 vs 7-day avg) + apakah pakai lantai omset (abaikan toko sangat kecil).

### T1.2 — Material ROI movement % · `GMVMAX-S3-EFF-001`
- **Menggerakkan:** kapan penurunan ROI/efisiensi jadi event EFFICIENCY.
- **Usulan awal:** ROI turun ≥ 15% (dengan sampel biaya cukup) → MEDIUM; ≥ 30% → HIGH.
- **Perlu juga:** minimum spend agar ROI tak "artefak" (lihat T1.5).

### T1.3 — Spend tanpa order: minimum sample · `GMVMAX-S3-PRODUCT-001`
- **Menggerakkan:** kapan "ada spend, nol order" layak jadi event (bukan cuma noise spend receh).
- **Pertanyaan:** minimum spend (Rp) dan/atau minimum impresi sebelum flag?
- **Usulan awal:** spend ≥ Rp50.000 **dan** nol order dalam periode → flag PRODUCT_HEALTH.
- (Catatan: nilai lama di UI `killFloor`=30rb / `spendFloor`=50rb bisa jadi rujukan, tapi **jangan disalin sebagai APPROVED** tanpa keputusan.)

### T1.4 — Batas konsentrasi · `GMVMAX-S3-CONCENTRATION-001`
- **Menggerakkan:** kapan "terlalu bergantung pada 1 video/produk/campaign" jadi risiko.
- **Usulan awal:** satu entitas > 50% revenue → MEDIUM; > 70% → HIGH.

### T1.5 — Lantai spend / minimum sample (lintas rule)
- **Menggerakkan:** mencegah ROAS/ROI "artefak" pada spend receh (dipakai T1.2, T1.3, klasifikasi video).
- **Usulan awal:** ROI hanya dinilai "terbukti" bila spend ≥ Rp50.000 (samakan dengan spendFloor lama bila kamu setuju).

### T1.6 — Freshness window · `GMVMAX-S1-FRESHNESS-001`
- **Menggerakkan:** kapan snapshot dianggap "basi" → turunkan kesiapan.
- **Pertanyaan:** umur maksimum (jam) sejak tanggal target sebelum data dianggap stale?
- **Usulan awal:** > 30 jam sejak akhir hari (WIB) → tandai stale (karena commit 07:30 menulis "kemarin").

### T1.7 — Attribution maturity window · `GMVMAX-S2-MATURITY-001`
- **Menggerakkan:** kapan data cukup "matang" untuk keputusan (vs masih berubah karena late-attribution).
- **Pertanyaan:** batas jam: EARLY / MATURING / STABLE / FINAL_ENOUGH_FOR_DAILY_DECISION.
- **Usulan awal:** < 24 jam = EARLY (observasi saja); 24–48 jam = MATURING; > 48 jam = cukup untuk keputusan harian. **Butuh validasi dari data drift nyata.**

### T1.8 — Late-attribution risk threshold · `GMVMAX-S2-LATE-001`
- **Menggerakkan:** berapa besar pergeseran revenue antar-pull (tanggal sama) dianggap risiko tinggi.
- **Usulan awal:** drift revenue ≥ 10% antar-pull → MEDIUM; ≥ 20% → HIGH. **Butuh ≥ 2 snapshot sebanding** (belum tersedia — lihat catatan data di bawah).

### T1.9 — Reconciliation tolerance · `GMVMAX-S2-RECONCILE-001`
- **Status sekarang:** EXACT (IDR ternormalisasi integer, tanpa toleransi bisnis) — sudah benar.
- **Keputusan (opsional):** apakah butuh toleransi bisnis (mis. ± Rp X) untuk perbedaan pembulatan sumber? **Rekomendasi: TETAP EXACT** sampai ada alasan bisnis konkret.

### T1.10 — Max aksi harian · `GMVMAX-S9-LIMIT-001`
- **Menggerakkan:** batas jumlah aksi yang boleh disarankan/hari (anti-overload).
- **Usulan awal:** default sudah 3 primary + 3 secondary di kode; keputusan = apakah angka ini final.

---

## TIER 2 — membuka Skill 5 (Target ROI) & Skill 6 (Capital) — saat dibangun

- **S5 (Target ROI):** batas perubahan TROI per langkah, cooldown antar-perubahan, syarat minimum confidence Skill 2, kapan Max Delivery/Promotion Days boleh disarankan. (`GMVMAX-S5-*`)
- **S6 (Capital):** data **break-even/margin** (dari Calculator marketplace), batas kenaikan budget per langkah, batas konsentrasi kapital, cooldown. (`GMVMAX-S6-*`)
- **Prasyarat data:** margin/HPP per produk harus mengalir dari modul Calculator → ini keputusan integrasi, bukan cuma angka.

---

## TIER 3 — Skill 7 (Creative/Affiliate) & Skill 8 (LIVE)

- **S7:** kriteria "winner" vs "fatigue" (butuh time-series performa kreatif + idealnya eksperimen), ambang deklinasi pasokan, sinyal boost. (`GMVMAX-S7-*`)
- **S8:** ambang readiness/traffic/conversion LIVE — **ter-blokir sampai data LIVE tersedia** (belum ada sumbernya). (`GMVMAX-S8-*`)

---

## Catatan data (bukan keputusan bisnis, tapi memengaruhi beberapa di atas)

- **Late-attribution (T1.8) & maturity (T1.7)** butuh **≥ 2 snapshot sebanding untuk tanggal sama** — sekarang belum ada penyimpanan multi-versi yang terekspos (versioning provenance 0029 mulai menyediakannya). Sampai data drift nyata terkumpul, ambang ini sebaiknya tetap `TBD` walau kamu punya usulan angka.
- **Organic overlap / cannibalization** tetap `NOT_MEASURABLE` sampai ada data organik/total-store — **bukan** soal ambang, tapi soal ketersediaan data.
- **True incrementality** tetap `NOT_MEASURABLE` tanpa eksperimen — tak akan dibuka oleh ambang mana pun.

---

## Cara mengaktifkan setelah kamu putuskan

1. Isi nilai di `src/gmvmax/skills/thresholdConfig.mjs` (default kosong = tak ada yang aktif).
2. Jalankan validasi: nilai tak boleh `TBD`; rule yang di-approve tak boleh menyisakan TBD.
3. Rule terkait jadi `runtime_eligible` → skill mulai memakainya. Yang belum diisi tetap DRAFT/disabled.

Tak ada satu pun angka di atas yang berlaku sampai kamu memasukkannya secara sadar.
