import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markContamination, baselineWindow } from './experimentOpener.mjs'
import { contaminationInWindow, isContaminated } from './skills/experimentWindows.mjs'

// Klien Supabase tiruan: cukup untuk rantai yang dipakai markContamination.
function fakeSb(tables) {
  const writes = []
  const from = (table) => {
    const st = { filters: [], patch: null, range: null }
    const exec = () => {
      let rows = (tables[table] || []).filter(r => st.filters.every(f => f(r)))
      if (st.patch) { writes.push({ table, ids: rows.map(r => r.id), patch: st.patch }); rows.forEach(r => Object.assign(r, st.patch)); return { data: null, error: null } }
      if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1)
      return { data: rows, error: null }
    }
    const api = {
      select: () => api, order: () => api,
      eq: (c, v) => { st.filters.push(r => r[c] === v); return api },
      in: (c, vs) => { st.filters.push(r => vs.includes(r[c])); return api },
      gte: (c, v) => { st.filters.push(r => r[c] >= v); return api },
      range: (a, b) => { st.range = [a, b]; return api },
      update: (patch) => { st.patch = patch; return api },
      then: (res, rej) => Promise.resolve().then(exec).then(res, rej),
    }
    return api
  }
  return { from, writes, tables }
}

const WS = 'ws1'
// Boost mulai 20 Sep 10.00 WIB → hari ke-1..7 = 20–26 Sep.
const exp = (o = {}) => ({ id: 'e1', workspace_id: WS, status: 'RUNNING', campaign_id: 'c1', creative_video_id: 'v1', start_at: '2026-09-20T03:00:00Z', source_approval_id: 'ap0', contaminated: false, contamination: null, ...o })
// Potret setelan harian 19–28 Sep; budget berubah pada stempel `changeOn`.
const settings = (changeOn) => {
  const out = []
  for (let d = 19; d <= 28; d++) {
    const date = `2026-09-${d}`
    out.push({ id: `s${d}`, workspace_id: WS, snapshot_date: date, campaign_id: 'c1', campaign_name: 'C1', budget: changeOn && date >= changeOn ? 800000 : 300000 })
  }
  return out
}
const at = (iso) => Date.parse(iso)

test('perubahan setelan di hari ke-8 TIDAK menandai (jendela = hari ke-1..7 WIB)', async () => {
  const sb = fakeSb({ gmvmax_experiments: [exp()], gmvmax_campaign_settings: settings('2026-09-27'), gmvmax_approvals: [] })
  const r = await markContamination({ sb, workspaceId: WS, now: at('2026-09-28T00:30:00Z') })
  assert.deepEqual([r.marked, sb.writes.length], [0, 0])
})

test('perubahan setelan di hari ke-5 menandai, dengan jendela hari ke-1..7', async () => {
  const sb = fakeSb({ gmvmax_experiments: [exp()], gmvmax_campaign_settings: settings('2026-09-24'), gmvmax_approvals: [] })
  const r = await markContamination({ sb, workspaceId: WS, now: at('2026-09-25T00:30:00Z') })
  assert.equal(r.marked, 1)
  const p = sb.writes[0].patch
  assert.equal(p.contaminated, true)
  assert.deepEqual(p.contamination.jendela, ['2026-09-20', '2026-09-26'])
  assert.deepEqual(p.contamination.kejadian.map(k => [k.jenis, k.tanggal]), [['setelan_campaign', '2026-09-24']])
})

test('aksi lain: hari ke-8 tidak menandai; di dalam jendela menandai dengan tanggal WIB', async () => {
  const ap = (id, executed_at) => ({ id, workspace_id: WS, status: 'EXECUTED', action_type: 'BUDGET_UPDATE', target: { campaign_id: 'c1' }, executed_at })
  // 27 Sep 08.00 WIB = hari ke-8 (dulu ikut: masih < start + 7×24 jam).
  let sb = fakeSb({ gmvmax_experiments: [exp()], gmvmax_campaign_settings: [], gmvmax_approvals: [ap('ap1', '2026-09-27T01:00:00Z')] })
  assert.equal((await markContamination({ sb, workspaceId: WS, now: at('2026-09-28T00:30:00Z') })).marked, 0)
  // 26 Sep 23.30 WIB = hari ke-7; tanggal UTC-nya masih 26, tanggal WIB 26.
  // 22 Sep 00.30 WIB (21 Sep 17.30Z) → tersimpan sebagai 22 Sep, bukan 21.
  sb = fakeSb({ gmvmax_experiments: [exp()], gmvmax_campaign_settings: [], gmvmax_approvals: [ap('ap1', '2026-09-21T17:30:00Z'), ap('ap0', '2026-09-22T05:00:00Z')] })
  assert.equal((await markContamination({ sb, workspaceId: WS, now: at('2026-09-28T00:30:00Z') })).marked, 1)
  assert.deepEqual(sb.writes[0].patch.contamination.kejadian, [{ jenis: 'aksi_lain', tanggal: '2026-09-22', aksi: 'BUDGET_UPDATE' }]) // approval sumbernya sendiri (ap0) dilewati
})

test('baris yang sudah DITUTUP tetap diperiksa', async () => {
  const sb = fakeSb({ gmvmax_experiments: [exp({ status: 'CONCLUDED' }), exp({ id: 'stop', status: 'STOPPED' })], gmvmax_campaign_settings: settings('2026-09-24'), gmvmax_approvals: [] })
  await markContamination({ sb, workspaceId: WS, now: at('2026-09-25T00:30:00Z') })
  assert.deepEqual(sb.writes.map(w => w.ids), [['e1']])
})

test('tanda lama dari kejadian hari ke-8 dicabut; yang di dalam jendela dipertahankan', async () => {
  const lama = exp({ id: 'lama', contaminated: true, contamination: { jendela: ['2026-09-20', '2026-09-27'], kejadian: [{ jenis: 'setelan_campaign', tanggal: '2026-09-27', bidang: 'Budget' }] } })
  const campur = exp({ id: 'campur', contaminated: true, contamination: { jendela: ['2026-09-20', '2026-09-27'], kejadian: [{ jenis: 'aksi_lain', tanggal: '2026-09-23', aksi: 'X' }, { jenis: 'setelan_campaign', tanggal: '2026-09-27', bidang: 'Budget' }] } })
  const tetap = exp({ id: 'tetap', contaminated: true, contamination: { jendela: ['2026-09-20', '2026-09-27'], kejadian: [{ jenis: 'aksi_lain', tanggal: '2026-09-26', aksi: 'X' }] } })
  const sb = fakeSb({ gmvmax_experiments: [lama, campur, tetap], gmvmax_campaign_settings: [], gmvmax_approvals: [] })
  const r = await markContamination({ sb, workspaceId: WS, now: at('2026-10-20T00:30:00Z') })
  assert.equal(r.cleared, 1)
  assert.deepEqual([lama.contaminated, lama.contamination], [false, null])
  assert.deepEqual([campur.contaminated, campur.contamination.kejadian.length, campur.contamination.jendela[1]], [true, 1, '2026-09-26'])
  assert.equal(sb.writes.some(w => w.ids[0] === 'tetap'), false)
  assert.equal(contaminationInWindow({ start_at: '2026-09-20T03:00:00Z', contamination: null }), null) // tanpa bukti tersimpan → tidak disentuh
})

test('isContaminated: tanda warisan hari ke-8 tidak berlaku untuk vonis walau DB belum dibersihkan', () => {
  const base = { start_at: '2026-09-20T03:00:00Z', contaminated: true }
  assert.equal(isContaminated({ ...base, contamination: { kejadian: [{ jenis: 'setelan_campaign', tanggal: '2026-09-27' }] } }), false)
  assert.equal(isContaminated({ ...base, contamination: { kejadian: [{ jenis: 'setelan_campaign', tanggal: '2026-09-26' }] } }), true)
  assert.equal(isContaminated({ ...base, contamination: null }), true) // ditandai tanpa rincian → tetap berlaku
  assert.equal(isContaminated({ ...base, contaminated: false }), false)
})

test('jendela yang sudah lama berakhir tidak lagi dibaca; tulisan dibatasi workspace', async () => {
  const sb = fakeSb({ gmvmax_experiments: [exp(), exp({ id: 'asing', workspace_id: 'ws-lain' })], gmvmax_campaign_settings: settings('2026-09-24'), gmvmax_approvals: [] })
  // 20 hari setelah hari ke-7 → di luar masa tenggang 14 hari.
  assert.deepEqual(await markContamination({ sb, workspaceId: WS, now: at('2026-10-16T00:30:00Z') }), { marked: 0, cleared: 0 })
  assert.equal((await markContamination({ sb, workspaceId: WS, now: at('2026-09-25T00:30:00Z') })).marked, 1)
  assert.deepEqual(sb.writes.map(w => w.ids), [['e1']])
})

test('lebih dari 1000 potret setelan: perubahan di halaman kedua tetap tertangkap', async () => {
  const cs = []
  for (let d = 19; d <= 28; d++) for (let c = 0; c < 150; c++) cs.push({ id: `s${d}-${String(c).padStart(3, '0')}`, workspace_id: WS, snapshot_date: `2026-09-${d}`, campaign_id: `c${c}`, campaign_name: `C${c}`, budget: c === 1 && d >= 26 ? 800000 : 300000 })
  const sb = fakeSb({ gmvmax_experiments: [exp()], gmvmax_campaign_settings: cs, gmvmax_approvals: [] })
  assert.equal((await markContamination({ sb, workspaceId: WS, now: at('2026-09-28T00:30:00Z') })).marked, 1)
})

test('baseline jalur persetujuan memakai hari WIB: berakhir tepat sehari sebelum hari ke-1', () => {
  // 24 Sep 00.06 WIB (23 Sep 17.06Z) → hari ke-1 = 24 Sep.
  assert.deepEqual(baselineWindow(at('2026-09-23T17:06:00Z')), { baseline_start: '2026-09-17', baseline_end: '2026-09-23' })
  assert.deepEqual(baselineWindow(at('2026-09-20T03:00:00Z')), { baseline_start: '2026-09-13', baseline_end: '2026-09-19' })
})
