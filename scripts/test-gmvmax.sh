#!/bin/zsh
# Menjalankan characterization tests engine GMV Max deterministik.
# Test murni (reconcile/identity) → node:test langsung. Mapper (rantai xlsx) →
# di-bundle esbuild dulu. Tanpa framework test tambahan (node:test bawaan).
set -e
cd /Users/macbook/claude/tools/shopee-quadrant

echo "── pure: reconcile + identity + parity + rowMap + runStatus + lock ──"
node --test src/gmvmax/reconcile.test.mjs src/gmvmax/identity.test.mjs src/gmvmax/parity.test.mjs \
  src/gmvmax/rowMap.test.mjs src/gmvmax/runStatus.test.mjs src/gmvmax/lock.test.mjs src/gmvmax/failure.test.mjs

echo "── P3 runtime (TZ=UTC): redact + authState + jakartaDate + env + depgraph ──"
TZ=UTC node --test src/gmvmax/runtime/redact.test.mjs src/gmvmax/runtime/authState.test.mjs \
  src/gmvmax/runtime/jakartaDate.test.mjs src/gmvmax/runtime/env.test.mjs src/gmvmax/runtime/depgraph.test.mjs

echo "── bundle (rantai xlsx): normalize + engine ──"
for t in normalize engine; do
  npx esbuild "src/gmvmax/${t}.test.mjs" --bundle --platform=node --format=esm \
    --packages=external --outfile="src/gmvmax/.${t}.test.bundle.mjs" --log-level=error
  node --test "src/gmvmax/.${t}.test.bundle.mjs"
  rm -f "src/gmvmax/.${t}.test.bundle.mjs"
done
