#!/usr/bin/env bash
# In-place update field token ALLOWLIST dari stdin. Root only. ALL-OR-NOTHING: butuh
# ketiga field non-empty, else env TAK diubah. Preserve field lain; root:root 0600;
# atomik; trap bersihkan temp (isi rahasia) pada error; TIDAK mencetak nilai (token via stdin).
set -euo pipefail
ENV="${1:?env path required}"; [ -f "$ENV" ] || { echo "missing env: $ENV" >&2; exit 2; }
REQUIRED=(GMVMAX_MCP_TOKEN GMVMAX_MCP_URL GMVMAX_MCP_EXPIRES_AT)
ALLOW=" ${REQUIRED[*]} "
umask 077
declare -A NEW
while IFS='=' read -r k v; do
  [ -n "$k" ] || continue
  case "$ALLOW" in *" $k "*) : ;; *) echo "rejected key: $k" >&2; exit 3;; esac
  NEW["$k"]="$v"
done
for k in "${REQUIRED[@]}"; do                      # all-or-nothing
  { [ -n "${NEW[$k]+x}" ] && [ -n "${NEW[$k]}" ]; } || { echo "missing/empty field: $k" >&2; exit 4; }
done
TMP="$(mktemp "${ENV}.XXXXXX")"; chown root:root "$TMP" 2>/dev/null || true; chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT                            # cleanup on any failure
declare -A DONE
while IFS= read -r line || [ -n "$line" ]; do
  key="${line%%=*}"
  if [ -n "${NEW[$key]+x}" ]; then printf '%s=%s\n' "$key" "${NEW[$key]}" >> "$TMP"; DONE["$key"]=1
  else printf '%s\n' "$line" >> "$TMP"; fi
done < "$ENV"
for k in "${REQUIRED[@]}"; do [ -z "${DONE[$k]+x}" ] && printf '%s=%s\n' "$k" "${NEW[$k]}" >> "$TMP"; done
mv -f "$TMP" "$ENV"                                 # atomik
trap - EXIT                                         # clear trap setelah sukses
echo "updated_fields=${#REQUIRED[@]}"
