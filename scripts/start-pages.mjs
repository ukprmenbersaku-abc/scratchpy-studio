/** Rebuild and launch the combined Pages-style preview, restoring dependencies if needed. */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const require = createRequire(path.join(root, 'package.json'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const port = Number(process.env.SCRATCHPY_PREVIEW_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('SCRATCHPY_PREVIEW_PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
const run = (args) => {
  const result = spawnSync(npm, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
};
const available = await new Promise(resolve => {
  const probe = net.createServer();
  probe.once('error', () => resolve(false));
  probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)));
});
if (!available) {
  console.error(`Port ${port} is already in use. Stop the existing server or set SCRATCHPY_PREVIEW_PORT.`);
  process.exit(1);
}
let dependenciesReady = existsSync(vite);
for (const name of ['react', 'react-dom', 'react-markdown', 'blockly', 'typescript', '@turbowarp/scaffolding/with-music']) {
  try { require.resolve(name); } catch { dependenciesReady = false; }
}
if (!dependenciesReady) {
  console.log('Restoring dependencies with npm ci...');
  run(['ci', '--no-audit', '--no-fund']);
}
console.log('Building all four editions...');
run(['run', 'build']);
console.log(`\nOpening combined preview on port ${port}. Use the edition menu or /, /en/, /education/, /education/en/.`);
const server = spawn(process.execPath, [vite, 'preview', '--host', '0.0.0.0', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.kill(signal); });
