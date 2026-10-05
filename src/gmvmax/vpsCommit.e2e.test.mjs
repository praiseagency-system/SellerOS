// UJI UJUNG-KE-UJUNG worker commit: menjalankan src/gmvmax/vpsCommit.mjs ASLI
// sebagai proses anak, dengan seluruh dunia luarnya (Supabase REST, token
// endpoint TikTok, MCP layer) diganti backend tiruan dalam proses
// (__fixtures__/vpsCommitE2ePreload.mjs). Tak menyentuh jaringan maupun produksi.
//
// Yang dibuktikan di sini adalah PENGKABELAN yang tak terjangkau tes unit
// (vpsCommit.mjs memanggil main()+process.exit saat diimpor): retry refresh
// token → penjaga potret → penambal hari bolong → kode keluar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { dateMinusDays } from './runtime/jakartaDate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENTRY = join(HERE, 'vpsCommit.mjs')
const PRELOAD = pathToFileURL(join(HERE, '__fixtures__/vpsCommitE2ePreload.mjs')).href
const ASTERIX = '10280d7b-2994-4a40-b639-2d88e0e2018b'
const DASFELIX = 'c420074f-d4a6-4e6d-bf8e-2d0234b575d7'
const ASTERIX_ADV = '7313535999831769090'
const POTRET = ['gmvmax_campaign_settings', 'gmvmax_boost_sessions', 'gmvmax_spark_auth']

// Env BERSIH (tak mewarisi GMVMAX_* dari shell pengembang) + URL Supabase yang
// tak mungkin ter-resolve: kalau backend tiruan bocor, permintaan gagal, bukan nyasar ke produksi.
function runCommit(args, scenario = {}, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gmvmax-e2e-'))
  try {
    const r = spawnSync(process.execPath, ['--import', PRELOAD, ENTRY, ...args], {
      encoding: 'utf8', timeout: 60_000,
      env: {
        PATH: process.env.PATH, TZ: 'UTC',
        GMVMAX_RUNTIME: 'vps', GMVMAX_COMMIT: '1', GMVMAX_VERSIONED_WRITER: '1',
        GMVMAX_SUPABASE_URL: 'https://e2e.supabase.invalid', GMVMAX_SUPABASE_KEY: 'e2e-bukan-kunci-sungguhan',
        GMVMAX_SHADOW_DIR: dir, E2E_SCENARIO: JSON.stringify(scenario), ...env,
      },
    })
    const lines = `${r.stdout}\n${r.stderr}`.split('\n').filter(Boolean)
    const recLine = lines.find(l => l.startsWith('E2E_RECORD '))
    assert.ok(recLine, `proses anak tak mencetak E2E_RECORD.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    const record = JSON.parse(recLine.slice('E2E_RECORD '.length))
    const events = lines.filter(l => l.startsWith('{')).map(l => JSON.parse(l))
    assert.deepEqual(record.unexpected, [], 'ada permintaan yang tak dikenal backend tiruan')
    return { status: r.status, events, record, ev: (name) => events.filter(e => e.event === name) }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
const potretFor = (record, ws) => record.potret.filter(p => p.ws === ws)
const rpcKeys = (record) => record.rpc.map(r => `${r.ws.slice(0, 4)}:${r.date}`)

test('E2E insiden 3 Okt: refresh `fetch failed` sekali → pulih; lubang H-1 ditambal TANPA potret; exit 0', () => {
  // Asterixsty: POST refresh pertama putus jaringan; snapshot (kemarin − 1) bolong.
  const { status, ev, record } = runCommit(['--date', 'yesterday'], { missing: { [ASTERIX]: [1] }, tokenScript: { [ASTERIX]: ['net'] } })
  const L = record.latest, hole = dateMinusDays(L, 1)

  // A) retry: 2 POST utk Asterixsty (gagal → sukses) dgn refresh token yang SAMA; Dasfelix 1 POST.
  const posts = record.tokenPosts.filter(p => p.ws === ASTERIX)
  assert.deepEqual(posts.map(p => p.outcome), ['net', 'ok'])
  assert.equal(posts[0].rt, posts[1].rt)
  assert.equal(record.tokenPosts.filter(p => p.ws === DASFELIX).length, 1)
  assert.deepEqual(record.sleeps.filter(ms => ms === 2000), [2000])
  const att = ev('TOKEN_REFRESH_ATTEMPT_FAILED')
  assert.equal(att.length, 1)
  assert.deepEqual(
    { ws: att[0].workspace_id, step: att[0].step, attempt: att[0].attempt, max: att[0].max_attempts, transient: att[0].transient, retry: att[0].will_retry, wait: att[0].retry_in_ms, code: att[0].code },
    { ws: ASTERIX, step: 'oauth_post', attempt: 1, max: 4, transient: true, retry: true, wait: 2000, code: 'ECONNRESET' },
  )
  assert.equal(ev('TOKEN_REFRESH_RECOVERED').length, 1)
  assert.equal(ev('TOKEN_SOURCE_FAILED').length, 0)
  // token baru tersimpan sekali per workspace; penambal memakai token itu (tak refresh lagi)
  assert.deepEqual(record.patches.sort(), [ASTERIX, DASFELIX].sort())

  // Run utama: kedua workspace menulis kemarin + potretnya (Dasfelix 2 advertiser → 2× tiap tabel).
  assert.deepEqual(ev('COMMIT_BATCH_SUMMARY').map(e => [e.total, e.ok, e.failed]), [[2, 2, 0]])
  assert.deepEqual(potretFor(record, ASTERIX).map(p => p.table), POTRET)
  assert.equal(potretFor(record, DASFELIX).length, 6)

  // B) penambal: hanya (Asterixsty, H-1) yang ditarik ulang — data performa saja.
  assert.deepEqual(rpcKeys(record).sort(), [`1028:${L}`, `c420:${L}`, `1028:${hole}`].sort())
  assert.deepEqual(ev('GAP_SCAN').map(e => [e.workspace_id, e.missing]), [[ASTERIX, [hole]], [DASFELIX, []]])
  assert.deepEqual(ev('GAP_FILL_RESULT').map(e => [e.workspace_id, e.snapshot_date, e.ok, e.written]), [[ASTERIX, hole, true, true]])
  // PENJAGA: tak satu pun baris potret ber-tanggal selain kemarin.
  for (const p of record.potret) assert.deepEqual(p.dates, [L], `${p.table} distempel ${p.dates}`)
  assert.deepEqual(ev('CURRENT_STATE_CAPTURE_SKIPPED').map(e => [e.workspace_id, e.snapshot_date, e.reason]), [[ASTERIX, hole, 'PAST_DATE']])
  const sum = ev('RUN_SUMMARY')
  assert.deepEqual(sum.map(e => [e.snapshot_date, e.mode, e.current_state_captured]).sort(), [[L, 'commit', true], [L, 'commit', true], [hole, 'commit-gapfill', false]].sort())

  // audit + kode keluar
  assert.deepEqual(record.syncRuns.map(s => `${s.ws.slice(0, 4)}:${s.date}:${s.mode}:${s.status}`).sort(),
    [`1028:${L}:commit:SUCCESS`, `c420:${L}:commit:SUCCESS`, `1028:${hole}:commit-gapfill:SUCCESS`].sort())
  assert.deepEqual(ev('GAP_FILL_SUMMARY').map(e => [e.filled.length, e.failed.length, e.deferred.length]), [[1, 0, 0]])
  assert.equal(status, 0)
})

test('E2E backfill manual `--date <lampau> --advertiser`: performa ditulis, potret NOL, penambal diam', () => {
  const guess = dateMinusDays(new Date().toISOString().slice(0, 10), 5) // pasti lampau di zona mana pun
  // GMVMAX_REFRESH_REGISTRY=1 seperti di produksi: refresh registry (langkah 7)
  // juga keadaan-terkini → ikut dilewati. Kalau tidak, panggilannya akan
  // tercatat sebagai permintaan tak dikenal dan runCommit menggagalkan tes.
  const { status, ev, record } = runCommit(['--date', guess, '--advertiser', ASTERIX_ADV], {}, { GMVMAX_REFRESH_REGISTRY: '1' })
  assert.deepEqual(rpcKeys(record), [`1028:${guess}`])
  assert.deepEqual(record.potret, [])
  assert.deepEqual(Object.keys(record.mcpTools), ['gmv_max_report_get']) // hanya laporan performa
  assert.equal(ev('FEATURE_REGISTRY_REFRESHED').length + ev('FEATURE_REGISTRY_FAILED').length, 0)
  assert.equal(record.mcpTools.campaign_gmv_max_info_get, undefined) // TikTok tak ditanya keadaan-terkini sama sekali
  assert.equal(record.mcpTools.tt_video_list_get, undefined)
  assert.deepEqual(ev('CURRENT_STATE_CAPTURE_SKIPPED').map(e => e.snapshot_date), [guess])
  assert.deepEqual(ev('GAP_FILL_OFF').map(e => e.reason), ['SINGLE_ADVERTISER'])
  assert.equal(ev('GAP_SCAN').length, 0)
  assert.deepEqual(record.syncRuns.map(s => `${s.date}:${s.mode}:${s.status}`), [`${guess}:commit:SUCCESS`])
  assert.equal(status, 0)
})

test('E2E `--date <lampau>` semua tenant: potret NOL, penambal diam (EXPLICIT_DATE)', () => {
  const guess = dateMinusDays(new Date().toISOString().slice(0, 10), 5)
  const { status, ev, record } = runCommit(['--date', guess], { missing: { [ASTERIX]: [1, 2] } })
  assert.deepEqual(rpcKeys(record).sort(), [`1028:${guess}`, `c420:${guess}`].sort())
  assert.deepEqual(record.potret, [])
  assert.deepEqual(ev('GAP_FILL_OFF').map(e => e.reason), ['EXPLICIT_DATE'])
  assert.equal(status, 0)
})

test('E2E invalid_grant: SATU POST saja (tak di-retry, tak diulang penambal); workspace lain jalan; exit 2', () => {
  const { status, ev, record } = runCommit([], { missing: { [ASTERIX]: [2] }, tokenScript: { [ASTERIX]: ['invalid_grant', 'invalid_grant', 'invalid_grant'] } })
  const L = record.latest
  assert.deepEqual(record.tokenPosts.filter(p => p.ws === ASTERIX).map(p => p.outcome), ['invalid_grant'])
  assert.deepEqual(record.sleeps.filter(ms => [2000, 5000, 15000].includes(ms)), [])
  assert.deepEqual(ev('TOKEN_SOURCE_FAILED').map(e => [e.workspace_id, e.transient, e.attempts]), [[ASTERIX, false, 1]])
  assert.deepEqual(ev('GAP_FILL_SKIPPED').map(e => [e.workspace_id, e.reason]), [[ASTERIX, 'AUTH_NOT_USABLE']])
  assert.deepEqual(rpcKeys(record), [`c420:${L}`]) // Dasfelix tetap tertulis (isolasi)
  assert.deepEqual(potretFor(record, ASTERIX), [])
  assert.deepEqual(record.syncRuns.map(s => `${s.ws.slice(0, 4)}:${s.status}`).sort(), ['1028:TOKEN_FAILED', 'c420:SUCCESS'])
  assert.match(record.syncRuns.find(s => s.ws === ASTERIX).error, /^TOKEN_SOURCE_FAILED: refresh token expired$/)
  assert.equal(status, 2)
})

test('E2E jaringan mati selama run utama (4 percobaan) → penambal mencoba kemarin sekali lagi, DENGAN potret; exit 0', () => {
  const { status, ev, record } = runCommit([], { tokenScript: { [ASTERIX]: ['net', 'net', 'net', 'net'] } })
  const L = record.latest
  assert.deepEqual(record.tokenPosts.filter(p => p.ws === ASTERIX).map(p => p.outcome), ['net', 'net', 'net', 'net', 'ok'])
  assert.deepEqual(record.sleeps.filter(ms => [2000, 5000, 15000].includes(ms)), [2000, 5000, 15000])
  assert.deepEqual(ev('TOKEN_REFRESH_ATTEMPT_FAILED').map(e => [e.attempt, e.will_retry]), [[1, true], [2, true], [3, true], [4, false]])
  assert.deepEqual(ev('TOKEN_SOURCE_FAILED').map(e => [e.transient, e.attempts]), [[true, 4]])
  assert.deepEqual(ev('COMMIT_BATCH_SUMMARY').map(e => [e.ok, e.failed]), [[1, 1]])
  // penambal: kemarin masih bolong utk Asterixsty → ditarik; karena tanggalnya = kemarin, potret SAH ditulis
  assert.deepEqual(ev('GAP_SCAN').find(e => e.workspace_id === ASTERIX).missing, [L])
  assert.deepEqual(rpcKeys(record).sort(), [`1028:${L}`, `c420:${L}`].sort())
  assert.deepEqual(potretFor(record, ASTERIX).map(p => [p.table, p.dates]), POTRET.map(t => [t, [L]]))
  assert.deepEqual(ev('GAP_FILL_SUMMARY')[0].recovered_workspaces, [ASTERIX])
  assert.deepEqual(record.syncRuns.filter(s => s.ws === ASTERIX).map(s => `${s.mode}:${s.status}`), ['commit:TOKEN_FAILED', 'commit-gapfill:SUCCESS'])
  assert.match(record.syncRuns.find(s => s.status === 'TOKEN_FAILED').error, /fetch failed \(menyerah setelah 4 percobaan\)$/)
  assert.equal(status, 0)
})

test('E2E --dry-run: lubang dilaporkan sebagai rencana, tak ada yang ditulis', () => {
  const { status, ev, record } = runCommit(['--dry-run'], { missing: { [ASTERIX]: [1, 4] } })
  const L = record.latest
  assert.deepEqual(record.rpc, [])
  assert.deepEqual(record.potret, [])
  assert.deepEqual(record.syncRuns, [])
  assert.deepEqual(ev('GAP_SCAN').find(e => e.workspace_id === ASTERIX).missing, [dateMinusDays(L, 4), dateMinusDays(L, 1)])
  assert.equal(ev('GAP_FILL_SUMMARY')[0].planned.length, 2)
  assert.equal(ev('GAP_FILL_RESULT').length, 0)
  assert.equal(status, 0)
})

test('E2E GMVMAX_GAP_FILL_DAYS=0 / --no-gap-fill: penambal mati, run utama tak berubah', () => {
  const off = runCommit([], { missing: { [ASTERIX]: [1] } }, { GMVMAX_GAP_FILL_DAYS: '0' })
  assert.deepEqual(off.ev('GAP_FILL_OFF').map(e => e.reason), ['DISABLED'])
  assert.deepEqual(rpcKeys(off.record).sort(), [`1028:${off.record.latest}`, `c420:${off.record.latest}`].sort())
  assert.equal(off.status, 0)
  const flag = runCommit(['--no-gap-fill'], { missing: { [ASTERIX]: [1] } })
  assert.deepEqual(flag.ev('GAP_FILL_OFF').map(e => e.reason), ['FLAG'])
  assert.equal(flag.record.rpc.length, 2)
  assert.equal(flag.status, 0)
})

test('E2E penambal gagal menutup lubang → exit 2 (lubang tak boleh diam)', () => {
  // GMVMAX_MAX_PAGES_PER_REQUEST tak sah menjatuhkan engine pada SETIAP tarikan
  // (INVALID_MAX_PAGES) — cara termurah memicu COMMIT_FAILED tanpa backend khusus.
  const { status, ev, record } = runCommit([], { missing: { [ASTERIX]: [1, 3] } }, { GMVMAX_MAX_PAGES_PER_REQUEST: 'x' })
  assert.deepEqual(ev('COMMIT_BATCH_SUMMARY').map(e => [e.ok, e.failed]), [[0, 2]])
  // kemarin dicoba sekali lagi per workspace; gagal lagi → pemutus arus, lubang lama ditunda
  assert.equal(ev('GAP_FILL_RESULT').length, 2)
  assert.deepEqual(ev('GAP_FILL_SUMMARY')[0].deferred.map(d => d.reason), ['CIRCUIT_OPEN', 'CIRCUIT_OPEN'])
  assert.deepEqual(record.rpc, [])
  assert.equal(status, 2)
})
