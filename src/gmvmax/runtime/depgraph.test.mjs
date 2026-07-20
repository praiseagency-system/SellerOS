// STAGE 1B — BUKTI ARSITEKTURAL (bukan grep sumber): bundle import-graph entrypoint
// VPS-shadow lalu buktikan modul terlarang ABSEN dari graph & string RPC kanonik
// nol di bundel. Gagal bila vpsShadow.mjs memperoleh dependensi ke writer/RPC.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'

const TMP = '/private/tmp/claude-501/-Users-macbook-claude'
const OUT = `${TMP}/vpsshadow.bundle.mjs`
const META = `${TMP}/vpsshadow.meta.json`

test('1B depgraph: vpsShadow.mjs tak bergantung writer.mjs / RPC kanonik', () => {
  // bundle dari root repo (cwd test = repo root saat dijalankan via test-gmvmax.sh)
  execSync(
    `npx esbuild src/gmvmax/vpsShadow.mjs --bundle --platform=node --format=esm ` +
    `--packages=external --metafile=${META} --outfile=${OUT} --log-level=error`,
    { stdio: 'pipe' }
  )
  const meta = JSON.parse(readFileSync(META, 'utf8'))
  const inputs = Object.keys(meta.inputs)
  const bundle = readFileSync(OUT, 'utf8')
  rmSync(OUT, { force: true }); rmSync(META, { force: true })

  // 1) writer.mjs TIDAK ada di import graph
  const writerInputs = inputs.filter(p => /(^|\/)writer\.mjs$/.test(p))
  assert.equal(writerInputs.length, 0, `writer.mjs masuk graph: ${writerInputs.join(', ')}`)

  // 2) identitas RPC kanonik & helper mutasi = 0 kemunculan di bundel
  assert.equal((bundle.match(/gmvmax_replace_snapshot/g) || []).length, 0, 'RPC kanonik muncul di bundel')
  assert.equal((bundle.match(/writeSnapshot/g) || []).length, 0, 'writeSnapshot muncul di bundel')

  // 3) sanity: entrypoint memang ter-bundle (parity/engine ada di graph)
  assert.ok(inputs.some(p => /engine\.mjs$/.test(p)), 'engine.mjs harus ada di graph')
  assert.ok(inputs.some(p => /parity\.mjs$/.test(p)), 'parity.mjs harus ada di graph')
})
