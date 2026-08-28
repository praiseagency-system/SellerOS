// GMV Max — Production Safety Hardening PROOF harness (STEP 5–8).
// Membuktikan properti P0/P1 migrasi 0017 (gmvmax_replace_snapshot + constraints)
// LANGSUNG terhadap DB Supabase via service_role, TANPA menyentuh data nyata:
// semua tulis diarahkan ke partisi SENTINEL_DATE='1990-01-01' pada satu workspace
// nyata. RPC di-scope per (workspace_id, snapshot_date) → DELETE/INSERT mustahil
// menyentuh tanggal lain. Cleanup = hapus partisi. Tidak ada cutover, tidak
// menyentuh OLD workflow, tidak mengubah data produksi.
//
// Jalankan: node scripts/gmvmax-hardening-proof.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const SENTINEL_DATE = '1990-01-01'
const RPC = 'gmvmax_replace_snapshot'

function parseEnv(path) {
  const out = {}
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
  return out
}

const local = parseEnv('.env.local')
const sync = parseEnv('.env.sync.local')
const url = local.VITE_SUPABASE_URL
const key = sync.SUPABASE_SECRET_KEY
if (!url || !key) { console.error('FATAL: kredensial Supabase tak lengkap'); process.exit(2) }
const sb = createClient(url, key, { auth: { persistSession: false } })

// ── helper ──────────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0
const results = []
function check(name, ok, detail = '') {
  if (ok) { PASS++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`) }
  else { FAIL++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
  results.push({ name, ok, detail })
}

async function callReplace({ workspaceId, date = SENTINEL_DATE, creatives, allowEmpty = false, importOverride }) {
  const importPayload = importOverride ?? {
    name: 'SENTINEL', period_month: SENTINEL_DATE, start_date: date, end_date: date,
    currency: 'IDR', source_filename: null, totals: { cost: 0, revenue: 0 }, settings: null,
  }
  return sb.rpc(RPC, {
    p_workspace_id: workspaceId, p_snapshot_date: date, p_import: importPayload,
    p_creatives: creatives, p_allow_empty: allowEmpty,
  })
}

function mkCreative(i, over = {}) {
  return {
    campaign_id: 'SENTC1', campaign_name: 'Sentinel Camp', product_id: 'SPU' + i, video_id: 'VID' + i,
    creative_type: 'VIDEO', video_title: 't' + i, tiktok_account: 'acc', time_posted: null,
    status: 'ACTIVE', auth_type: 'AUTH', cost: '10', sku_orders: '1', cost_per_order: '10',
    gross_revenue: '100', roas: '10', impressions: '1000', clicks: '10', ctr: '1', cvr: '10',
    vr_2s: '1', vr_6s: '1', vr_25: '1', vr_50: '1', vr_75: '1', vr_100: '1', hook_tag: null,
    ...over,
  }
}

// partisi state
async function partition(workspaceId) {
  const { data: imports, error: e1 } = await sb.from('gmvmax_imports')
    .select('id').eq('workspace_id', workspaceId).eq('snapshot_date', SENTINEL_DATE)
  if (e1) throw new Error('read imports: ' + e1.message)
  let creatives = 0, importId = null
  if (imports.length === 1) {
    importId = imports[0].id
    const { count, error: e2 } = await sb.from('gmvmax_creatives')
      .select('id', { count: 'exact', head: true }).eq('import_id', importId)
    if (e2) throw new Error('read creatives: ' + e2.message)
    creatives = count
  }
  return { importCount: imports.length, importId, creatives }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  GMV Max Hardening PROOF — STEP 5–8 (partisi sentinel 1990)    ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  // pilih workspace nyata (yang sudah punya import) sebagai host FK-valid
  const { data: anyImport, error: ePick } = await sb.from('gmvmax_imports')
    .select('workspace_id').limit(1)
  if (ePick) { console.error('FATAL pilih workspace:', ePick.message); process.exit(2) }
  if (!anyImport?.length) { console.error('FATAL: tak ada workspace dgn gmvmax_imports'); process.exit(2) }
  const WS = anyImport[0].workspace_id
  console.log(`\nHost workspace (FK-valid): ${WS}\nSentinel partition date : ${SENTINEL_DATE}\n`)

  // PRECONDITION: partisi sentinel HARUS kosong (jangan sentuh data nyata)
  const pre = await partition(WS)
  if (pre.importCount !== 0) {
    console.error(`FATAL PRECONDITION: partisi sentinel TIDAK kosong (imports=${pre.importCount}). Abort demi keamanan.`)
    process.exit(3)
  }
  console.log('Precondition OK: partisi sentinel kosong.\n')

  // ══ STEP 5 — P0 ATOMICITY ══════════════════════════════════════════════════
  console.log('── STEP 5 · P0 ATOMICITY (rollback tak boleh sisakan state parsial) ──')
  // 5a seed snapshot valid (3 baris)
  const seed = [mkCreative(1), mkCreative(2), mkCreative(3)]
  const r5a = await callReplace({ workspaceId: WS, creatives: seed })
  check('5a seed valid → sukses', !r5a.error, r5a.error?.message || `importId=${r5a.data}`)
  const seededId = r5a.data
  const p5a = await partition(WS)
  check('5a partisi = 1 import / 3 creatives', p5a.importCount === 1 && p5a.creatives === 3, `imports=${p5a.importCount} creatives=${p5a.creatives}`)

  // 5b replace yang LOLOS validasi pre-DELETE tapi GAGAL saat cast INSERT
  //     (cost non-numerik). DELETE sudah "terjadi" lalu txn ROLLBACK → snapshot lama utuh.
  const bad = [mkCreative(9, { cost: 'BUKAN_ANGKA' })]
  const r5b = await callReplace({ workspaceId: WS, creatives: bad })
  check('5b replace cacat (cast) → RPC error', !!r5b.error, r5b.error?.message?.slice(0, 60))
  const p5b = await partition(WS)
  check('5b ATOMIK: snapshot lama UTUH (importId sama, 3 creatives)',
    p5b.importCount === 1 && p5b.importId === seededId && p5b.creatives === 3,
    `imports=${p5b.importCount} sameId=${p5b.importId === seededId} creatives=${p5b.creatives}`)

  // ══ STEP 6 — P1 IDEMPOTENCY / GUARDS / CONCURRENCY ═════════════════════════
  console.log('\n── STEP 6 · P1 IDEMPOTENCY + GUARDS + CONCURRENCY ──')
  // 6a idempotensi: 2× payload identik → end-state 1 import / 3 creatives
  await callReplace({ workspaceId: WS, creatives: seed })
  await callReplace({ workspaceId: WS, creatives: seed })
  const p6a = await partition(WS)
  check('6a idempoten: end-state 1 import / 3 creatives', p6a.importCount === 1 && p6a.creatives === 3, `imports=${p6a.importCount} creatives=${p6a.creatives}`)

  // 6b guard empty tanpa allow_empty → tolak, partisi TAK berubah
  const r6b = await callReplace({ workspaceId: WS, creatives: [] })
  check('6b []+!allow_empty → GMVMAX_EMPTY_PAYLOAD_NOT_ALLOWED', /EMPTY_PAYLOAD_NOT_ALLOWED/.test(r6b.error?.message || ''), r6b.error?.message)
  const p6b = await partition(WS)
  check('6b partisi TAK terhapus (3 creatives)', p6b.creatives === 3, `creatives=${p6b.creatives}`)

  // 6c empty + allow_empty=true → sukses, 0 creatives (zero-data sah)
  const r6c = await callReplace({ workspaceId: WS, creatives: [], allowEmpty: true })
  check('6c []+allow_empty → sukses', !r6c.error, r6c.error?.message)
  const p6c = await partition(WS)
  check('6c partisi = 1 import / 0 creatives', p6c.importCount === 1 && p6c.creatives === 0, `imports=${p6c.importCount} creatives=${p6c.creatives}`)

  // 6d invalid creative row (campaign_id kosong) → tolak SEBELUM delete
  const r6d1 = await callReplace({ workspaceId: WS, creatives: [mkCreative(1, { campaign_id: '' })] })
  check('6d campaign_id "" → GMVMAX_INVALID_CREATIVE_ROW', /INVALID_CREATIVE_ROW/.test(r6d1.error?.message || ''), r6d1.error?.message)
  const r6d2 = await callReplace({ workspaceId: WS, creatives: ['bukan_object'] })
  check('6d elemen non-object → GMVMAX_INVALID_CREATIVE_ROW', /INVALID_CREATIVE_ROW/.test(r6d2.error?.message || ''), r6d2.error?.message)
  const p6d = await partition(WS)
  check('6d partisi zero-data lama UTUH (0 creatives, tak terhapus)', p6d.importCount === 1 && p6d.creatives === 0, `imports=${p6d.importCount} creatives=${p6d.creatives}`)

  // 6e DB-level identity dedup: 2 baris identity kanonik sama → unique index tolak → rollback
  const dupRow = mkCreative(1)
  const r6e = await callReplace({ workspaceId: WS, creatives: [dupRow, { ...dupRow }] })
  check('6e identity dobel → unique violation (RPC error)', !!r6e.error, r6e.error?.message?.slice(0, 70))
  const p6e = await partition(WS)
  check('6e rollback: partisi masih zero-data lama', p6e.importCount === 1 && p6e.creatives === 0, `imports=${p6e.importCount} creatives=${p6e.creatives}`)

  // 6f concurrency: 2 replace valid paralel utk partisi sama → unique(ws,date) ⇒ end-state 1 import
  const [c1, c2] = await Promise.allSettled([
    callReplace({ workspaceId: WS, creatives: [mkCreative(1), mkCreative(2)] }),
    callReplace({ workspaceId: WS, creatives: [mkCreative(1), mkCreative(2)] }),
  ])
  const okCount = [c1, c2].filter(r => r.status === 'fulfilled' && !r.value.error).length
  const p6f = await partition(WS)
  check('6f concurrency: end-state TEPAT 1 import (bukan dobel)', p6f.importCount === 1, `imports=${p6f.importCount} sukses=${okCount}/2`)
  check('6f end-state konsisten (2 creatives)', p6f.creatives === 2, `creatives=${p6f.creatives}`)

  // ══ STEP 7 — RPC SCALE ═════════════════════════════════════════════════════
  console.log('\n── STEP 7 · RPC SCALE (payload besar dalam satu transaksi) ──')
  const N = 5000
  const big = Array.from({ length: N }, (_, i) => mkCreative(i))
  const t0 = Date.now()
  const r7 = await callReplace({ workspaceId: WS, creatives: big })
  const ms = Date.now() - t0
  check(`7 replace ${N} baris → sukses`, !r7.error, r7.error?.message || `${ms}ms`)
  const p7 = await partition(WS)
  check(`7 partisi = 1 import / ${N} creatives`, p7.importCount === 1 && p7.creatives === N, `creatives=${p7.creatives} in ${ms}ms`)

  // ══ STEP 8 — CLEANUP ═══════════════════════════════════════════════════════
  console.log('\n── STEP 8 · CLEANUP (hapus partisi sentinel; CASCADE creatives) ──')
  const { error: eDel } = await sb.from('gmvmax_imports').delete().eq('workspace_id', WS).eq('snapshot_date', SENTINEL_DATE)
  check('8 delete partisi sentinel', !eDel, eDel?.message)
  const p8 = await partition(WS)
  check('8 partisi bersih (0 import / 0 creatives)', p8.importCount === 0 && p8.creatives === 0, `imports=${p8.importCount} creatives=${p8.creatives}`)

  // ── verdict ──
  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log(`║  VERDICT: ${PASS} PASS / ${FAIL} FAIL`.padEnd(63) + '║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  if (FAIL > 0) { console.log('\nGAGAL:', results.filter(r => !r.ok).map(r => r.name).join('; ')); process.exit(1) }
  console.log('\nSEMUA PROOF P0/P1 LULUS. Migrasi 0017 terbukti atomik, idempoten, ')
  console.log('empty-safe, identity-dedup DB-level, concurrency-safe, dan scale OK.')
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(2) })
