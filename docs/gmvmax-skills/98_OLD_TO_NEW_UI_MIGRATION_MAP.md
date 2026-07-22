# Old → New UI Migration Map (AI Insight)

**Untuk:** prasyarat gate Phase 3C (blueprint §21.8 + §27.3 "old/new logic migration mapped").
**Aturan (§21.8):** engine baru mengganti rekomendasi lama HANYA setelah **ekuivalensi &
risiko migrasi ditinjau**. Dokumen ini memetakan itu. **Belum ada penggantian/penghapusan** —
UI lama tetap utuh sampai gate lolos.

---

## 1. Inventaris logika lama (yang harus dipetakan)

| File | Peran | Output |
|---|---|---|
| `src/pages/gmvmax/InsightPage.jsx` | UI AI Insight, 3 sub-tab | Insight (kartu Scale/Watch/Kill) · Action Plan · Winning Framework |
| `src/utils/gmvmaxInsights.js` | mesin rule lama | `insightCards()` {scale,watch,kill} · `actionPlan()` 4 langkah · `winningFramework()` best-hook/budget-bucket/age/creator |
| `src/utils/gmvmaxClassify.js` | klasifikasi + **ambang hardcoded** | `DEFAULT_THRESHOLDS` (roasGood 6/roasBad 4/roasGreat 8/spendFloor 50k/killFloor 30k) · `videoStatus()` scale/active/watch/kill/inactive · `qualityTier`/`roasBadge` · `watchAction()` boost/refresh |
| `src/data/gmvmaxActionLog.js` | log aksi manual | `gmvmax_action_log` (action_tag: Scale/Boost/Refresh/Kill/Watch) |

Sumber data lama: `useGmvMax()` → `insights = {cards, plan, framework}` dihitung dari rollup video (bukan canonical Daily Facts).

---

## 2. Peta OLD → NEW

| OLD (fungsi/output) | NEW (skill/fact/rule) | Ekuivalensi | Beda perilaku | Risiko migrasi |
|---|---|---|---|---|
| `DEFAULT_THRESHOLDS` (ROAS 6/4/8, spendFloor 50k, killFloor 30k) | rule registry business rules S3/S7 → **semua `TBD_BUSINESS_DECISION`** + `thresholdConfig` | **TIDAK ekuivalen** | lama klasifikasi seketika; baru MENOLAK sampai ambang disetujui | **TINGGI** — jangan salin angka lama jadi APPROVED tanpa keputusan (worksheet 97) |
| `videoStatus()` scale/active/watch/kill/inactive | Skill 3 event (perf/supply) + Skill 7 lifecycle (NEW→…→FATIGUING) + Skill 5/6 (scale/kill = aksi budget) | Parsial; baru lebih kaya + evidence-gated | lama = band ROAS langsung; baru = event → diagnosis → aksi ter-gate | MEDIUM |
| `insightCards()` kartu Scale/Watch/Kill | Skill 9 primary actions + Skill 4 diagnosis + Skill 7 (kreatif) | Parsial | lama saran "naikkan budget 30–50%"; baru **tahan nilai eksak** (S5/S6 belum) + OBSERVE/REQUIRE_APPROVAL ber-bukti/expiry | **TINGGI** — lama beri saran budget konkret yang baru belum bisa |
| `actionPlan()` 4 langkah | Skill 9 action plan (maks 3+3, bukti/expiry/stop/success-metric) | Parsial | lama 4 langkah tetap + %; baru ≤3 aksi ter-bukti | MEDIUM |
| `winningFramework()` best-hook/budget-bucket/age/creator | Skill 7 (supply/winner) + analitik masa depan | **Belum** (baru fondasi S7) | lama agregasi hook/bucket; baru butuh data eksperimen | RENDAH (pertahankan lama sampai S7) |
| `roasBadge`/`qualityTier` (badge warna) | measurement_label Skill 1/2 + severity Skill 3 | Display-only; boleh koeksis | — | RENDAH |
| `watchAction()` boost/refresh | rekomendasi Skill 7 (add supply/boost/refresh) | Masa depan S7 | — | RENDAH |
| `gmvmax_action_log` (tag Scale/Boost/Refresh/Kill/Watch) | `gmvmax_experiments` (Phase 4) + `gmvmax_action_outcomes` (masa depan) + Skill 9 reviewed/dismissed | Parsial; boost/exclusion kini → experiment | lama = tag manual bebas; baru = experiment terstruktur + outcome H+1/3/7 | MEDIUM — migrasikan Boost/Kill(exclusion) → experiments |
| `InsightPage.jsx` 3 tab | AI Insight Phase 3C (Condition/Confidence/Changes/RootCause/Actions/DoNot/Evidence/History) | Ganti setelah ekuivalensi | lama 3 tab vs baru evidence-first | MEDIUM |

---

## 3. Yang HILANG di engine baru (jangan sampai regresi)

Fitur lama yang **belum** ada padanannya di baru — harus dipertahankan sampai padanannya matang:

1. **Saran budget/% konkret** (`insightCards`/`actionPlan`: "naikkan budget 30–50%", "alihkan ~RpX"). → Butuh Skill 5/6 + ambang + fase execution. Sampai itu, engine baru sengaja **tidak** memberi angka (jujur, `execution_allowed=false`).
2. **Winning Framework** (best-hook, optimal budget bucket, umur konten vs ROAS, creator tier note). → Baru hanya fondasi Skill 7; agregasi belum dibangun.
3. **Verdict seketika** (Scale/Watch/Kill langsung). → Baru menahan verdict sampai ambang disetujui → UI baru menampilkan lebih sedikit "vonis" sampai worksheet 97 diputuskan. **Pertimbangan UX**, bukan bug.

---

## 4. Strategi migrasi (bertahap, reversibel)

```
Fase koeksistensi (default):
  - Engine baru tampil sebagai bagian/tab BARU (AI Insight v2), UI lama TETAP.
  - Feature-flag: v2 off secara default; nyalakan per-workspace utk review.
  - Tak ada penghapusan kode lama.

Buka bertahap saat prasyarat terpenuhi:
  - Ambang (worksheet 97) → S3 materiality → verdict baru sebanding lama.
  - Skill 5/6 → saran budget/Target ROI (padanan saran budget lama).
  - Skill 7 → padanan Winning Framework.
  - gmvmax_action_log → experiments (boost/exclusion) + outcomes.

Pensiunkan tab lama HANYA saat padanan baru:
  - mencapai paritas untuk fitur itu, DAN
  - sudah ditinjau (evidence + kualitas output).

Rollback: pertahankan jalur lama; matikan flag v2 → kembali ke lama seketika.
```

---

## 5. Checklist gate Phase 3C (dari dokumen ini)

- [x] Logika lama diinventaris (bagian 1)
- [x] Peta OLD→NEW + ekuivalensi + risiko (bagian 2)
- [x] Fitur yang belum tergantikan didokumentasikan (bagian 3)
- [x] Strategi koeksistensi + rollback (bagian 4)
- [ ] Ambang bisnis (worksheet 97) diputuskan → membuka paritas verdict
- [ ] Output nyata ter-persist (Phase 3B) → syarat UI v2 menampilkan data asli
- [ ] Kualitas output ditinjau per-tenant sebelum pensiun tab lama

Dua item terakhir bergantung gate provenance + Phase 3B — **di luar** dokumen ini.

---

## 6. Prinsip

Engine baru **melengkapi lalu menggantikan** yang lama, bukan menghapus mendadak.
Perbedaan paling tajam = **kejujuran**: engine lama selalu memberi vonis (ambang hardcoded);
engine baru menahan diri sampai data & keputusan bisnis mendukung. Migrasi tak boleh
mengorbankan kejujuran itu demi meniru kelengkapan vonis lama.
