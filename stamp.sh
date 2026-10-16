#!/usr/bin/env bash
# Cache-busting: append ?v=<content hash> to every local asset reference in
# index.html and css/style.css, so browsers re-fetch exactly the files that changed.
#
#   ./stamp.sh          rewrite the references in place
#   ./stamp.sh --check  exit 1 if any reference is out of date (nothing is written)
set -euo pipefail
cd "$(dirname "$0")"

check=0
[[ "${1:-}" == "--check" ]] && check=1

hash() { sha1sum "$1" | cut -c1-8; }

# stamp <file> <dir the file's urls are relative to>
stamp() {
  local file=$1 base=$2 tmp
  tmp=$(mktemp)
  cp "$file" "$tmp"
  grep -oE '(href|src|url)\(?=?"[^"?#:]+\.(js|css|woff2)(\?v=[0-9a-f]*)?"' "$file" |
    grep -oE '"[^"]+"' | tr -d '"' | sort -u |
    while read -r ref; do
      local path=${ref%%\?*}
      [[ -f "$base/$path" ]] || { echo "missing: $base/$path (in $file)" >&2; exit 1; }
      local v; v=$(hash "$base/$path")
      sed -i "s#\"${path//./\\.}\(?v=[0-9a-f]*\)\?\"#\"$path?v=$v\"#g" "$tmp"
    done
  if cmp -s "$file" "$tmp"; then
    rm "$tmp"
  elif ((check)); then
    rm "$tmp"; echo "out of date: $file (run ./stamp.sh)" >&2; return 1
  else
    mv "$tmp" "$file"; echo "stamped $file"
  fi
}

# The stylesheet first: its own hash changes when the font's stamp does.
stamp css/style.css css
stamp index.html .
