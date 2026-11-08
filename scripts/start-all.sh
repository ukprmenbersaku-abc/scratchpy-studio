#!/usr/bin/env bash
# Restore dependencies if needed and run all four previews in the foreground.
# Use a managed process / terminal; Ctrl-C stops all servers.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x node_modules/.bin/vite ]] || ! node -e "require.resolve('react-markdown'); require.resolve('blockly'); require.resolve('@turbowarp/scaffolding/with-music')" >/dev/null 2>&1; then
  echo 'Restoring dependencies with npm ci...'
  npm ci --no-audit --no-fund
fi
# Do not silently move ports or launch duplicates.
node --input-type=module <<'NODE'
import net from 'node:net';
for (const port of [5173, 5174, 5175, 5176]) {
  const free = await new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolve(true)));
  });
  if (!free) { console.error(`Port ${port} is already in use. Stop the existing server first.`); process.exit(1); }
}
NODE
cleanup() { trap - EXIT INT TERM; kill "${ja:-}" "${en:-}" "${edu:-}" "${eduen:-}" 2>/dev/null || true; wait 2>/dev/null || true; }
trap cleanup EXIT INT TERM
npm run dev:ja & ja=$!
npm run dev:en & en=$!
npm run dev:education & edu=$!
npm run dev:education:en & eduen=$!
printf '\nStarting ScratchPy Studio: Japanese :5173, English :5174, Education JP :5175, Education EN :5176\n'
wait -n "$ja" "$en" "$edu" "$eduen"
