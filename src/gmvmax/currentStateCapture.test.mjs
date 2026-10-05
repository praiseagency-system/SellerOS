// PENJAGA POTRET — campaign_settings / boost_sessions / spark_auth hanya boleh
// distempel dengan tanggal KEMARIN (WIB). Menarik ulang tanggal lampau lalu
// menulis keadaan hari ini dengan tanggal itu memalsukan riwayat setelan
// (backfill Dasfelix 18 Sep 2026: sesi boost 16–18 Sep tampil first_seen 9 Agu).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { captureCurrentState, isLatestBusinessDate, latestBusinessDate } from './currentStateCapture.mjs'

const WS = '10280d7b-2994-4a40-b639-2d88e0e2018b'
const ENTRIES = [{ advertiserId: '7313535999831769090', storeId: '7495201716088572081' }]
// Run harian: 5 Okt 2026 07:30 WIB → tanggal bisnis terbaru = 4 Okt.
const RUN_AT = Date.parse('2026-10-05T00:30:00Z')

// Provider tiruan yang MEREKAM tiap panggilan — bukti "TikTok tak disentuh".
function fakeProvider() {
  const calls = []
  return {
    calls,
    async callTool(name, params) {
      calls.push({ name, params })
      switch (name) {
        case 'gmv_max_campaign_get':
          return params.filtering.gmv_max_promotion_types[0] === 'PRODUCT_GMV_MAX'
            ? { list: [{ campaign_id: 'c1', campaign_name: 'GMV MAX | Update', operation_status: 'ENABLE' }], page_info: { total_page: 1 } }
            : { list: [], page_info: { total_page: 1 } }
        case 'campaign_gmv_max_info_get': return { budget: 350000, roas_bid: 6, operation_status: 'ENABLE', store_id: params.advertiser_id }
        case 'campaign_gmv_max_session_list_get': return { session_list: [{ session_id: 's1', bid_type: 'CREATIVE_NO_BID', budget: 50000, schedule_start_time: '2026-10-04 01:30:00' }] }
        case 'campaign_gmv_max_session_get': return { session_list: [{ session_id: 's1', item_id: 'v1' }] }
        case 'tt_video_list_get': return { list: [{ item_info: { item_id: 'v1', auth_code: 'kode' }, user_info: { tiktok_name: 'a' }, auth_info: { ad_auth_status: 'AUTHORIZED' } }], page_info: { total_page: 1 } }
        default: throw new Error(`tool tak terduga: ${name}`)
      }
    },
  }
}
// Supabase tiruan yang merekam tiap upsert per tabel.
function fakeSb() {
  const writes = []
  return { writes, from: (table) => ({ upsert: async (payload) => { writes.push({ table, payload }); return { error: null } } }) }
}
const capture = () => { const logs = []; return { logs, log: (o) => logs.push(o) } }

test('isLatestBusinessDate memakai kalender WIB, bukan UTC', () => {
  assert.equal(latestBusinessDate(RUN_AT), '2026-10-04')
  assert.equal(isLatestBusinessDate('2026-10-04', RUN_AT), true)
  assert.equal(isLatestBusinessDate('2026-10-03', RUN_AT), false)
  assert.equal(isLatestBusinessDate('2026-10-05', RUN_AT), false) // hari ini belum selesai
  // 5 Okt 01:00 WIB = 4 Okt 18:00 UTC: tanggal UTC masih 4 Okt, tapi di WIB sudah 5 Okt → kemarin = 4 Okt.
  const lateNight = Date.parse('2026-10-04T18:00:00Z')
  assert.equal(isLatestBusinessDate('2026-10-04', lateNight), true)
  assert.equal(isLatestBusinessDate('2026-10-03', lateNight), false)
  // 4 Okt 23:59 WIB = 4 Okt 16:59 UTC → kemarin = 3 Okt.
  assert.equal(isLatestBusinessDate('2026-10-03', Date.parse('2026-10-04T16:59:00Z')), true)
})

test('TANGGAL LAMPAU → potret DILEWATI: nol panggilan TikTok, nol tulisan', async () => {
  // Persis kasusnya: penambal menarik ulang 3 Okt pada run 5 Okt (atau `--date 2026-10-03` manual).
  for (const date of ['2026-10-03', '2026-09-27', '2026-08-09']) {
    const provider = fakeProvider(), sb = fakeSb(), c = capture()
    const out = await captureCurrentState({ sb, provider, workspaceId: WS, entries: ENTRIES, date, now: RUN_AT, log: c.log })
    assert.deepEqual(out, { captured: false, reason: 'PAST_DATE' })
    assert.equal(provider.calls.length, 0, `TikTok dipanggil untuk ${date}`)
    assert.equal(sb.writes.length, 0, `potret ditulis untuk ${date}`)
    assert.equal(c.logs.length, 1)
    assert.deepEqual(
      { event: c.logs[0].event, snapshot_date: c.logs[0].snapshot_date, latest_business_date: c.logs[0].latest_business_date, reason: c.logs[0].reason },
      { event: 'CURRENT_STATE_CAPTURE_SKIPPED', snapshot_date: date, latest_business_date: '2026-10-04', reason: 'PAST_DATE' },
    )
  }
})

test('hari ini / tanggal depan juga dilewati — hanya KEMARIN yang sah', async () => {
  for (const date of ['2026-10-05', '2026-10-06']) {
    const provider = fakeProvider(), sb = fakeSb(), c = capture()
    const out = await captureCurrentState({ sb, provider, workspaceId: WS, entries: ENTRIES, date, now: RUN_AT, log: c.log })
    assert.equal(out.captured, false)
    assert.equal(provider.calls.length, 0)
    assert.equal(sb.writes.length, 0)
  }
})

test('KEMARIN (run harian) → ketiga tabel potret ditulis dengan snapshot_date itu', async () => {
  const provider = fakeProvider(), sb = fakeSb(), c = capture()
  const out = await captureCurrentState({ sb, provider, workspaceId: WS, entries: ENTRIES, date: '2026-10-04', now: RUN_AT, log: c.log })
  assert.deepEqual(out, { captured: true })
  assert.deepEqual(sb.writes.map(w => w.table), ['gmvmax_campaign_settings', 'gmvmax_boost_sessions', 'gmvmax_spark_auth'])
  for (const w of sb.writes) {
    assert.equal(w.payload.length, 1)
    assert.equal(w.payload[0].snapshot_date, '2026-10-04')
    assert.equal(w.payload[0].workspace_id, WS)
  }
  assert.equal(sb.writes[0].payload[0].budget, 350000)
  assert.equal(sb.writes[1].payload[0].item_id, 'v1') // item_id dari endpoint detail tetap terbawa
  assert.deepEqual(c.logs.map(l => l.event), ['CAMPAIGN_SETTINGS_CAPTURED', 'BOOST_SESSIONS_CAPTURED', 'SPARK_AUTH_CAPTURED'])
})

test('kemarin: satu potret gagal tak menjatuhkan yang lain (NON-FATAL seperti dulu)', async () => {
  const provider = fakeProvider(), c = capture()
  const writes = []
  const sb = { from: (table) => ({ upsert: async (payload) => {
    if (table === 'gmvmax_campaign_settings') return { error: { message: 'boom' } }
    writes.push({ table, payload }); return { error: null }
  } }) }
  const out = await captureCurrentState({ sb, provider, workspaceId: WS, entries: ENTRIES, date: '2026-10-04', now: RUN_AT, log: c.log })
  assert.equal(out.captured, true)
  assert.deepEqual(writes.map(w => w.table), ['gmvmax_boost_sessions', 'gmvmax_spark_auth'])
  assert.deepEqual(c.logs.map(l => l.event), ['CAMPAIGN_SETTINGS_FAILED', 'BOOST_SESSIONS_CAPTURED', 'SPARK_AUTH_CAPTURED'])
})

// BUKTI ARSITEKTURAL (import graph, pola runtime/depgraph.test.mjs): satu-satunya
// jalan dari entrypoint commit ke penulis potret adalah lewat modul berpenjaga.
// Kalau kelak ada yang mengimpor persist* langsung ke vpsCommit.mjs (melewati
// penjaga), tes ini gagal.
test('vpsCommit.mjs hanya mencapai penulis potret LEWAT currentStateCapture.mjs', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
  const out = join(tmpdir(), `vpscommit.guard.${process.pid}.bundle.mjs`)
  const meta = join(tmpdir(), `vpscommit.guard.${process.pid}.meta.json`)
  execSync(
    `npx esbuild src/gmvmax/vpsCommit.mjs --bundle --platform=node --format=esm ` +
    `--packages=external --metafile=${meta} --outfile=${out} --log-level=error`,
    { stdio: 'pipe', cwd: root },
  )
  const inputs = JSON.parse(readFileSync(meta, 'utf8')).inputs
  rmSync(out, { force: true }); rmSync(meta, { force: true })

  const importsOf = (suffix) => {
    const key = Object.keys(inputs).find(p => p.endsWith(suffix))
    assert.ok(key, `${suffix} harus ada di graph`)
    return inputs[key].imports.map(i => i.path)
  }
  const importersOf = (suffix) => Object.keys(inputs).filter(p => inputs[p].imports.some(i => i.path.endsWith(suffix)))

  const entry = importsOf('src/gmvmax/vpsCommit.mjs')
  assert.ok(entry.some(p => p.endsWith('/currentStateCapture.mjs')), 'vpsCommit harus memakai currentStateCapture')
  assert.ok(entry.some(p => p.endsWith('/gapFill.mjs')), 'vpsCommit harus memakai gapFill')
  assert.equal(entry.some(p => p.endsWith('/campaignSettings.mjs')), false, 'vpsCommit mengimpor campaignSettings langsung (melewati penjaga)')
  assert.equal(entry.some(p => p.endsWith('/outOfBandCapture.mjs')), false, 'vpsCommit mengimpor outOfBandCapture langsung (melewati penjaga)')
  assert.deepEqual(importersOf('/outOfBandCapture.mjs').map(p => p.split('/').pop()), ['currentStateCapture.mjs'])
  // gapFill sendiri tak boleh punya jalan ke penulis potret
  const gap = importsOf('src/gmvmax/gapFill.mjs')
  assert.equal(gap.some(p => /campaignSettings|outOfBandCapture|currentStateCapture/.test(p)), false)
})
