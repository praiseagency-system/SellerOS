// Akses token MCP tt-ads — TANPA menyimpan ke disk (baca saat runtime).
// Sumber (berurut): env GMVMAX_MCP_TOKEN (VPS) → macOS Keychain (dev lokal).
// Mengembalikan { accessToken, serverUrl, expiresAt }. TIDAK menyentuh token
// akun Claude yang ada di store yang sama.
import { execSync } from 'node:child_process'

export function loadMcpToken() {
  if (process.env.GMVMAX_MCP_TOKEN && process.env.GMVMAX_MCP_URL) {
    return {
      accessToken: process.env.GMVMAX_MCP_TOKEN,
      serverUrl: process.env.GMVMAX_MCP_URL,
      expiresAt: Number(process.env.GMVMAX_MCP_EXPIRES_AT || 0) || null,
      source: 'env',
    }
  }
  // Dev lokal (macOS): baca HANYA entri mcpOAuth tiktok-ads.
  try {
    const cred = JSON.parse(execSync('security find-generic-password -s "Claude Code-credentials" -w', { encoding: 'utf8' }))
    const k = Object.keys(cred.mcpOAuth || {}).find(x => x.startsWith('tiktok-ads'))
    if (!k) throw new Error('entri mcpOAuth tiktok-ads tidak ada di Keychain')
    const o = cred.mcpOAuth[k]
    return { accessToken: o.accessToken, serverUrl: o.serverUrl, expiresAt: Number(o.expiresAt) || null, source: 'keychain' }
  } catch (e) {
    throw new Error(`Gagal memuat token MCP: ${e.message}. Set GMVMAX_MCP_TOKEN/GMVMAX_MCP_URL (VPS) atau /mcp Authenticate (lokal).`)
  }
}
