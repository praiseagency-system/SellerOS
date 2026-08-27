#!/usr/bin/env bash
# GMV Max VPS — setup idempoten (jalankan di VPS dgn sudo).
# Melakukan langkah 3.1–3.6 runbook: preflight, Node 20+, user layanan, layout
# filesystem, pasang bundle + unit systemd. SENGAJA TIDAK meng-enable timer —
# aktivasi hanya setelah run manual pertama lulus (gerbang 3.7).
set -euo pipefail

SRC="${1:-/tmp/gmvmax-deploy}"   # direktori hasil scp (bundle + unit + env example)
say() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
ok()  { printf '   \033[32m✓\033[0m %s\n' "$*"; }
die() { printf '   \033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

say "1/6 Preflight host"
. /etc/os-release; echo "   OS: $PRETTY_NAME ($(uname -m))"
systemctl --version >/dev/null 2>&1 || die "systemd tidak ada"
ok "systemd aktif"
for host in https://business-api.tiktok.com https://supabase.com; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "$host" || echo 000)
  [ "$code" = "000" ] && die "egress ke $host GAGAL" || ok "egress $host ($code)"
done

say "2/6 Node.js 20+"
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  ok "sudah ada: $(node -v)"
else
  echo "   memasang Node 20 (NodeSource)…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null
  ok "terpasang: $(node -v)"
fi

say "3/6 User layanan non-root"
if id selleros-worker >/dev/null 2>&1; then ok "selleros-worker sudah ada"
else useradd --system --no-create-home --shell /usr/sbin/nologin selleros-worker; ok "selleros-worker dibuat"; fi

say "4/6 Layout filesystem"
install -d -o root -g root -m 0755 /opt/selleros/gmvmax
install -d -o root -g selleros-worker -m 0750 /etc/selleros
install -d -o selleros-worker -g selleros-worker -m 0750 /var/lib/selleros/gmvmax
ok "/opt/selleros/gmvmax · /etc/selleros · /var/lib/selleros/gmvmax"

say "5/6 Pasang bundle worker"
[ -f "$SRC/gmvmax-vps-commit.mjs" ] || die "bundle tak ditemukan di $SRC"
install -o root -g root -m 0755 "$SRC/gmvmax-vps-commit.mjs" /opt/selleros/gmvmax/gmvmax-vps-commit.mjs
[ -f "$SRC/gmvmax-vps-shadow.mjs" ] && install -o root -g root -m 0755 "$SRC/gmvmax-vps-shadow.mjs" /opt/selleros/gmvmax/gmvmax-vps-shadow.mjs || true
[ -f "$SRC/INSTALL.md" ] && install -o root -g root -m 0644 "$SRC/INSTALL.md" /opt/selleros/gmvmax/INSTALL.md || true
ok "bundle: $(sha256sum /opt/selleros/gmvmax/gmvmax-vps-commit.mjs | cut -c1-16)…"

# env: hanya buat kerangka bila belum ada (rahasia diisi terpisah, bukan di sini)
if [ ! -f /etc/selleros/gmvmax.env ]; then
  install -o root -g selleros-worker -m 0640 "$SRC/gmvmax.env.example" /etc/selleros/gmvmax.env
  ok "env kerangka dibuat (BELUM terisi — isi GMVMAX_SUPABASE_URL & _KEY)"
else ok "env sudah ada — tidak ditimpa"; fi

say "6/6 Unit systemd"
install -m 0644 "$SRC/gmvmax-commit.service" /etc/systemd/system/gmvmax-commit.service
install -m 0644 "$SRC/gmvmax-commit.timer"   /etc/systemd/system/gmvmax-commit.timer
systemctl daemon-reload
ok "unit terpasang + daemon-reload"

cat <<'NEXT'

── LANGKAH BERIKUTNYA (manual, sengaja tidak diotomatiskan) ─────────────────
1. Isi rahasia:   sudo -e /etc/selleros/gmvmax.env   → GMVMAX_SUPABASE_URL & GMVMAX_SUPABASE_KEY
2. Uji run manual (GERBANG):
     sudo systemctl start gmvmax-commit.service
     journalctl -u gmvmax-commit.service -n 50 --no-pager
   Cari: TOKEN_SOURCE · COMMIT_WRITTEN · RUN_SUMMARY status:SUCCESS exit_code:0
3. Baru aktifkan jadwal harian (07:30 WIB):
     sudo systemctl enable --now gmvmax-commit.timer
     systemctl list-timers gmvmax-commit.timer
NEXT
