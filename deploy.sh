#!/usr/bin/env bash
# Publish the game to https://iso3200.net/drive-challenge/ over FTPS.
#
#   ./deploy.sh            upload
#   ./deploy.sh --dry-run  show what would change, upload nothing
#
# Uses the rclone remote `ftp_iso3200.net`, which is rooted at the web root of the
# whole site, so the target must always stay the drive-challenge/ subfolder.
# The folder is mirrored: files deleted locally are deleted there too. Only the
# listed paths take part, so the records database and admin config in
# api/data/ (server only) are never touched.
set -euo pipefail
cd "$(dirname "$0")"

REMOTE="ftp_iso3200.net:drive-challenge"
URL="https://iso3200.net/drive-challenge/"

dry=()
[[ "${1:-}" == "--dry-run" ]] && dry=(--dry-run)

./stamp.sh --check

if [[ -n "$(git status --porcelain -- index.html css js fonts api)" ]]; then
  echo "warning: uncommitted changes in the game files; deploying the working copy" >&2
fi

rclone sync . "$REMOTE" "${dry[@]}" -v --checkers 1 --transfers 1 \
  --include "/index.html" --include "/css/**" --include "/js/**" --include "/fonts/**" \
  --include "/api/*.php" --include "/api/data/.htaccess" \
  2>&1 | grep -E "Copied|Deleted|Updated|Skipped|ERROR|NOTICE|There was nothing" | grep -vE "NOTICE: *$" || true

if ((${#dry[@]} == 0)); then
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL")
  [[ "$code" == 200 ]] || { echo "error: $URL returned HTTP $code" >&2; exit 1; }
  echo "deployed $(git rev-parse --short HEAD) to $URL"
fi
