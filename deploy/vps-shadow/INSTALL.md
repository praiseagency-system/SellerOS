# GMV Max VPS SHADOW — Install Runbook (Stage 3)

**Status: TURNKEY BUNDLE (belum di-deploy).** Klasifikasi tetap **B. LOCAL VPS-SHADOW
READY** sampai langkah 3.7/3.8/3.9 LULUS di host nyata.

**Invarian keras (jangan dilanggar):** OLD LLM workflow = satu-satunya penulis kanonik
produksi. Worker Node = shadow-only. Nol import/panggilan RPC kanonik (dibuktikan
`depgraph.test`). Tanpa mutasi snapshot produksi dari Node. Tanpa refresh OAuth tebakan.
Auth = **Opsi B** (token disuplai eksternal, ganti manual).

Model deploy: **satu file self-contained** `gmvmax-vps-shadow.mjs` (863 KB, supabase+xlsx
inline) + Node. **Tanpa node_modules, tanpa npx runtime.** systemd **oneshot + timer**
(bukan daemon) → tak ada restart-storm.

---

## 3.0 Build artefak (di mesin build / CI)
```bash
zsh scripts/gmvmax-vps-build.sh        # → dist-vps/gmvmax-vps-shadow.mjs (+ .sha256)
```
Uji lokal sebelum kirim (opsional, sudah terbukti di mac): jalankan dengan env vps.

## 3.1 Preflight host (WAJIB, GATE)
Di VPS, kumpulkan & tinjau — **STOP bila tak kompatibel**:
```bash
. /etc/os-release; echo "$PRETTY_NAME $(uname -m)"   # distro + arch
node -v                                              # WAJIB ada Node 20+ (bundle ESM)
systemctl --version | head -1                        # systemd
df -h /var /opt; findmnt -no FSTYPE /var             # disk + fs
timedatectl | grep -E 'Time zone'                    # tz mesin
systemd-analyze calendar '*-*-* 02:00:00 UTC'        # dukungan suffix UTC?
id; getent passwd | wc -l                            # users
curl -sS -o /dev/null -w '%{http_code}\n' https://business-api.tiktok.com   # egress MCP
curl -sS -o /dev/null -w '%{http_code}\n' "$SUPABASE_URL"                    # egress Supabase
```
Gate: Node ≥20 ada; egress MCP+Supabase OK; systemd aktif. Jika `systemd-analyze calendar
'... UTC'` gagal → `sudo timedatectl set-timezone UTC` dan pakai varian tanpa suffix di timer.

## 3.2 User layanan non-root
```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin selleros-worker
```
- tanpa sudo, tanpa login interaktif.
- baca bundle + env file; tulis HANYA ke state dir.

## 3.3 Layout filesystem
```bash
sudo install -d -o root -g root -m 0755 /opt/selleros/gmvmax
sudo install -o root -g root -m 0755 dist-vps/gmvmax-vps-shadow.mjs /opt/selleros/gmvmax/gmvmax-vps-shadow.mjs
sudo install -o root -g root -m 0644 deploy/vps-shadow/INSTALL.md /opt/selleros/gmvmax/INSTALL.md
sudo install -o root -g root -m 0755 deploy/vps-shadow/gmvmax-retention.sh /opt/selleros/gmvmax/gmvmax-retention.sh

sudo install -d -o root -g selleros-worker -m 0750 /etc/selleros
sudo install -d -o selleros-worker -g selleros-worker -m 0750 /var/lib/selleros/gmvmax-shadow
```
- **State di `/var/lib` (persisten lintas-deploy)** — ganti bundle di `/opt` TIDAK menghapus
  bukti parity. `runs/`, `index.jsonl`, `locks/` dibuat otomatis oleh worker.

## 3.4 Token segar (Opsi B) — WAJIB sebelum run terjadwal pertama
Token yang ada kini dekat kedaluwarsa → **jangan** deploy mengandalkannya.
1. Di mesin dev: `/mcp` → Authenticate `tiktok-ads` (dapat token baru di Keychain).
2. Ambil nilai (accessToken, serverUrl, expiresAt) — **jangan cetak ke layar/riwayat**.
3. Isi `/etc/selleros/gmvmax-shadow.env` tanpa jejak history:
```bash
sudo install -o root -g selleros-worker -m 0600 deploy/vps-shadow/gmvmax-shadow.env.example /etc/selleros/gmvmax-shadow.env
sudo -e /etc/selleros/gmvmax-shadow.env    # editor; tempel GMVMAX_MCP_TOKEN + expiry + Supabase key
```
4. Buktikan (sebagai user layanan, tanpa Keychain):
```bash
sudo -u selleros-worker env $(grep -v '^#' /etc/selleros/gmvmax-shadow.env | xargs) \
  node /opt/selleros/gmvmax/gmvmax-vps-shadow.mjs --date yesterday 2>&1 | grep -E 'RUNTIME_OK|MCP_TOKEN_VALID|RUN_SUMMARY'
```
Harus terlihat `keychainUsed:false`, `auth_state:AUTH_VALID` (token segar), expiry ter-parse.

## 3.5 Service (oneshot) & 3.6 Timer
```bash
sudo install -m 0644 deploy/vps-shadow/gmvmax-shadow.service /etc/systemd/system/
sudo install -m 0644 deploy/vps-shadow/gmvmax-shadow.timer   /etc/systemd/system/
sudo systemctl daemon-reload
```
Arti exit (terlihat di `systemctl status` / journald — **jangan sembunyikan non-zero**):

| exit | arti |
|---|---|
| 0 | SUCCESS |
| 1 | FAILED (termasuk DISK_FAILURE) |
| 3 | PARTIAL |
| 4 | AUTH_REQUIRED (token expired/401 → TIDAK menulis, bukan fake) |
| — | LOCKED → di-skip (run konkuren), tercatat `LOCK_CONTENTION` |

## 3.7 Run manual pertama (GATE)
```bash
sudo systemctl start gmvmax-shadow.service
journalctl -u gmvmax-shadow.service -n 40 --no-pager
```
Verifikasi: `keychainUsed:false`, `TZ_RESOLVED` (jakartaDate benar), `RUN_SUMMARY status:SUCCESS`,
`parity_status:MATCH`, `exit_code:0`, dan **kanonik tak berubah** (bandingkan count import/creative
di Supabase sebelum/sesudah). **MISMATCH → STOP, jangan enable timer.**

## 3.8 Bukti terminasi (kill-recovery) di VPS
```bash
# jalankan dgn hold agar bisa dibunuh mid-run
sudo -u selleros-worker env $(grep -v '^#' /etc/selleros/gmvmax-shadow.env|xargs) GMVMAX_TEST_HOLD_MS=15000 \
  node /opt/selleros/gmvmax/gmvmax-vps-shadow.mjs --date yesterday & PID=$!
sleep 3; ls /var/lib/selleros/gmvmax-shadow/locks/    # lock teramati
sudo kill -9 $PID                                     # bunuh mid-run
# verifikasi kanonik tak berubah; lock tertinggal (pid mati)
sudo systemctl start gmvmax-shadow.service            # rerun → reklamasi lock dead-pid
journalctl -u gmvmax-shadow.service -n 20 --no-pager  # RUN_SUMMARY MATCH, exit 0
```
Laporkan PID/signal/exit nyata.

## 3.9 Reboot survival (GATE, butuh reboot nyata)
```bash
sudo systemctl enable --now gmvmax-shadow.timer
systemctl list-timers gmvmax-shadow.timer --no-pager   # next trigger diketahui
sudo reboot
# setelah boot:
systemctl is-enabled gmvmax-shadow.timer               # enabled
systemctl list-timers gmvmax-shadow.timer --no-pager   # trigger berikut
ls -la /var/lib/selleros/gmvmax-shadow                 # state utuh, izin utuh
```

## 3.10 Observabilitas (journald)
Tiap run memancarkan JSON machine-readable (sudah ter-redaksi):
```bash
journalctl -u gmvmax-shadow.service -o cat | grep RUN_SUMMARY | tail -1
```
`RUN_SUMMARY` berisi: run_id, advertiser_id, snapshot_date, started_at, finished_at,
duration_ms, auth_state, campaign_count, page_count, raw_row_count, normalized_row_count,
parity_status, row_mismatch_count, status, exit_code.
Event alert-ready (grep `event`): `PARITY_MISMATCH`, `MCP_TOKEN_EXPIRING_WARNING`,
`MCP_TOKEN_EXPIRING_URGENT`, `MCP_AUTH_REQUIRED`, `RUN_PARTIAL`, `LOCK_CONTENTION`,
`DISK_FAILURE`. (Pengiriman alert belum diintegrasikan — event sudah machine-readable.)

## 3.11 Retensi
```bash
# mingguan (timer/cron terpisah); default 90 hari, min 30 dijaga; index.jsonl dipreservasi
sudo -u selleros-worker GMVMAX_SHADOW_DIR=/var/lib/selleros/gmvmax-shadow RETENTION_DAYS=90 \
  bash /opt/selleros/gmvmax/gmvmax-retention.sh
```
Ukuran run MATCH kecil (~KB); 90 hari × 1/hari ≈ ratusan KB. Ukur nyata pada run pertama.

## 3.12 Enable timer — HANYA setelah 3.7 MATCH + kanonik utuh + 3.8 + 3.9 lulus
```bash
sudo systemctl enable --now gmvmax-shadow.timer
```
OLD tetap penulis kanonik. Lalu jalankan gate **P3.9: 7–14 hari** sebelum mempertimbangkan cutover.

