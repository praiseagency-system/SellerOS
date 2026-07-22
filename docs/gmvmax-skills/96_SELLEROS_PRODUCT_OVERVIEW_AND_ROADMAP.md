# SellerOS — Product Overview & Forward Roadmap

**Lanjutan dari:** GMV Max Skills Spec Pack (`docs/gmvmax-skills/00`–`95`)
**Sifat dokumen:** produk + arah (bukan spec eksekusi). Menjelaskan **apa yang ADA sekarang**
di webapp SellerOS dan **ke mana bisa berkembang**. Semua ambang bisnis tetap
`TBD_BUSINESS_DECISION`; tak ada klaim eksekusi otomatis (`execution_allowed=false`).

---

## 0. Ringkasan satu paragraf

SellerOS adalah **operating system untuk agency afiliasi TikTok Shop (Praise)** +
**analitik toko sendiri (marketplace)**. Inti nilainya: mengubah data mentah
GMV Max Ads / afiliasi menjadi **keputusan yang bisa dipercaya** — deterministik,
berbasis bukti, per-tenant, dan dapat diaudit. Hari ini SellerOS kuat di
**pengumpulan + visualisasi data**; lapisan **kecerdasan keputusan (Decision
Intelligence)** sudah dibangun di belakang layar (Skills 1–4 & 9) dan tinggal
di-wire ke UI. Arah ke depan: dari *"lihat data"* → *"pahami penyebab"* →
*"rekomendasi ter-guard"* → (jauh, dengan izin) *"eksekusi disetujui"*.

---

## PART A — YANG ADA SEKARANG (live di webapp)

Struktur navigasi = 3 seksi.

### A.1 GMV MAX ADS (modul inti)

Pelacakan & analisis performa iklan **TikTok Shop GMV Max** per video/creator/produk,
multi-tenant (satu workspace = satu toko/klien afiliasi).

| Halaman | Fungsi sekarang |
|---|---|
| **Dashboard** (`gmv_dashboard`) | Ringkasan omset/ROAS/orders lintas periode; Top video (Hall of Fame), tren |
| **Campaign Ads** (`gmv_campaign`) | Performa per campaign + kartu GMV per video; Video Performa |
| **Monitoring** → **Input** (`gmv_input`) | Upload manual "Video Performance List" (xlsx export TikTok) → snapshot harian |
| **Monitoring** → **Overview** (`gmv_overview`) | Video Overview: status Scale/Watch/Kill per video (klasifikasi ROAS) |
| **Monitoring** → **Product** (`gmv_product`) | Performa per produk/SPU; histori |
| **Monitoring** → **Creator** (`gmv_creator`) | Ranking creator (spend/revenue/ROAS); klik nama → histori GMV lintas periode |
| **AI Insight** (`gmv_insight`) | Rekomendasi **rule-based lama** (Scale/Watch/Kill, Action Plan, Winning Framework) — ambang ROAS hardcoded |
| **Boost / Spark Center** (`gmv_boost`) | Lookup spark code per video (handoff tim Ads), deteksi video "kode masuk" |
| **Feature Registry** (`gmv_features`) | Kapabilitas GMV Max **runtime-verified** per toko (mana yang benar-benar tersedia, bukan sekadar ada di schema API) |
| **Log** (`gmv_log`) | Catatan/aksi per video (Note/Log lintas periode) |

**Cara data masuk (ingestion):**
- **Upload manual** file export TikTok (Input page) → snapshot kanonik harian.
- **Auto-sync via TikTok Business API resmi** (worker VPS terjadwal 07:30 WIB) →
  menulis snapshot kanonik tanpa upload manual (paritas vs upload terbukti 1:1).
- **Connect TikTok Ads** (OAuth PKCE self-service) — tenant menyambungkan akun ads
  sendiri; token per-workspace, self-refresh.

**Fondasi data (di belakang halaman):** snapshot kanonik harian
(`gmvmax_imports`/`gmvmax_creatives`), setting campaign harian
(`gmvmax_campaign_settings`), Feature Registry (state + history), sync-run
observability, multi-advertiser per tenant (merge akun ads dengan dedup).

### A.2 MARKETPLACE (toko sendiri)

Analitik & alat untuk toko sendiri (bukan afiliasi):

| Halaman | Fungsi |
|---|---|
| **Store Performance** | Metrik performa toko |
| **Traffic Quadrant** | Analisis kuadran **traffic vs conversion rate** produk (alat asli SellerOS) |
| **Calculator** | Kalkulator HPP/harga/margin (fondasi cash-benefit) |
| **Products** | Master produk (harga jual sudah masuk sebagai fondasi margin) |
| **Campaign** | Alat campaign toko |
| *Reports* | (stub — "soon") |

### A.3 PLATFORM (lintas modul)

- **Auth** Supabase multi-user + **admin consent-based** (admin baca hanya dengan izin).
- **Workspaces / multi-tenant** — isolasi ketat per workspace (tiap API route verifikasi workspace).
- **TikTok Connect** (OAuth) + MCP layer + **Official Business API** sebagai sumber data.
- **UI** glassmorphism, dark carbon + aksen biru; **i18n ID/EN**.
- **Provenance & observability data** (baru): audit tulis kanonik + versioning
  (lihat Part B) agar sumber data dapat ditelusuri & aman diganti.

---

## PART B — YANG SUDAH DIBANGUN, BELUM DI-WIRE KE UI

Ini "mesin" yang membedakan SellerOS dari sekadar dashboard.

### B.1 Decision Intelligence Engine (Phase 3A)

Lapisan deterministik yang mengubah data kanonik → keputusan. **Sudah dibangun &
teruji** (bukan mock), belum tampil di UI:

```
Canonical data → Daily Facts → Skill 1 → Skill 2 → Skill 3 → Skill 4 → Skill 9 → Action Plan
```

- **Daily Facts** — fakta harian null-aware (missing ≠ 0; zero-cost ROI ≠ ∞).
- **Skill 1 — Business & Data Blueprint**: apa yang ada/aktif/terukur + kesiapan skill hilir.
- **Skill 2 — Attribution Reliability Audit (V1)**: seberapa layak data untuk keputusan
  (kelengkapan, rekonsiliasi, late-attribution). Default jujur: incrementality =
  `NOT_MEASURABLE` tanpa eksperimen.
- **Skill 3 — Daily Control Tower**: deteksi event (performa/efisiensi/delivery/kreatif/
  produk/kualitas-data). Event materialitas **dinonaktifkan** sampai ambang bisnis disetujui.
- **Skill 4 — Root Cause Diagnosis**: driver kemungkinan **berbasis bukti** (CONFIRMED→
  INSUFFICIENT_EVIDENCE), selalu sertakan alternatif; tak mengklaim kausalitas tanpa bukti.
- **Skill 9 — Daily Action Plan Orchestrator**: satu-satunya penyusun aksi final; maksimum
  3 aksi + 3 observasi; konflik diekspos; approval untuk aksi material; **tak pernah eksekusi**.
- **Loader + Pipeline + CLI** read-only untuk generate output per (workspace, tanggal).

Prinsip yang ditegakkan kode: deterministik, tanpa LLM sebagai sumber kebenaran,
tanpa panggilan mutasi TikTok, tanpa tulis kanonik dari skill, `execution_allowed=false`.

### B.2 Provenance Hardening (canonical trust)

Karena keputusan hanya sebaik datanya, dibangun fondasi **keterlacakan sumber**:
- **Audit tulis kanonik** (live) — tiap insert/delete `gmvmax_imports` terekam
  (siapa/kapan/import lama→baru) → penggantian out-of-band tertangkap.
- **Versioning + lineage** (terverifikasi di DB) — snapshot jadi ber-versi & immutable:
  konten sama → **no-op** (cegah churn), konten berubah → versi baru (versi lama
  disimpan, bukan dihapus). Satu current per (toko, tanggal).
- **Date-effective sources** — sumber advertiser dihitung dari membership per tanggal
  (bukan daftar statis) → akun LEGACY yang sudah migrasi tak lagi "ditarik" pasca-migrasi.

---

## PART C — KE DEPAN BISA SEPERTI APA (roadmap)

### C.1 Jangka dekat — "nyalakan otaknya di UI"

Wire Decision Intelligence (B.1) ke halaman **AI Insight** sebagai pengganti mesin
rule lama. UI baru per hari/toko:
- **Today's Business Condition** (dari Skill 1) — kesiapan & kualitas data.
- **Attribution Confidence** (Skill 2) — boleh optimasi agresif atau hanya observasi?
- **Top Changes** (Skill 3) — apa yang berubah hari ini (deskriptif dulu).
- **Root Cause** (Skill 4) — kenapa, dengan bukti + alternatif.
- **Today's Action Plan** (Skill 9) — maksimum 3 aksi, tiap aksi punya bukti/expiry/
  success-metric/stop-condition, tombol hanya *View evidence / Mark reviewed / Dismiss / Snooze*.
- Semua output **tersimpan & ber-versi** (deterministic signature) → bisa dilihat histori
  keputusan + "kenapa dulu direkomendasikan begini".

### C.2 Skill 5–8 (dari master spec — belum dibangun)

Membutuhkan **ambang bisnis yang disetujui** (`TBD_BUSINESS_DECISION`) + fondasi data:

- **Skill 5 — Target ROI Optimization Engine**: rekomendasi Target ROI/ROAS bid dengan
  gate keandalan (tak menurunkan TROI saat late-attribution tinggi).
- **Skill 6 — Capital Allocation Engine**: alokasi budget berbasis break-even/margin
  (butuh data margin — kalkulator marketplace bisa jadi sumbernya).
- **Skill 7 — Creative & Affiliate Supply Engine**: kesehatan pasokan kreatif, winner/
  fatigue, koordinasi afiliasi (nyambung ke Praise Affiliate OS).
- **Skill 8 — LIVE GMV Max Growth Engine**: optimasi LIVE (ter-blokir sampai data LIVE tersedia).

Tiap skill lahir sebagai **SPEC → DRAFT rule → REVIEW → APPROVED**; tak ada rule
ber-ambang yang jalan di produksi sebelum disetujui.

### C.3 Tangga otomasi (dengan gerbang manusia)

```
OBSERVE (sekarang) → RECOMMEND → REQUIRE_APPROVAL → (jauh) SAFE_TO_EXECUTE ter-guard
```

Sebelum ada eksekusi apa pun ke TikTok: endpoint tulis runtime-verified, approval
eksplisit, isolasi tenant, audit log, before/after, bounds, cooldown, idempotency,
rollback, kill-switch, verifikasi hasil, rate-limit, periode observasi. (Detail di
`94_EXECUTION_AND_APPROVAL_BOUNDARIES.md`.)

### C.4 Integrasi lintas-modul

- **GMV Max ↔ Marketplace**: margin/HPP dari Calculator → memberi Skill 6 konteks
  profitabilitas (cash-benefit aman).
- **GMV Max ↔ Praise Affiliate OS**: cocokkan performa iklan ke afiliasi via
  usernameTiktok → ACOS/ROI per creator, pemilihan creator, Spark Center handoff.
- **Traffic Quadrant ↔ Produk GMV Max**: kuadran traffic/CVR toko sendiri sebagai
  pembanding organik vs berbayar (mendekati organic-overlap yang kini `UNKNOWN`).

### C.5 Skala & operasional

- **Zero-touch onboarding multi-tenant** (rencana): tiap workspace ber-Connect
  auto-sync via worker data-driven dari `tiktok_connections` — tambah klien tanpa
  sentuh kode.
- **Governance data**: audit + versioning + lineage (Part B.2) jadi standar; setiap
  keputusan bisa ditelusuri ke snapshot & versi rule yang dipakai.
- **Rate-limit governor** global (TikTok limit per-app) + penjadwalan tarik data.

---

## PART D — PRINSIP (kenapa dibangun begini)

1. **Deterministik & evidence-based** — output bisa direproduksi; tak ada angka karangan.
2. **Missing ≠ zero** — nilai hilang tetap `null/UNKNOWN`.
3. **Jujur soal ketidaktahuan** — incrementality/organic/kanibalisasi = `NOT_MEASURABLE`
   tanpa bukti; tak mengklaim kausalitas dari korelasi/ROAS.
4. **`execution_allowed=false`** invariant sampai gerbang eksekusi lengkap.
5. **Provenance-first** — keputusan hanya sebaik data; sumber wajib dapat diaudit.
6. **Ambang bisnis = milik manusia** — semua `TBD_BUSINESS_DECISION` menunggu keputusan owner.
7. **Multi-tenant isolation** — tak ada kebocoran lintas-workspace.

---

## PART E — URUTAN FASE (ringkas)

| Fase | Isi | Status |
|---|---|---|
| **Data & UI dasar** | GMV Max module + Marketplace + Connect + auto-sync | ✅ live |
| **Decision Intelligence (Skills 1–4, 9)** | mesin keputusan deterministik + CLI | ✅ dibangun, belum di-UI |
| **Provenance hardening** | audit + versioning + date-effective sources | ✅ audit live; cutover writer siap (belum deploy) |
| **Wire ke UI** | AI Insight versi baru (9-skill) + persist output | ⬜ berikutnya |
| **Skill 5–8** | TROI/Capital/Supply/LIVE engines | ⬜ butuh ambang bisnis + data |
| **Approval → (jauh) execution** | rekomendasi ter-approve → eksekusi ter-guard | ⬜ jauh, banyak prasyarat keamanan |
| **Governance ambang bisnis** | ubah `TBD` → rule `APPROVED` bertahap | 🔒 keputusan owner |

---

*Catatan: dokumen ini deskriptif/arah. Implementasi apa pun tetap mengikuti kontrak
di `00_SHARED_SKILL_CONTRACT.md`, batas di `94_EXECUTION_AND_APPROVAL_BOUNDARIES.md`,
dan registry rule di `90_RULE_REGISTRY.md`. Tak ada bagian di sini yang mengotorisasi
eksekusi atau mengisi nilai `TBD_BUSINESS_DECISION`.*
