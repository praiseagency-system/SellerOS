// HITUNG ULANG vonis eksperimen dengan aturan jendela (v2) — semua workspace.
//
// Evaluator harian (experimentEval, di VPS) melakukan hal yang sama tiap pagi;
// skrip ini untuk (a) melihat laporan sebelum → sesudah TANPA menulis, dan
// (b) menulisnya sekarang tanpa menunggu run 07.30 WIB.
//
//   node scripts/gmvmax-recompute-experiments.mjs            # --dry (bawaan): laporan saja
//   node scripts/gmvmax-recompute-experiments.mjs --write    # tulis + simpan cadangan dulu
//   … --all                                                  # hitung ulang penuh, termasuk jendela yang sudah beku
//   … --json /path/di-luar-repo/laporan.json                 # simpan laporan mentah (berisi angka toko)
//
// PENTING — urutan rilis: --write HANYA berguna setelah bundel VPS diganti.
// Bundel lama menulis ulang SEMUA eksperimen RUNNING dalam format lama tiap
// kali jalan, jadi hasil --write akan tertimpa balik pagi berikutnya.
//
// Tidak memanggil TikTok. Membaca kanonik (gmvmax_imports/creatives), menulis
// HANYA gmvmax_experiments.{checkpoints,conclusion,confidence,updated_at}.
// Kredensial: .env.local + .env.sync.local di akar repo (atau di
// SELLEROS_ENV_DIR bila skrip dijalankan dari worktree). Cadangan --write
// disimpan di folder kredensial itu — BUKAN di worktree, yang bisa dihapus
// `git worktree remove` tanpa peringatan karena berkasnya di-.gitignore.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { evaluateExperiments } from '../src/gmvmax/experimentEval.mjs'
import { verdictReasonID } from '../src/utils/gmvmaxExperimentFormat.js'

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const ENV = (process.env.SELLEROS_ENV_DIR || REPO).replace(/\/$/, '')
const pe = (p) => { const o = {}; for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '') } return o }
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const write = process.argv.includes('--write')
const force = process.argv.includes('--all')
const jsonOut = arg('--json')

const L = pe(`${ENV}/.env.local`), S = pe(`${ENV}/.env.sync.local`)
const real = createClient(L.VITE_SUPABASE_URL, S.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

// --dry dijamin tidak menulis oleh STRUKTUR, bukan oleh disiplin: klien yang
// dioper ke evaluator melempar pada operasi tulis apa pun.
const BLOCK = new Set(['insert', 'update', 'upsert', 'delete'])
const readOnly = (sb) => ({
  from: (t) => new Proxy(sb.from(t), { get: (o, k) => (BLOCK.has(k) ? () => { throw new Error(`--dry: ${String(k)}() ke ${t} diblok`) } : typeof o[k] === 'function' ? o[k].bind(o) : o[k]) }),
  rpc: () => { throw new Error('--dry: rpc() diblok') },
})

const LABEL = { SUSTAINABLE_WINNER: 'Pemenang berkelanjutan', WINNER_CANDIDATE: 'Kandidat pemenang', TEMPORARY_SPIKE: 'Lonjakan sementara', INCONCLUSIVE: 'Belum konklusif', WEAK: 'Lemah', STOPPED: 'Dihentikan', DATA_INSUFFICIENT: 'Data kurang' }
const lab = (c) => LABEL[c] || c || '—'
const BOOST = new Set(['MANUAL_BOOST', 'ACCELERATE_TESTING'])

// Berhalaman: PostgREST memotong diam-diam di ±1000 baris, dan cadangan yang
// terpotong berarti ada baris yang ditimpa tanpa cadangan.
const all = []
for (let f = 0; ; f += 1000) {
  const { data, error } = await real.from('gmvmax_experiments')
    .select('id,workspace_id,checkpoints,conclusion,confidence,status,contaminated,contamination')
    .order('id', { ascending: true }).range(f, f + 999)
  if (error) { console.error('DB_ERROR', error.message); process.exit(9) }
  all.push(...(data || []))
  if (!data || data.length < 1000) break
}
const workspaces = [...new Set(all.map(e => e.workspace_id))]
if (!workspaces.length) { console.log('Tidak ada eksperimen.'); process.exit(0) }

if (write) {
  const file = `${ENV}/gmvmax-experiments-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(file, JSON.stringify(all))
  console.log(`Cadangan ${all.length} baris (checkpoints, conclusion, confidence) → ${file}`)
}

const report = []
for (const workspaceId of workspaces) {
  const r = await evaluateExperiments({ sb: write ? real : readOnly(real), workspaceId, dryRun: !write, force })
  report.push({ workspaceId, ...r })
  const moves = {}
  console.log(`\n══ workspace ${workspaceId.slice(0, 8)} — ${r.updated} ${write ? 'ditulis' : 'akan ditulis'}, ${r.unchanged} tak berubah${r.failed.length ? `, ${r.failed.length} GAGAL` : ''} (aturan v${r.rule_version}) ══`)
  for (const c of r.changes) {
    const k = `${lab(c.before.conclusion)} → ${lab(c.after.conclusion)}`
    moves[k] = (moves[k] || 0) + 1
    const noun = BOOST.has(c.experiment_type) ? 'boost' : 'perubahan'
    console.log(`${String(c.start_at).slice(0, 10)}  ${(c.treatment || '').slice(0, 40).padEnd(40)}  ${lab(c.before.conclusion)} → ${lab(c.after.conclusion)}${c.after.confidence === 'LOW' ? ' (keyakinan rendah)' : ''}${c.contaminated ? '  [tercampur]' : ''}`)
    console.log(`            ${verdictReasonID(c.after, { noun })}`)
  }
  for (const f of r.failed) console.log(`GAGAL ${f.id}: ${f.message}`)
  console.log('\nRingkasan (tersimpan di DB sebelumnya → aturan baru):')
  for (const [k, n] of Object.entries(moves).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`)
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(report)); console.log(`\nLaporan mentah → ${jsonOut}`) }
console.log(write ? '\nSELESAI — vonis baru TERTULIS.' : '\n--dry: TIDAK ADA yang ditulis. Jalankan dengan --write setelah bundel VPS diganti.')
