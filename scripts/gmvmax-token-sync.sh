#!/bin/zsh
# Sinkron token Keychain(Mac)→VPS env shadow. HANYA setelah OLD sukses. Tak cetak token.
# Update HANYA field token (all-or-nothing di VPS). Tak start worker, tak enable timer,
# tak sentuh kanonik. BatchMode+ConnectTimeout, sudo -n. Gagal-KERAS; state log eksplisit.
# Path VPS/log override-able (default = produksi) untuk dry-run test.
set -o pipefail
PROJ=/Users/macbook/claude; REPO="$PROJ/tools/shopee-quadrant"
NODE=/usr/local/bin/node; SSH=/usr/bin/ssh
TARGET_HOST="${GMVMAX_VPS_HOST:-selleros-vps}"
ENVFILE="${GMVMAX_VPS_ENVFILE:-/etc/selleros/gmvmax-shadow.env}"
UPDATER="${GMVMAX_VPS_UPDATER:-/opt/selleros/gmvmax-shadow/update-token.sh}"
OLDLOG="${GMVMAX_OLD_LOG:-$REPO/logs/gmvmax-sync.log}"
LOG="${GMVMAX_TOKENSYNC_LOG:-$REPO/logs/gmvmax-token-sync.log}"
TARGET="${GMVMAX_SYNC_DATE:-$(date -v-1d +%F)}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)          # req#5: non-interaktif + bounded
TS(){ date '+%F %T'; }
exec >> "$LOG" 2>&1
echo "===== $(TS) token-sync START target=$TARGET host=$TARGET_HOST env=$ENVFILE ====="

# (1) Gate: OLD SUKSES utk TARGET. Kalau tidak → JANGAN sync.
if ! tail -80 "$OLDLOG" 2>/dev/null | grep -q "SUCCESS gmvmaxsync target=$TARGET"; then
  echo "===== $(TS) token-sync SKIP reason=OLD_NOT_SUCCESS target=$TARGET exit=20 ====="; exit 20
fi

# (2) Emit (validasi+gate shadow-survival) | ssh sudo -n updater. Token via STDIN.
"$NODE" "$REPO/scripts/gmvmax-token-emit.mjs" | "$SSH" "${SSH_OPTS[@]}" "$TARGET_HOST" "sudo -n $UPDATER '$ENVFILE'"
PIPES=("${pipestatus[@]}")                                # req#1: tangkap SEGERA
EMIT_RC="${PIPES[1]}"; SSH_RC="${PIPES[2]}"

if [ "$EMIT_RC" -eq 7 ]; then
  echo "===== $(TS) token-sync FAILED reason=TOKEN_TOO_SHORT_FOR_SHADOW_RUN exit=7 ====="
  echo "----- Perlu re-auth manual: /mcp → Authenticate (tiktok-ads) di Mac. VPS env TIDAK diubah. -----"; exit 7
fi
[ "$EMIT_RC" -eq 0 ] || { echo "===== $(TS) token-sync FAILED reason=TOKEN_EMIT emit_rc=$EMIT_RC exit=4 ====="; exit 4; }
[ "$SSH_RC" -ne 255 ] || { echo "===== $(TS) token-sync FAILED reason=SSH_FAILED ssh_rc=255 exit=5 ====="; exit 5; }
[ "$SSH_RC" -eq 0 ] || { echo "===== $(TS) token-sync FAILED reason=VPS_UPDATE_FAILED updater_rc=$SSH_RC exit=6 ====="; exit 6; }

# (3) Verify redacted (tanpa token; tak start worker).
STATE=$("$SSH" "${SSH_OPTS[@]}" "$TARGET_HOST" "sudo -n awk -F= '/^GMVMAX_MCP_EXPIRES_AT=/{e=\$2} /^GMVMAX_MCP_TOKEN=/{t=length(\$2)} END{print e\" \"t}' '$ENVFILE'") || {
  echo "===== $(TS) token-sync FAILED reason=POST_VERIFY_SSH exit=6 ====="; exit 6; }
EXP_MS=${STATE% *}; TOKLEN=${STATE#* }
REM_MIN=$(( (EXP_MS - $(date +%s)*1000) / 60000 ))
if [ -z "$TOKLEN" ] || [ "$TOKLEN" -lt 1 ] || [ "$REM_MIN" -le 0 ]; then
  echo "===== $(TS) token-sync FAILED reason=POST_VERIFY toklen=$TOKLEN remaining_min=$REM_MIN exit=6 ====="; exit 6
fi
echo "===== $(TS) token-sync SUCCESS target=$TARGET remaining_min=$REM_MIN token_present=yes(len=$TOKLEN) ====="
exit 0
