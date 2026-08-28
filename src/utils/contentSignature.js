// content_signature sisi BROWSER — algoritma identik dengan worker Node.
// Worker memakai node:crypto (src/gmvmax/provenance.mjs); di browser kita hash
// STRING kanonik yang sama memakai Web Crypto. Konten sama → signature sama →
// RPC versioned mengenalinya sebagai NO-OP (tak membuat versi baru sia-sia).
import { canonicalString } from '../gmvmax/provenanceCore.mjs'

const toHex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

export async function contentSignature({ workspaceId, date, rows = [], totals = {} }) {
  const canon = canonicalString({ workspaceId, date, rows, totals })
  // crypto.subtle hanya tersedia di secure context (https / localhost).
  if (!globalThis.crypto?.subtle) throw new Error('Browser tidak mendukung Web Crypto (butuh HTTPS).')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon))
  return 'sha256:' + toHex(digest)
}
