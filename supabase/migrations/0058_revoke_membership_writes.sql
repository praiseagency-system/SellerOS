-- Kembalikan pertahanan dua lapis pada tabel keanggotaan.
--
-- 0052 dan 0055 masing-masing hanya menulis `grant select ... to authenticated`,
-- dengan maksud jelas: browser boleh MEMBACA keanggotaan, tapi tak boleh
-- menulisnya sama sekali. Maksud itu tidak tercapai. Supabase memberi hak PENUH
-- kepada anon/authenticated/service_role atas setiap tabel baru lewat default
-- privileges, jadi saat kedua tabel itu lahir, `authenticated` SUDAH memegang
-- insert/update/delete — dan `grant select` menambah nol, mencabut nol.
--
-- Akibatnya yang menahan browser menyisipkan dirinya sendiri ke workspace orang
-- lain hanyalah RLS (tak ada policy tulis → INSERT ditolak 42501). Itu memang
-- menahan, dan tak pernah ada kebocoran. Tapi ia satu lapis, bukan dua: sekali
-- ada yang menambahkan policy tulis tanpa berpikir panjang, tak ada lagi
-- privilege yang menghalangi.
--
-- Pola yang benar sudah ada di repo ini — 0051 mencabut lebih dulu, baru memberi
-- per kolom. Migrasi ini menyamakan 0052 & 0055 dengan pola itu.
--
-- Ditemukan 2026-08-31 oleh supabase/tests/proof_isolation.sql, setelah harness
-- bukti diperbaiki agar meniru default privileges Supabase. Sebelum perbaikan
-- itu, harness tak punya grant sama sekali sehingga penolakan datang dari
-- "permission denied" — jawaban yang benar karena alasan yang salah.

revoke insert, update, delete on public.workspace_members from authenticated;
revoke insert, update, delete on public.workspace_invites from authenticated;

-- anon tak pernah punya urusan dengan kedua tabel ini.
revoke all on public.workspace_members from anon;
revoke all on public.workspace_invites from anon;

-- Ditegaskan ulang supaya migrasi ini utuh dibaca sendiri.
grant select on public.workspace_members to authenticated;
grant select on public.workspace_invites to authenticated;
grant all    on public.workspace_members to service_role;
grant all    on public.workspace_invites to service_role;
