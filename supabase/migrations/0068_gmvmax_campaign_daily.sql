-- 0068 — Ringkasan HARIAN per campaign (fungsi baca).
--
-- KENAPA ADA: Campaign Ads kini menampilkan dampak tiap perubahan setting
-- (rata-rata 7 hari sebelum vs hari-hari sesudahnya). Bahannya = belanja, omzet,
-- order per campaign per hari untuk ±45 hari. Menjumlahkannya di browser berarti
-- menarik 21–31 ribu baris gmvmax_creatives (3–5 MB) tiap halaman dibuka —
-- mahal untuk kuota egress dan lambat. Dijumlahkan di Postgres, hasilnya
-- beberapa ratus baris.
--
-- SECURITY INVOKER (sengaja): fungsi berjalan dengan hak PEMANGGIL, jadi RLS
-- gmvmax_imports & gmvmax_creatives tetap berlaku — orang luar workspace
-- mendapat 0 baris, sama seperti bila ia membaca tabelnya langsung. Tidak ada
-- pemeriksaan keanggotaan buatan sendiri yang bisa keliru.
--
-- Hanya versi CURRENT (is_current) yang dijumlah — aturan yang sama dengan
-- listImports di webapp; tanpa itu versi lama ikut terhitung (dobel).
--
-- Webapp tetap jalan sebelum migrasi ini di-apply: src/data/gmvmaxCampaignDaily.js
-- jatuh ke penjumlahan di browser bila fungsi belum ada.

begin;

create or replace function public.gmvmax_campaign_daily(
  p_workspace_id uuid,
  p_from         date,
  p_to           date
) returns table (
  snapshot_date  date,
  campaign_id    text,
  cost           numeric,
  revenue        numeric,
  orders         numeric,
  video_cost     numeric,
  video_revenue  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    i.snapshot_date,
    c.campaign_id,
    coalesce(sum(c.cost), 0),
    coalesce(sum(c.gross_revenue), 0),
    coalesce(sum(c.sku_orders), 0),
    coalesce(sum(c.cost)          filter (where c.creative_type = 'Video'), 0),
    coalesce(sum(c.gross_revenue) filter (where c.creative_type = 'Video'), 0)
  from public.gmvmax_imports i
  join public.gmvmax_creatives c on c.import_id = i.id
  where i.workspace_id = p_workspace_id
    and i.is_current
    and i.snapshot_date between p_from and p_to
    and c.campaign_id is not null
  group by i.snapshot_date, c.campaign_id
$$;

-- DB ini tak punya default privilege untuk fungsi baru → grant eksplisit.
revoke execute on function public.gmvmax_campaign_daily(uuid, date, date) from public;
grant  execute on function public.gmvmax_campaign_daily(uuid, date, date) to authenticated, service_role;

commit;
