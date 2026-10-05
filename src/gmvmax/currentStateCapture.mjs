// POTRET KEADAAN-TERKINI (langkah 4 & 4b worker commit) + PENJAGA TANGGAL-nya.
//
// Tiga tabel potret — gmvmax_campaign_settings, gmvmax_boost_sessions,
// gmvmax_spark_auth — diisi dari endpoint yang HANYA bisa menjawab "bagaimana
// keadaannya SEKARANG" (campaign_gmv_max_info_get, _session_list_get,
// tt_video_list_get). TikTok tak punya versi historisnya. Baris ber-snapshot_date
// D karena itu hanya jujur bila diambil tepat setelah hari D berakhir, yaitu
// pada run harian (D = kemarin WIB). Menarik ulang tanggal lampau lalu
// menstempel keadaan HARI INI dengan tanggal itu memalsukan riwayat: sesi boost
// 16–18 Sep sempat tampil first_seen 9 Agu, dan diff setelan antar-hari
// melaporkan perubahan pada tanggal yang salah (backfill Dasfelix, 18 Sep 2026).
//
// Penjaganya sengaja diturunkan dari (tanggal, jam run) — BUKAN bendera yang
// dioper pemanggil — supaya berlaku seragam untuk run harian, penambal otomatis
// (gapFill.mjs), dan backfill manual `--date`, dan tak bisa terlupa di salah
// satunya. Akibat yang disadari: hari yang ditambal belakangan TIDAK punya
// potret setelan. Celah yang jujur lebih baik daripada riwayat palsu; diff
// antar-hari (diffSettings) cukup melompati tanggal yang kosong.
import { resolveSnapshotDate } from './runtime/jakartaDate.mjs'
import { safeLog } from './runtime/redact.mjs'
import { fetchCampaignSettings, persistCampaignSettings } from './campaignSettings.mjs'
import { fetchBoostSessions, persistBoostSessions, fetchSparkAuth, persistSparkAuth } from './outOfBandCapture.mjs'

// Tanggal bisnis TERBARU yang sudah selesai = kemarin WIB, dihitung dari jam run.
export function latestBusinessDate(now = Date.now()) {
  return resolveSnapshotDate('yesterday', now)
}

// Hanya tanggal ini yang boleh distempel dengan keadaan saat ini.
export function isLatestBusinessDate(date, now = Date.now()) {
  return date === latestBusinessDate(now)
}

// Jalankan langkah 4 (setelan campaign) & 4b (sesi boost + otorisasi spark).
// Semua NON-FATAL per advertiser, persis perilaku lama. Untuk tanggal selain
// kemarin WIB: TIDAK memanggil TikTok, TIDAK menulis apa pun, hanya mencatat
// bahwa potret dilewati. → { captured, reason? }
export async function captureCurrentState({ sb, provider, workspaceId, entries, date, now = Date.now(), log = safeLog }) {
  if (!isLatestBusinessDate(date, now)) {
    log({
      event: 'CURRENT_STATE_CAPTURE_SKIPPED', workspace_id: workspaceId, snapshot_date: date,
      latest_business_date: latestBusinessDate(now), reason: 'PAST_DATE',
      message: 'Tanggal lampau: campaign_settings/boost_sessions/spark_auth TIDAK ditulis (hanya data performa) — API hanya tahu keadaan sekarang.',
    })
    return { captured: false, reason: 'PAST_DATE' }
  }

  // 4) Setting campaign (NON-FATAL) tiap advertiser.
  for (const en of entries) {
    try {
      const csRows = await fetchCampaignSettings(provider, { advertiserId: en.advertiserId, storeId: en.storeId })
      const { written } = await persistCampaignSettings(sb, { workspaceId, date, rows: csRows })
      log({ event: 'CAMPAIGN_SETTINGS_CAPTURED', workspace_id: workspaceId, advertiser_id: en.advertiserId, count: written, snapshot_date: date })
    } catch (e) { log({ event: 'CAMPAIGN_SETTINGS_FAILED', workspace_id: workspaceId, advertiser_id: en.advertiserId, level: 'warn', message: e.message }, console.error) }
  }

  // 4b) POTRET AKSI DI LUAR SELLEROS (NON-FATAL). Sesi boost & otorisasi spark
  //     yang dijalankan lewat Ads Manager/Seller Centre tak pernah masuk
  //     gmvmax_approvals. Keduanya hanya bisa dibaca sebagai keadaan SEKARANG
  //     (session_list cuma memberi sesi yang sedang berjalan), jadi tanpa potret
  //     harian ia lenyap tanpa bekas — dan loop belajar menilai boost hanya dari
  //     separuh kejadian. Panggilan sesi praktis gratis: featureRegistryFetch
  //     sudah memanggilnya tiap pagi, selama ini jawabannya dibuang.
  for (const en of entries) {
    try {
      const rows = await fetchBoostSessions(provider, { advertiserId: en.advertiserId, storeId: en.storeId })
      const { written } = await persistBoostSessions(sb, { workspaceId, date, rows })
      log({ event: 'BOOST_SESSIONS_CAPTURED', workspace_id: workspaceId, advertiser_id: en.advertiserId, count: written, snapshot_date: date })
    } catch (e) { log({ event: 'BOOST_SESSIONS_FAILED', level: 'warn', workspace_id: workspaceId, advertiser_id: en.advertiserId, message: e.message }, console.error) }
    try {
      const rows = await fetchSparkAuth(provider, { advertiserId: en.advertiserId })
      const { written } = await persistSparkAuth(sb, { workspaceId, date, rows })
      log({ event: 'SPARK_AUTH_CAPTURED', workspace_id: workspaceId, advertiser_id: en.advertiserId, count: written, snapshot_date: date })
    } catch (e) { log({ event: 'SPARK_AUTH_FAILED', level: 'warn', workspace_id: workspaceId, advertiser_id: en.advertiserId, message: e.message }, console.error) }
  }
  return { captured: true }
}
