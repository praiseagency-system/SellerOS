#!/bin/zsh
# Build artefak deploy VPS-shadow: SATU file self-contained (supabase+xlsx di-inline)
# → tak butuh node_modules/npx di VPS (cocok systemd ProtectSystem=strict, offline).
# Output: dist-vps/gmvmax-vps-shadow.mjs (+ sha256). Jalankan di mesin build (mac/CI/VPS).
set -e
REPO="${GMVMAX_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO"
mkdir -p dist-vps
npx esbuild src/gmvmax/vpsShadow.mjs --bundle --platform=node --format=esm \
  --outfile=dist-vps/gmvmax-vps-shadow.mjs --log-level=error
shasum -a 256 dist-vps/gmvmax-vps-shadow.mjs | tee dist-vps/gmvmax-vps-shadow.mjs.sha256
echo "built: dist-vps/gmvmax-vps-shadow.mjs ($(wc -c < dist-vps/gmvmax-vps-shadow.mjs) bytes)"
echo "Deploy: salin file ini + node runtime ke VPS (tanpa node_modules)."
