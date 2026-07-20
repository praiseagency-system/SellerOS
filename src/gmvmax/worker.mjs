// gmvmax shadow worker — CLI DETERMINISTIK (tanpa LLM), SHADOW-ONLY.
// NEW dihitung & disimpan TERPISAH (logs/shadow/) + dibandingkan ke OLD (Supabase,
// read-only). TIDAK menulis tabel produksi. Tak ada cutover, tak ada --commit.
//
// Perintah (ikuti konvensi repo: jalankan via scripts/gmvmax-shadow.sh yang mem-bundle):
//   --mode shadow --date 2026-07-08
//   --mode shadow --from 2026-07-01 --to 2026-07-08
//   --mode shadow --advertiser <id> --date 2026-07-08
//   --mode shadow --all-advertisers --from 2026-07-01 --to 2026-07-08
//
// TZ: date dihitung di TZ AKUN (Asia/Jakarta UTC+7), bukan TZ mesin.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { TikTokMcpProvider, AUTH_STATES } from './providers/tiktokMcp.mjs'
import { runSync } from './engine.mjs'
import { buildRunReport, logRunReport, makeRunId } from './reporter.mjs'
import { loadOldSnapshot, compareParity } from './parity.mjs'
import { STATUS, batchStatus, exitCodeFor } from './runStatus.mjs'
import { acquireLock, releaseLock } from './lock.mjs'
import { persistRun, persistBatchSummary } from './shadowStore.mjs'
import { eligibleAdvertisers, findAdvertiser } from './advertisers.mjs'

const ACCOUNT_TZ_OFFSET_MIN = 7 * 60 // Asia/Jakarta, tanpa DST
const DEFAULT_ADVERTISER = '7313535999831769090'

function accountDate(offsetDays = 0) { const d = new Date(Date.now() + ACCOUNT_TZ_OFFSET_MIN * 60000); d.setUTCDate(d.getUTCDate() + offsetDays); return d.toISOString().slice(0, 10) }
function resolveDate(v) { if (!v || v === 'yesterday') return accountDate(-1); if (v === 'today') return accountDate(0); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`--date invalid: ${v}`); return v }
function eachDay(from, to) { const o = []; let d = new Date(`${from}T00:00:00Z`); const e = new Date(`${to}T00:00:00Z`); while (d <= e) { o.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000) } return o }
function parseArgs(a) { const r = {}; for (let i = 0; i < a.length; i++) { const t = a[i]; if (t.startsWith('--')) { const k = t.slice(2), n = a[i + 1]; if (!n || n.startsWith('--')) r[k] = true; else { r[k] = n; i++ } } } return r }
function parseEnv(p) { return Object.fromEntries(readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })) }

async function runUnit(provider, sb, adv, date) {
  const runId = makeRunId()
  const startedAt = new Date().toISOString()
  const base = { run_id: runId, advertiser_id: adv.advertiserId, store_id: adv.storeId, workspace_id: adv.workspaceId, snapshot_date: date, mode: 'shadow', started_at: startedAt }

  const lock = acquireLock(adv.advertiserId, date)
  if (!lock.ok) {
    const rec = { ...base, status: 'LOCKED', finished_at: new Date().toISOString(), lock_holder: lock.holder, note: 'run konkuren untuk advertiser/date ini sedang berjalan — dilewati' }
    persistRun(rec); console.log(`[shadow] ${adv.advertiserId} ${date} → LOCKED (skip)`)
    return { status: 'LOCKED', runId }
  }
  try {
    let result, report, parity = null, status
    try {
      result = await runSync(provider, { advertiserId: adv.advertiserId, storeId: adv.storeId, date })
      report = buildRunReport({ runId, result, status: 'success', authState: provider.auth().state })
      status = STATUS.SUCCESS
      const old = await loadOldSnapshot(sb, adv.workspaceId, date)
      if (old) {
        const p = compareParity(old.rows, result.rows)
        parity = { status: p.status, aggregate: p.aggregate, rowLevel: p.rowLevel, old_import_id: old.import.id, old_created_at: old.import.created_at }
      } else {
        parity = { status: 'NO_OLD_BASELINE' }
      }
    } catch (e) {
      status = e.code === 'AUTH_EXPIRED' ? STATUS.AUTH_REQUIRED : STATUS.FAILED
      report = buildRunReport({ runId, result: null, status: 'failed', authState: provider.auth().state, error: e })
    }
    const rec = { ...base, status, finished_at: new Date().toISOString(), report, parity, new_output: result ? { totals: result.totals, rows: result.rows } : null }
    persistRun(rec)
    logRunReport(report)
    if (parity) console.log(`[shadow] ${adv.advertiserId} ${date} → run=${status} parity=${parity.status}`)
    return { status, runId, parity }
  } finally {
    releaseLock(lock.path)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.mode !== 'shadow') throw new Error("Hanya --mode shadow yang diizinkan (tak ada cutover/commit).")

  const advertisers = args['all-advertisers'] ? eligibleAdvertisers() : [findAdvertiser(args.advertiser || DEFAULT_ADVERTISER)]
  const dates = args.from && args.to ? eachDay(resolveDate(args.from), resolveDate(args.to)) : [resolveDate(args.date)]

  const provider = new TikTokMcpProvider()
  const auth = provider.auth()
  if (auth.state === AUTH_STATES.EXPIRED || auth.state === AUTH_STATES.REFRESH) {
    const s = { status: STATUS.AUTH_REQUIRED, auth: auth.state, message: 'Token MCP kedaluwarsa — jalankan /mcp Authenticate (atau set GMVMAX_MCP_TOKEN valid).' }
    persistBatchSummary(s); console.error('[shadow] AUTH_REQUIRED —', s.message); process.exit(exitCodeFor(STATUS.AUTH_REQUIRED))
  }

  const local = parseEnv('.env.local'); const sync = parseEnv('.env.sync.local')
  const sb = createClient(local.VITE_SUPABASE_URL, sync.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

  const units = []
  for (const adv of advertisers) for (const date of dates) units.push({ adv, date })

  const results = []
  for (const u of units) results.push(await runUnit(provider, sb, u.adv, u.date))

  const batch = batchStatus(results.map(r => r.status))
  const parityCounts = results.reduce((c, r) => { const p = r.parity?.status; if (p === 'MATCH') c.match++; else if (p === 'MISMATCH') c.mismatch++; else if (p === 'NO_OLD_BASELINE') c.noOld++; return c }, { match: 0, mismatch: 0, noOld: 0 })
  const summary = {
    mode: 'shadow', batch_status: batch, auth_state: auth.state,
    advertisers: advertisers.map(a => a.advertiserId), dates: dates,
    units: units.length,
    unit_status_counts: results.reduce((c, r) => { c[r.status] = (c[r.status] || 0) + 1; return c }, {}),
    parity_counts: parityCounts,
    mismatches: results.filter(r => r.parity?.status === 'MISMATCH').map(r => r.runId),
    finished_at: new Date().toISOString(),
  }
  persistBatchSummary(summary)
  console.log('\n[shadow summary]', JSON.stringify(summary, null, 2))
  // PARTIAL TIDAK PERNAH dianggap SUCCESS → exit non-zero.
  process.exit(exitCodeFor(batch))
}

main().catch(e => { console.error('[shadow] FATAL', e.code || '', e.message); process.exit(1) })
