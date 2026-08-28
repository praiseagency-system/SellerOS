#!/bin/zsh
# VPS-SHADOW runner — bundle deterministik (esbuild) lalu jalankan entrypoint env-only.
# Bundling menyelesaikan rantai import internal (apiGmvMax→parseGmvMax→xlsx). Artefak
# bundel = satu file → cocok deploy VPS/systemd. TIDAK ada Keychain/Claude/commit.
# Env WAJIB (mode vps): GMVMAX_RUNTIME=vps GMVMAX_SHADOW_ONLY=1 GMVMAX_MCP_TOKEN
#   GMVMAX_MCP_URL GMVMAX_SUPABASE_URL GMVMAX_SUPABASE_KEY  [GMVMAX_MCP_EXPIRES_AT]
# Pakai: GMVMAX_RUNTIME=vps ... zsh scripts/gmvmax-vps-shadow.sh --date 2026-07-08
set -e
REPO="${GMVMAX_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO"
BUILD=".gmvmax-vps-build"
mkdir -p "$BUILD"
# --packages=external → dependensi npm (supabase/xlsx) diambil dari node_modules repo.
npx esbuild src/gmvmax/vpsShadow.mjs --bundle --platform=node --format=esm \
  --packages=external --outfile="$BUILD/vpsShadow.mjs" --log-level=error
exec node "$BUILD/vpsShadow.mjs" "$@"
