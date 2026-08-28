// GMV Max — STEP 9 resume backfill orchestrator (OLD workflow, source of truth).
// Menjalankan sisa tanggal di logs/gmvmax-backfill.resume.json satu per satu via
// runbook LLM lama (claude -p), lalu MEMVERIFIKASI snapshot benar mendarat di DB
// sebelum menandai selesai. Idempoten (delete-first di writer). Berhenti bila satu
// tanggal gagal (jangan lanjut buta). TIDAK mengubah OLD workflow, tanpa cutover.
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const PROJ = '/Users/macbook/claude'
const REPO = `${PROJ}/tools/shopee-quadrant`
const RESUME = `${REPO}/logs/gmvmax-backfill.resume.json`
const RUNBOOK = `${REPO}/scripts/gmvmax-sync-runbook.md`
const CLAUDE = '/Users/macbook/.local/bin/claude'
const WS = '10280d7b-2994-4a40-b639-2d88e0e2018b' // Asterixsty (target backfill, konstanta runbook)

function parseEnv(p) { const o = {}; for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '') } return o }
const local = parseEnv(`${REPO}/.env.local`), sync = parseEnv(`${REPO}/.env.sync.local`)
const sb = createClient(local.VITE_SUPABASE_URL, sync.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a)

async function snapshotState(date) {
  const { data: imps, error } = await sb.from('gmvmax_imports').select('id').eq('workspace_id', WS).eq('snapshot_date', date)
  if (error) throw new Error('read imports: ' + error.message)
  if (imps.length !== 1) return { importCount: imps.length, creatives: 0 }
  const { count } = await sb.from('gmvmax_creatives').select('id', { count: 'exact', head: true }).eq('import_id', imps[0].id)
  return { importCount: imps.length, creatives: count ?? 0 }
}

async function main() {
  const runbook = readFileSync(RUNBOOK, 'utf8')
  let state = JSON.parse(readFileSync(RESUME, 'utf8'))
  const remaining = [...state.remaining]
  log(`RESUME BACKFILL — ${remaining.length} tanggal tersisa:`, remaining.join(', '))

  for (const date of remaining) {
    log(`── ${date} START (claude -p runbook) ──`)
    const t0 = Date.now()
    const r = spawnSync(CLAUDE, ['-p', runbook, '--dangerously-skip-permissions'], {
      cwd: PROJ, env: { ...process.env, GMVMAX_SYNC_DATE: date },
      stdio: ['ignore', 'inherit', 'inherit'], timeout: 20 * 60 * 1000,
    })
    const dt = ((Date.now() - t0) / 1000).toFixed(0)
    if (r.status !== 0) { log(`✗ ${date} runbook exit=${r.status} (${dt}s) — STOP. Tersisa: ${state.remaining.join(', ')}`); process.exit(1) }

    const st = await snapshotState(date)
    if (st.importCount !== 1) { log(`✗ ${date} VERIFIKASI GAGAL: importCount=${st.importCount} (harus 1) — STOP.`); process.exit(1) }
    log(`✓ ${date} OK (${dt}s) — 1 import / ${st.creatives} creatives`)

    // pindah remaining → done, persist atomik-ish (tulis file utuh)
    state.done = [date, ...state.done]
    state.remaining = state.remaining.filter(d => d !== date)
    state.last_resumed_at = new Date().toISOString()
    writeFileSync(RESUME, JSON.stringify(state, null, 2))
  }

  log(`SELESAI — semua tanggal ter-backfill. done=${state.done.length}, remaining=${state.remaining.length}`)
}

main().catch(e => { log('FATAL:', e.message); process.exit(2) })
