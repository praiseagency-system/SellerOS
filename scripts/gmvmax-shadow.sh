#!/bin/zsh
# Wrapper SHADOW: bundle worker deterministik (rantai xlsx) lalu jalankan. Meneruskan
# exit code worker (PARTIAL/FAILED/AUTH_REQUIRED → non-zero). VPS-ready: butuh
# Node + token MCP (env GMVMAX_MCP_TOKEN/GMVMAX_MCP_URL, atau Keychain di macOS).
#
# Contoh:
#   zsh scripts/gmvmax-shadow.sh --mode shadow --date 2026-07-08
#   zsh scripts/gmvmax-shadow.sh --mode shadow --from 2026-07-01 --to 2026-07-08
#   zsh scripts/gmvmax-shadow.sh --mode shadow --advertiser 7313535999831769090 --date yesterday
#   zsh scripts/gmvmax-shadow.sh --mode shadow --all-advertisers --from 2026-07-01 --to 2026-07-08
cd /Users/macbook/claude/tools/shopee-quadrant || exit 1
BUNDLE=src/gmvmax/.worker.bundle.mjs
npx esbuild src/gmvmax/worker.mjs --bundle --platform=node --format=esm --packages=external --outfile="$BUNDLE" --log-level=error || exit 1
node "$BUNDLE" "$@"
CODE=$?
rm -f "$BUNDLE"
exit $CODE
