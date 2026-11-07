#!/usr/bin/env bash
# Restore dependencies if needed; keep the Education server in the foreground.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x node_modules/.bin/vite ]] || ! node -e "require.resolve('react-markdown'); require.resolve('blockly')" >/dev/null 2>&1; then
  echo 'Restoring dependencies with npm ci...'
  npm ci --no-audit --no-fund
fi
exec npm run dev:education:en
