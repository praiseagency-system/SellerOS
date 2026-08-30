import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFromApproval, baselineWindow } from './experimentOpener.mjs'

const ap = (action_type, extra = {}) => ({ action_type, target: {}, current_value: {}, proposed_value: {}, ...extra })

test('opener: aksi yang tak memulai perlakuan baru TIDAK membuka eksperimen', () => {
  for (const t of ['TEST', 'SESSION_UPDATE', 'SESSION_DELETE']) {
    assert.equal(planFromApproval(ap(t)), null, `${t} seharusnya dilewati`)
  }
  assert.equal(planFromApproval(null), null)
  assert.equal(planFromApproval(ap('AKSI_TAK_DIKENAL')), null)
})

test('opener: Creative Boost → MANUAL_BOOST dgn subjek VIDEO', () => {
  const p = planFromApproval(ap('SESSION_CREATE', {
    target: { campaign_id: '111', video_id: '999' },
    proposed_value: { budget: 50000, jam: 24, session: { bid_type: 'CREATIVE_NO_BID', product_list: [{ spu_id: '77' }] } },
  }))
  assert.equal(p.experiment_type, 'MANUAL_BOOST')
  assert.equal(p.creative_video_id, '999')
  assert.equal(p.product_id, '77')
  assert.equal(p.campaign_id, '111')
  assert.match(p.treatment, /Creative Boost/)
})

test('opener: Max Delivery → ACCELERATE_TESTING, subjek PRODUK (bukan video)', () => {
  const p = planFromApproval(ap('SESSION_CREATE', {
    target: { campaign_id: '111' },
    proposed_value: { budget: 100000, jam: 48, session: { bid_type: 'NO_BID', product_list: [{ spu_id: '77' }] } },
  }))
  assert.equal(p.experiment_type, 'ACCELERATE_TESTING')
  assert.equal(p.creative_video_id, null, 'Max Delivery bekerja pada produk, bukan satu video')
  assert.equal(p.product_id, '77')
})

test('opener: CREATIVE_EXCLUDE membawa spu dari items[].spu_id_list', () => {
  const p = planFromApproval(ap('CREATIVE_EXCLUDE', {
    target: { campaign_id: '111', video_id: '999' },
    proposed_value: { action: 'REMOVE', items: [{ item_id: '999', spu_id_list: ['77'] }] },
  }))
  assert.equal(p.experiment_type, 'CREATIVE_EXCLUSION')
  assert.equal(p.product_id, '77')
  assert.match(p.treatment, /dikeluarkan/)
})

test('opener: SPARK_BIND → NEW_CREATIVE_TEST', () => {
  const p = planFromApproval(ap('SPARK_BIND', { target: { campaign_id: '1', video_id: '2' } }))
  assert.equal(p.experiment_type, 'NEW_CREATIVE_TEST')
  assert.equal(p.creative_video_id, '2')
})

test('opener: BUDGET_UPDATE merekam before→after di treatment', () => {
  const p = planFromApproval(ap('BUDGET_UPDATE', {
    target: { campaign_id: '111' }, current_value: { budget: 100000 }, proposed_value: { budget: 150000 },
  }))
  assert.equal(p.experiment_type, 'OTHER_APPROVED')
  assert.match(p.treatment, /100000/)
  assert.match(p.treatment, /150000/)
})

test('opener: baseline 7 hari penuh SEBELUM aksi, berhenti H-1', () => {
  // Aksi 10 Agustus → baseline 3 s/d 9 Agustus. Hari-H tidak boleh ikut baseline,
  // kalau ikut, efek perlakuannya mencemari pembandingnya sendiri.
  const { baseline_start, baseline_end } = baselineWindow(Date.parse('2026-08-10T05:00:00Z'))
  assert.equal(baseline_start, '2026-08-03')
  assert.equal(baseline_end, '2026-08-09')
})

test('opener: id selalu string (campaign_id numerik dari API tak boleh bocor sbg number)', () => {
  const p = planFromApproval(ap('SPARK_BIND', { target: { campaign_id: 111, video_id: 999 } }))
  assert.equal(typeof p.campaign_id, 'string')
  assert.equal(typeof p.creative_video_id, 'string')
})

// ── Jembatan 2: sesi boost di luar aplikasi ─────────────────────────────────
import { planFromSession, dedupeSessions, alreadyCovered, baselineWindowWib } from './experimentOpener.mjs'

const sesi = (o = {}) => ({
  session_id: 'S1', campaign_id: '111', campaign_name: 'Exotic Blue GMV Max',
  bid_type: 'CREATIVE_NO_BID', budget: 50000, item_id: '999', spu_id: '77',
  schedule_start_time: '2026-08-28T18:30:08.000Z', snapshot_date: '2026-08-29', ...o,
})

test('sesi: Creative Boost ber-item_id → MANUAL_BOOST dgn subjek VIDEO', () => {
  const p = planFromSession(sesi())
  assert.equal(p.experiment_type, 'MANUAL_BOOST')
  assert.equal(p.creative_video_id, '999')
  assert.equal(p.product_id, '77')
  assert.equal(p.campaign_id, '111')
  assert.match(p.treatment, /Seller Centre/)
})

test('sesi: Creative Boost TANPA item_id tidak membuka apa pun', () => {
  // Subjeknya tak diketahui — eksperimen tanpa subjek akan mengukur video yang salah.
  assert.equal(planFromSession(sesi({ item_id: null })), null)
})

test('sesi: Max Delivery → ACCELERATE_TESTING level campaign, bukan video', () => {
  const p = planFromSession(sesi({ bid_type: 'NO_BID', item_id: null }))
  assert.equal(p.experiment_type, 'ACCELERATE_TESTING')
  assert.equal(p.creative_video_id, null)
  assert.equal(p.campaign_id, '111')
})

test('sesi: bid_type asing tidak membuka eksperimen', () => {
  assert.equal(planFromSession(sesi({ bid_type: 'ROAS_BID' })), null)
  assert.equal(planFromSession(null), null)
})

test('sesi: satu sesi di banyak potret → satu baris, item_id dipungut dari mana pun', () => {
  // Baris potret lama (sebelum endpoint detail dipanggil) item_id-nya null.
  const rows = dedupeSessions([
    sesi({ snapshot_date: '2026-08-28', item_id: null }),
    sesi({ snapshot_date: '2026-08-29', item_id: '999' }),
    sesi({ session_id: 'S2', snapshot_date: '2026-08-29' }),
  ])
  assert.equal(rows.length, 2)
  const s1 = rows.find(r => r.session_id === 'S1')
  assert.equal(s1.snapshot_date, '2026-08-28', 'penampakan PERTAMA yang dipakai')
  assert.equal(s1.item_id, '999', 'item_id dipungut dari potret yang punya')
})

test('sesi: boost yang sudah tercatat lewat approval TIDAK dibuka dua kali', () => {
  const plan = planFromSession(sesi())
  const startMs = Date.parse('2026-08-28T18:30:08.000Z')
  const lewatAplikasi = [{
    experiment_type: 'MANUAL_BOOST', creative_video_id: '999', campaign_id: '111',
    start_at: '2026-08-28T18:33:00.000Z', source_approval_id: 'a1',
  }]
  assert.equal(alreadyCovered(lewatAplikasi, { plan, startMs, sessionId: 'S1' }), true)

  // Boost pada video sama tapi 3 hari kemudian = kejadian LAIN, harus dibuka.
  const lama = [{ ...lewatAplikasi[0], start_at: '2026-08-25T18:30:00.000Z' }]
  assert.equal(alreadyCovered(lama, { plan, startMs, sessionId: 'S1' }), false)
})

test('sesi: sesi yang sama dikenali lewat source_session_id walau jam bergeser', () => {
  const plan = planFromSession(sesi())
  const exps = [{ experiment_type: 'MANUAL_BOOST', creative_video_id: 'lain', campaign_id: 'lain', start_at: '2020-01-01T00:00:00.000Z', source_session_id: 'S1' }]
  assert.equal(alreadyCovered(exps, { plan, startMs: Date.now(), sessionId: 'S1' }), true)
})

test('sesi: baseline dihitung dalam hari WIB, berhenti sehari sebelum hari boost', () => {
  // 2026-08-28 18:30 UTC = 29 Agu 01:30 WIB → hari boost 29 Agu, baseline 22–28 Agu.
  const b = baselineWindowWib(Date.parse('2026-08-28T18:30:08.000Z'))
  assert.equal(b.baseline_start, '2026-08-22')
  assert.equal(b.baseline_end, '2026-08-28', 'hari perlakuan tak boleh masuk baseline')
})
