import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/apiClient', () => ({ postJson: vi.fn() }))
vi.mock('./gmvmaxSpark', () => ({ fetchSparkInfo: vi.fn(), bindSparkNow: vi.fn() }))

const { judgePreview } = await import('./pikatSpark')

const row = { video_id: '7550000000000000001', spark_code: '#kode' }

describe('judgePreview — keputusan sebelum mengikat', () => {
  it('video sudah terikat → ALREADY, tanpa melihat hasil pratinjau', () => {
    expect(judgePreview(row, null, 'x', new Set(['7550000000000000001'])).status).toBe('ALREADY')
  })
  it('pratinjau gagal → INVALID', () => {
    expect(judgePreview(row, null, 'kode salah', new Set()).status).toBe('INVALID')
  })
  it('kode milik video lain → MISMATCH (tak boleh diikat)', () => {
    const v = judgePreview(row, { item_info: { item_id: '7550000000000000999', text: 'x' } }, null, new Set())
    expect(v.status).toBe('MISMATCH')
    expect(v.preview.item_id).toBe('7550000000000000999')
  })
  it('video cocok → READY dengan judul & penulis', () => {
    const v = judgePreview(row, { item_info: { item_id: '7550000000000000001', text: 'Judul' }, user_name: 'kreator' }, null, new Set())
    expect(v).toEqual({ status: 'READY', preview: { item_id: '7550000000000000001', title: 'Judul', author: 'kreator' } })
  })
})
