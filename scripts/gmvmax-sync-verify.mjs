// OLD daily-sync post-write verification. Sukses HANYA bila snapshot target BENAR
// ditulis oleh run ini. Cek: import ada; error query ditangani (bukan dianggap 0);
// created_at >= run start (bukan sisa lama = silent miss); creatives > 0 (kecuali
// GMVMAX_ALLOW_ZERO=1); totals.cost & totals.revenue ada (skema writer). Indikator
// snapshot API (name "(API)" / source_filename null) disertakan.
// CATATAN: penanda "rekonsiliasi 100%" HANYA ada di LOG runbook, TIDAK di DB → tidak
// diklaim/di-fake di sini; yang diverifikasi = kehadiran totals (cost+revenue).
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const REPO = '/Users/macbook/claude/tools/shopee-quadrant'
const WS = '10280d7b-2994-4a40-b639-2d88e0e2018b' // Asterixsty (konstanta runbook)
const pe = (p) => { const o = {}; for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '') } return o }
const emit = (o) => process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...o }) + '\n')

const date = process.argv[2], runStart = Number(process.argv[3] || 0)
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) { emit({ event: 'VERIFY', state: 'BAD_ARGS', date }); process.exit(2) }
const L = pe(`${REPO}/.env.local`), S = pe(`${REPO}/.env.sync.local`)
const sb = createClient(L.VITE_SUPABASE_URL, S.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const allowZero = process.env.GMVMAX_ALLOW_ZERO === '1'

const { data: imp, error: impErr } = await sb.from('gmvmax_imports')
  .select('id,name,source_filename,created_at,totals').eq('workspace_id', WS).eq('snapshot_date', date).maybeSingle()
if (impErr) { emit({ event: 'VERIFY', state: 'DB_ERROR', stage: 'import', date, message: impErr.message }); process.exit(9) }
if (!imp)   { emit({ event: 'VERIFY', state: 'NO_IMPORT', date }); process.exit(5) }

const { count, error: countErr } = await sb.from('gmvmax_creatives')
  .select('id', { count: 'exact', head: true }).eq('import_id', imp.id)
if (countErr) { emit({ event: 'VERIFY', state: 'DB_ERROR', stage: 'count', date, import_id: imp.id, message: countErr.message }); process.exit(9) }

const createdMs = Date.parse(imp.created_at)
const fresh = runStart > 0 ? createdMs >= runStart : true
const t = imp.totals || {}
const totalsOk = (t.cost != null) && (t.revenue != null) // skema: totals={cost,revenue,orders,roas}
const apiSnapshot = /\(API\)/.test(imp.name || '') || imp.source_filename == null
const base = { event: 'VERIFY', date, import_id: imp.id, creatives: count, created_at: imp.created_at,
  run_start: runStart ? new Date(runStart).toISOString() : null, totals_present: totalsOk, api_snapshot: apiSnapshot, name: imp.name }

if (!fresh)                    { emit({ ...base, state: 'STALE_SNAPSHOT' }); process.exit(6) } // run tak menulis ulang
if ((count ?? 0) <= 0 && !allowZero) { emit({ ...base, state: 'ZERO_CREATIVES' }); process.exit(7) }
if (!totalsOk)                 { emit({ ...base, state: 'NO_TOTALS' }); process.exit(8) }
emit({ ...base, state: 'OK' })
process.exit(0)
