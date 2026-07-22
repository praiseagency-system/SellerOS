-- ============================================================================
-- Campaign induk (parent) — nama campaign besar di marketplace yang menaungi
-- beberapa sub-campaign (mis. "Gajian Sale Juli & 8.8" → [PREMIUM-XBP],
-- [BASIC-XBP], dst). Tiap record campaign = satu sub-campaign; parent_campaign
-- mengelompokkan mereka. Nullable agar campaign lama tetap valid (tanpa induk).
-- Jalankan di Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns
  add column if not exists parent_campaign text;
