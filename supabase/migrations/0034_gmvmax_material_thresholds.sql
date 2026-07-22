-- GMV Max — AMBANG PERUBAHAN MATERIAL (Tier 1 / worksheet 97). Kolom setting
-- per-workspace: berapa % perubahan GMV / ROI vs H-1 dianggap MATERIAL → Skill 3
-- memancarkan event ber-severity (turun=HIGH, naik=MEDIUM), bukan sekadar deskriptif.
-- Disimpan dalam PERSEN (mis. 20 = 20%). NULL = belum diset → tetap deskriptif
-- (perilaku konservatif saat ini; tak mengarang TBD). Aditif & aman.
alter table public.gmvmax_settings
  add column if not exists gmv_material_pct numeric,
  add column if not exists roi_material_pct numeric;
