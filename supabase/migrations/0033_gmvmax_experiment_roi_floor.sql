-- GMV Max — AMBANG ROI PENILAIAN EKSPERIMEN (roiFloor). Kolom setting per-workspace
-- yang dipakai classifyOutcome untuk memberi vonis winner/lemah. NULL = belum diset
-- → penilaian tetap konservatif (INCONCLUSIVE), tak mengarang. Aditif & aman.
alter table public.gmvmax_settings
  add column if not exists experiment_roi_floor numeric;
