// Lapisan data halaman approval publik (/approve) — hanya lewat RPC token-gated
// (SECURITY DEFINER), bukan akses tabel langsung. Butuh sesi login (magic link).
import { supabase } from '../lib/supabase'

// Ambil campaign + produk terkait via share token.
// Mengembalikan { campaign, products } atau melempar (invalid token / not authorized).
export async function getCampaignByToken(token) {
  const { data, error } = await supabase.rpc('campaign_by_share_token', { p_token: token })
  if (error) throw error
  return data
}

// Set persetujuan satu produk. Mengembalikan { approvals, approvalLog } terbaru.
export async function submitApproval(token, productId, status, note) {
  const { data, error } = await supabase.rpc('set_product_approval', {
    p_token: token, p_product_id: productId, p_status: status, p_note: note || '',
  })
  if (error) throw error
  return data
}
