#!/usr/bin/env bash
# Pulls the resume project from Overleaf (via Overleaf's Git integration),
# compiles it with tectonic, and replaces public/Krish_Bansal_Resume.pdf so
# the next build ships the latest version.
#
# Required env:
#   OVERLEAF_PROJECT_ID  the id in your project URL: overleaf.com/project/<id>
#   OVERLEAF_TOKEN       an Overleaf Git authentication token
# Optional env:
#   OVERLEAF_MAIN_FILE   the .tex file to compile (default: main.tex)
#   OVERLEAF_GIT_URL     override the clone URL (for local testing)
set -euo pipefail

: "${OVERLEAF_PROJECT_ID:?set OVERLEAF_PROJECT_ID}"
: "${OVERLEAF_TOKEN:?set OVERLEAF_TOKEN}"
main_file="${OVERLEAF_MAIN_FILE:-main.tex}"
url="${OVERLEAF_GIT_URL:-https://git.overleaf.com/${OVERLEAF_PROJECT_ID}}"
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Send the token as a header instead of embedding it in the URL, so it never
# lands in .git/config or in git's error messages.
auth="$(printf 'git:%s' "$OVERLEAF_TOKEN" | base64 | tr -d '\n')"
git -c http.extraHeader="Authorization: Basic ${auth}" \
  clone --quiet --depth 1 "$url" "$work/src"

if [ ! -f "$work/src/$main_file" ]; then
  echo "error: $main_file not found in the Overleaf project. .tex files present:" >&2
  (cd "$work/src" && find . -name '*.tex' -not -path './.git/*') >&2
  echo "Set the OVERLEAF_MAIN_FILE secret to the right file." >&2
  exit 1
fi

mkdir -p "$work/out"
(cd "$work/src" && tectonic "$main_file" --outdir "$work/out")
cp "$work/out/$(basename "${main_file%.tex}").pdf" "$root/public/Krish_Bansal_Resume.pdf"
echo "Resume updated from Overleaf ($main_file, commit $(git -C "$work/src" rev-parse --short HEAD))."
