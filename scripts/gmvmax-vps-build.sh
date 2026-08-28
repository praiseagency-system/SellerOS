#!/bin/zsh
# Build artefak deploy VPS: SATU file self-contained per entrypoint (supabase+xlsx
# di-inline). Membangun KEDUANYA — shadow (barrier, tak menulis) dan COMMIT
# (penulis produksi). Commit dulu tak punya skrip build padahal justru ia yang
# menulis kanonik; itu ditutup di sini.
# → tak butuh node_modules/npx di VPS (cocok systemd ProtectSystem=strict, offline).
# Output: dist-vps/gmvmax-vps-{shadow,commit}.mjs (+ sha256). Jalankan di mesin build.
set -e
REPO="${GMVMAX_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$REPO"
mkdir -p dist-vps
for entry in vpsShadow:gmvmax-vps-shadow vpsCommit:gmvmax-vps-commit; do
  src="${entry%%:*}"; out="${entry##*:}"
  npx esbuild "src/gmvmax/${src}.mjs" --bundle --platform=node --format=esm \
    --outfile="dist-vps/${out}.mjs" --log-level=error
  shasum -a 256 "dist-vps/${out}.mjs" | tee "dist-vps/${out}.mjs.sha256"
  echo "built: dist-vps/${out}.mjs ($(wc -c < "dist-vps/${out}.mjs") bytes)"
done
echo "Deploy: salin file ini + node runtime ke VPS (tanpa node_modules)."
