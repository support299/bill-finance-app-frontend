#!/usr/bin/env bash
# One-command frontend deploy:  npm run deploy
#   1. builds the app against your production API URL
#   2. packs dist/ into ONE tarball and sends it with scp (one file = one round trip, ~8x faster than copying 60+ files)
#   3. unpacks it into a fresh release folder, atomically switches the `current` symlink (nginx serves it),
#      and keeps only the newest KEEP_RELEASES releases so disk use stays tiny
# One SSH connection is opened and reused for every step (the handshake is slow from far away).
# Settings come from .deploy.env (see .deploy.env.example) or the environment. DRY_RUN=1 prints instead of connecting.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .deploy.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.deploy.env
  set +a
fi

: "${DEPLOY_HOST:?Set DEPLOY_HOST in .deploy.env (the EC2 public IP or domain)}"
: "${API_BASE_URL:?Set API_BASE_URL in .deploy.env, e.g. https://app.example.com/api/v1}"
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/imax}"
DEPLOY_KEY="${DEPLOY_KEY:-}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"

CONTROL_PATH="/tmp/imax-deploy-%C"   # short on purpose: unix sockets are limited to ~104 characters
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30
          -o ControlMaster=auto -o "ControlPath=$CONTROL_PATH" -o ControlPersist=120)
if [ -n "$DEPLOY_KEY" ]; then
  DEPLOY_KEY="${DEPLOY_KEY/#\~/$HOME}"
  [ -f "$DEPLOY_KEY" ] || { echo "SSH key not found: $DEPLOY_KEY" >&2; exit 1; }
  SSH_OPTS+=(-i "$DEPLOY_KEY")
fi
TARGET="$DEPLOY_USER@$DEPLOY_HOST"
RELEASE="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="$DEPLOY_PATH/releases/$RELEASE"
REMOTE_TGZ="/tmp/imax-dist-$RELEASE.tgz"
LOCAL_TGZ="$(mktemp "${TMPDIR:-/tmp}/imax-dist.XXXXXX")"

cleanup() {
  rm -f "$LOCAL_TGZ"
  [ "${DRY_RUN:-}" = "1" ] || ssh "${SSH_OPTS[@]}" -O exit "$TARGET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

run() { if [ "${DRY_RUN:-}" = "1" ]; then echo "[dry-run] $*"; else "$@"; fi; }

echo "==> Building (API: $API_BASE_URL)"
VITE_API_BASE_URL="$API_BASE_URL" npm run build
[ -f dist/index.html ] || { echo "Build did not produce dist/index.html" >&2; exit 1; }

echo "==> Packing dist/ ($(find dist -type f | wc -l | tr -d ' ') files)"
# --no-xattrs drops macOS metadata that would make the server's tar print warnings (falls back if unsupported)
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$LOCAL_TGZ" -C dist . 2>/dev/null || COPYFILE_DISABLE=1 tar -czf "$LOCAL_TGZ" -C dist .
echo "    $(du -h "$LOCAL_TGZ" | cut -f1) tarball"

echo "==> Uploading to $TARGET"
run scp -q "${SSH_OPTS[@]}" "$LOCAL_TGZ" "$TARGET:$REMOTE_TGZ"

echo "==> Activating release $RELEASE"
run ssh "${SSH_OPTS[@]}" "$TARGET" "set -e
  mkdir -p '$RELEASE_DIR'
  tar xzf '$REMOTE_TGZ' -C '$RELEASE_DIR'
  rm -f '$REMOTE_TGZ'
  test -f '$RELEASE_DIR/index.html'
  ln -sfn '$RELEASE_DIR' '$DEPLOY_PATH/current.tmp'
  mv -Tf '$DEPLOY_PATH/current.tmp' '$DEPLOY_PATH/current'
  cd '$DEPLOY_PATH/releases' && ls -1dt */ | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf
  echo \"    releases kept: \$(ls -1 '$DEPLOY_PATH/releases' | wc -l), disk used: \$(du -sh '$DEPLOY_PATH/releases' | cut -f1)\""

echo "==> Done. Live at: ${API_BASE_URL%/api/v1}"
