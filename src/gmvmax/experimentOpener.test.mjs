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
