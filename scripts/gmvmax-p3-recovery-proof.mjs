// STAGE 2B — bukti pemulihan shadow (dieksekusi nyata).
// Urutan: baseline kanonik → run shadow live → KILL mid-run → kanonik utuh + lock
// teramati → pemulihan lock (dead-pid / stale-time / live-lock-tak-dicuri) → rerun
// sukses + parity MATCH → kanonik tetap utuh. Semua env-only (mode vps), tanpa Keychain
// di entrypoint (token disuplai via env dari harness = simulasi token eksternal VPS).
import { spawn, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { loadMcpToken } from '../src/gmvmax/providers/tokenStore.mjs'
import { acquireLock, releaseLock } from '../src/gmvmax/lock.mjs'

const DATE = '2026-07-08'
const ADV = '7313535999831769090'
const WS = '10280d7b-2994-4a40-b639-2d88e0e2018b'
const BASE = '/private/tmp/claude-501/-Users-macbook-claude/p3-recovery'
const LOCK = `${BASE}/locks/${ADV}__${DATE}.lock`
const ENTRY = '.gmvmax-vps-build/vpsShadow.mjs' // bundel (dibangun di main)

function pe(p){const o={};for(const l of readFileSync(p,'utf8').split('\n')){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'')}return o}
const L=pe('.env.local'),S=pe('.env.sync.local')
const sb=createClient(L.VITE_SUPABASE_URL,S.SUPABASE_SECRET_KEY,{auth:{persistSession:false}})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let PASS=0,FAIL=0; const ok=(n,c,d='')=>{c?PASS++:FAIL++;console.log(`  ${c?'✓':'✗'} ${n}${d?' — '+d:''}`)}

async function canonical(){
  const {data:imp}=await sb.from('gmvmax_imports').select('id,created_at').eq('workspace_id',WS).eq('snapshot_date',DATE).maybeSingle()
  if(!imp)return{importCount:0,creatives:0,createdAt:null}
  const {count}=await sb.from('gmvmax_creatives').select('id',{count:'exact',head:true}).eq('import_id',imp.id)
  return{importCount:1,creatives:count??0,createdAt:imp.created_at}
}
function childEnv(extra){
  const t=loadMcpToken() // harness boleh baca Keychain; ENTRYPOINT hanya baca env di bawah
  return {...process.env, TZ:'UTC', GMVMAX_RUNTIME:'vps', GMVMAX_SHADOW_ONLY:'1',
    GMVMAX_MCP_TOKEN:t.accessToken, GMVMAX_MCP_URL:t.serverUrl, GMVMAX_MCP_EXPIRES_AT:String(t.expiresAt||''),
    GMVMAX_SUPABASE_URL:L.VITE_SUPABASE_URL, GMVMAX_SUPABASE_KEY:S.SUPABASE_SECRET_KEY,
    GMVMAX_SHADOW_DIR:BASE, ...extra}
}
function run(extra){return new Promise(res=>{
  const c=spawn('node',[ENTRY,'--date',DATE],{env:childEnv(extra),stdio:['ignore','pipe','pipe']})
  let out=''; c.stdout.on('data',d=>out+=d); c.stderr.on('data',d=>out+=d)
  res({child:c,done:new Promise(r=>c.on('exit',(code,sig)=>r({code,sig,out})))})
})}

async function main(){
  console.log('══ STAGE 2B · RECOVERY PROOF ══')
  console.log('   building VPS-shadow bundle (esbuild)…')
  execSync('npx esbuild src/gmvmax/vpsShadow.mjs --bundle --platform=node --format=esm --packages=external --outfile=.gmvmax-vps-build/vpsShadow.mjs --log-level=error',{stdio:'pipe'})
  rmSync(BASE,{recursive:true,force:true}); mkdirSync(BASE,{recursive:true})
  process.env.GMVMAX_SHADOW_DIR=BASE // untuk unit lock in-proc

  const before=await canonical()
  console.log(`\n[baseline] canonical ${DATE}: imports=${before.importCount} creatives=${before.creatives} created_at=${before.createdAt}`)

  // ── 1) KILL MID-RUN ─────────────────────────────────────────────────────────
  console.log('\n── 1. live shadow run → kill mid-run ──')
  const {child,done}=await run({GMVMAX_TEST_HOLD_MS:'15000'}) // tahan setelah lock → kill deterministik
  console.log(`   spawned child pid=${child.pid} (cmd: node ${ENTRY} --date ${DATE})`)
  let appeared=false
  for(let i=0;i<80;i++){ if(existsSync(LOCK)){appeared=true;break} await sleep(100) }
  ok('lock teramati saat run (observable)', appeared, LOCK)
  const holder=appeared?JSON.parse(readFileSync(LOCK,'utf8')):null
  ok('lock holder pid = child pid', holder?.pid===child.pid, `holder=${holder?.pid} child=${child.pid}`)
  child.kill('SIGKILL')
  const ex=await done
  console.log(`   child exit code=${ex.code} signal=${ex.sig}`)
  ok('child mati oleh SIGKILL (mid-run)', ex.sig==='SIGKILL'||ex.code!==0, `sig=${ex.sig} code=${ex.code}`)
  const afterKill=await canonical()
  ok('kanonik TAK tersentuh setelah kill', afterKill.importCount===before.importCount&&afterKill.creatives===before.creatives&&afterKill.createdAt===before.createdAt,
    `imports=${afterKill.importCount} creatives=${afterKill.creatives}`)
  ok('lock tertinggal (holder pid kini mati) → siap pemulihan', existsSync(LOCK)&&!pidAliveExt(holder.pid), `pidAlive=${pidAliveExt(holder?.pid)}`)

  // ── 2) LOCK RECOVERY RULES ──────────────────────────────────────────────────
  console.log('\n── 2. pemulihan lock (aturan terdokumentasi) ──')
  // a. dead-pid → reklamasi
  writeFileSync(LOCK,JSON.stringify({pid:999999,startedAt:Date.now(),advertiserId:ADV,date:DATE}))
  let r=acquireLock(ADV,DATE)
  ok('dead PID dikenali → lock direklamasi', r.ok===true, `ok=${r.ok}`)
  releaseLock(r.path)
  // b. stale-by-time (pid hidup tapi tua > 30m) → reklamasi
  writeFileSync(LOCK,JSON.stringify({pid:process.pid,startedAt:Date.now()-31*60000,advertiserId:ADV,date:DATE}))
  r=acquireLock(ADV,DATE)
  ok('lock basi (>30m) direklamasi walau pid hidup', r.ok===true, `ok=${r.ok}`)
  releaseLock(r.path)
  // c. live + fresh → TIDAK dicuri
  writeFileSync(LOCK,JSON.stringify({pid:process.pid,startedAt:Date.now(),advertiserId:ADV,date:DATE}))
  r=acquireLock(ADV,DATE)
  ok('lock AKTIF (pid hidup, segar) TIDAK dicuri', r.ok===false&&r.reason==='LOCKED', `ok=${r.ok} reason=${r.reason}`)
  rmSync(LOCK,{force:true}) // bersihkan untuk rerun

  // ── 3) RERUN → SUCCESS + PARITY MATCH ───────────────────────────────────────
  console.log('\n── 3. rerun shadow (nyata) → SUCCESS + parity MATCH ──')
  const {done:done2}=await run({})
  const ex2=await done2
  console.log(ex2.out.split('\n').filter(l=>l.includes('RUN_DONE')||l.includes('TZ_RESOLVED')||l.includes('AUTH')||l.includes('RUNTIME_OK')).join('\n'))
  const summary=existsSync(`${BASE}/_last_batch.json`)?JSON.parse(readFileSync(`${BASE}/_last_batch.json`,'utf8')):null
  console.log(`   rerun exit=${ex2.code} status=${summary?.batch_status} parity=${summary?.parity}`)
  ok('rerun exit 0 (SUCCESS)', ex2.code===0, `exit=${ex2.code}`)
  ok('rerun status SUCCESS', summary?.batch_status==='SUCCESS', summary?.batch_status)
  ok('parity = MATCH (NEW deterministik = OLD produksi)', summary?.parity==='MATCH', summary?.parity)

  // ── 4) KANONIK TETAP UTUH ───────────────────────────────────────────────────
  const after=await canonical()
  ok('kanonik AKHIR tak berubah dari baseline', after.importCount===before.importCount&&after.creatives===before.creatives&&after.createdAt===before.createdAt,
    `imports=${after.importCount} creatives=${after.creatives} created_at==baseline:${after.createdAt===before.createdAt}`)

  rmSync(BASE,{recursive:true,force:true})
  console.log(`\n══ VERDICT 2B: ${PASS} PASS / ${FAIL} FAIL ══`)
  process.exit(FAIL===0?0:1)
}
function pidAliveExt(pid){try{process.kill(pid,0);return true}catch(e){return e.code==='EPERM'}}
main().catch(e=>{console.error('FATAL',e.message,e.stack);process.exit(2)})
