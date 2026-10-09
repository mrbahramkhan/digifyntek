#!/usr/bin/env bash
# Sync phase1 UI → docs/ for GitHub Pages
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -rf docs
mkdir -p docs
cp -a phase1/. docs/
touch docs/.nojekyll
echo "Synced phase1 → docs/"
echo "Next: git add docs && git commit -m \"Sync docs for GitHub Pages\" && git push"
