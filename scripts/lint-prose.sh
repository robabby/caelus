#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v vale >/dev/null 2>&1; then
  echo "vale not found — install: brew install vale (https://vale.sh)"
  exit 1
fi

vale sync >/dev/null

FAIL=0
echo "→ Vale on editorial guides"
vale docs/editorial-voice.md docs/ai-slop-style-sheet.md || FAIL=1

echo ""
echo "→ Extract + Vale on apps/web copy"
node scripts/extract-web-prose.mjs
vale .web-prose-extract.md || FAIL=1

echo ""
echo "→ Vale on package READMEs + agent docs"
vale packages/caelus/README.md packages/birth/README.md packages/wheel/README.md docs/agents.md templates/starter/README.md || FAIL=1

echo ""
echo "→ Vale on repo design docs"
vale README.md docs/gap-analysis.md docs/releasing.md || FAIL=1

exit "$FAIL"
