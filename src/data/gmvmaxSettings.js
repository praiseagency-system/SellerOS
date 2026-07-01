// Threshold ROAS per workspace (gmvmax_settings). 1 row/workspace; fallback ke
// DEFAULT_THRESHOLDS bila belum ada.
import { supabase } from '../lib/supabase'
import { getCurrentWorkspaceId } from '../utils/workspace'
import { DEFAULT_THRESHOLDS } from '../utils/gmvmaxClassify'

export async function getThresholds() {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) return { ...DEFAULT_THRESHOLDS }
  const { data, error } = await supabase
    .from('gmvmax_settings')
    .select('*')
    .eq('workspace_id', wsId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { ...DEFAULT_THRESHOLDS }
  return {
    roasGood: Number(data.roas_good),
    roasBad: Number(data.roas_bad),
    roasGreat: Number(data.roas_great),
    spendFloor: Number(data.spend_floor),
  }
}

export async function saveThresholds(t) {
  const wsId = getCurrentWorkspaceId()
  if (!wsId) throw new Error('Workspace tidak aktif.')
  const { error } = await supabase.from('gmvmax_settings').upsert({
    workspace_id: wsId,
    roas_good: t.roasGood,
    roas_bad: t.roasBad,
    roas_great: t.roasGreat,
    spend_floor: t.spendFloor,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
