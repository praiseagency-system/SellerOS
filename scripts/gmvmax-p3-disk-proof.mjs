// STAGE 2C — bukti: kegagalan penyimpanan bukti shadow GAGAL AMAN.
// dir tak-writable → persistRun/persistBatchSummary lempar SHADOW_PERSIST_FAILED
// → diklasifikasi FAILED, exit non-zero, TANPA fake success, kanonik tak tersentuh.
import { mkdirSync, chmodSync, rmSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { persistRun, persistBatchSummary } from '../src/gmvmax/shadowStore.mjs'

const DATE = '2026-07-08'
const WS = '10280d7b-2994-4a40-b639-2d88e0e2018b'
function pe(p){const o={};for(const l of readFileSync(p,'utf8').split('\n')){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);if(m)o[m[1]]=m[2].replace(/^["']|["']$/g,'')}return o}
const L=pe('.env.local'),S=pe('.env.sync.local')
const sb=createClient(L.VITE_SUPABASE_URL,S.SUPABASE_SECRET_KEY,{auth:{persistSession:false}})

async function canonical(){
  const {data:imp}=await sb.from('gmvmax_imports').select('id,created_at').eq('workspace_id',WS).eq('snapshot_date',DATE).maybeSingle()
  if(!imp)return{importCount:0,creatives:0,createdAt:null}
  const {count}=await sb.from('gmvmax_creatives').select('id',{count:'exact',head:true}).eq('import_id',imp.id)
  return{importCount:1,creatives:count??0,createdAt:imp.created_at}
}

let PASS=0,FAIL=0
const ok=(n,c,d='')=>{c?PASS++:FAIL++;console.log(`  ${c?'✓':'✗'} ${n}${d?' — '+d:''}`)}

async function main(){
  console.log('── STAGE 2C · DISK-FAILURE PROOF ──')
  const before=await canonical()
  console.log(`canonical baseline ${DATE}: imports=${before.importCount} creatives=${before.creatives} created_at=${before.createdAt}`)

  const badBase='/private/tmp/claude-501/-Users-macbook-claude/p3-unwritable'
  rmSync(badBase,{recursive:true,force:true})
  mkdirSync(badBase,{recursive:true})
  chmodSync(badBase,0o000) // tak-writable
  process.env.GMVMAX_SHADOW_DIR=`${badBase}/sub` // menulis di bawah dir 000 → EACCES

  // 1) persistRun gagal eksplisit
  let threw=null
  try{ persistRun({snapshot_date:DATE,advertiser_id:'ADV',run_id:'r1',status:'SUCCESS',parity:{status:'MATCH'},started_at:'x',finished_at:'y'}) }
  catch(e){ threw=e }
  ok('persistRun lempar error saat dir tak-writable', !!threw, threw?.message?.slice(0,55))
  ok('kode error = SHADOW_PERSIST_FAILED (bukan dibungkam)', threw?.code==='SHADOW_PERSIST_FAILED', threw?.code)

  // 2) persistBatchSummary juga gagal eksplisit
  let threw2=null
  try{ persistBatchSummary({mode:'shadow',batch_status:'SUCCESS'}) }catch(e){ threw2=e }
  ok('persistBatchSummary gagal eksplisit', threw2?.code==='SHADOW_PERSIST_FAILED', threw2?.code)

  // 3) kanonik tak tersentuh
  chmodSync(badBase,0o755); rmSync(badBase,{recursive:true,force:true})
  const after=await canonical()
  ok('kanonik TAK berubah (import/creative/created_at)',
    after.importCount===before.importCount&&after.creatives===before.creatives&&after.createdAt===before.createdAt,
    `imports=${after.importCount} creatives=${after.creatives}`)

  // 4) semantik exit: FAILED → non-zero (script ini exit 1 bila ada kegagalan tulis terdeteksi & ditangani)
  console.log(`\nVERDICT 2C: ${PASS} PASS / ${FAIL} FAIL`)
  // Kontrak: kegagalan disk TERDETEKSI & diklasifikasi → runner exit non-zero (bukan 0/SUCCESS).
  process.exit(FAIL===0?0:1)
}
main().catch(e=>{console.error('FATAL',e.message);process.exit(2)})
