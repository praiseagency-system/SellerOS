-- ============================================================================
-- Cache metadata video TikTok (username/nama akun) hasil lookup oEmbed publik
-- berdasarkan video_id. Data publik & universal → cache global (dibagi semua
-- workspace), sekali fetch per video. Dipakai mengisi kolom AKUN yang kosong.
-- ============================================================================

create table if not exists public.gmvmax_video_meta (
  video_id    text primary key,
  username    text,           -- handle asli, mis. "zani.pmgks"
  author_name text,           -- nama tampilan, mis. "Zanii"
  status      text,           -- 'ok' | 'notfound' | 'error' (untuk hindari re-fetch)
  fetched_at  timestamptz not null default now()
);

grant select, insert, update on public.gmvmax_video_meta to authenticated;

alter table public.gmvmax_video_meta enable row level security;

-- Data publik (bukan milik workspace tertentu): boleh baca/tulis semua user login.
drop policy if exists gmvmax_video_meta_rw on public.gmvmax_video_meta;
create policy gmvmax_video_meta_rw on public.gmvmax_video_meta
  for all to authenticated using (true) with check (true);
