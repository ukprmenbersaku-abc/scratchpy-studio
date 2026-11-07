/** Build all four independent Vite editions into one Cloudflare Pages site. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
// Parent directories must be built before children because Vite clears each output directory.
const editions = [
  {name:'Studio 日本語', output:'dist', base:'/', language:'ja', education:'false'},
  {name:'Studio English', output:'dist/en', base:'/en/', language:'en', education:'false'},
  {name:'Education 日本語', output:'dist/education', base:'/education/', language:'ja', education:'true'},
  {name:'Education English', output:'dist/education/en', base:'/education/en/', language:'en', education:'true'},
];
for (const edition of editions) {
  console.log(`\n==> ${edition.name} → ${edition.output} (base ${edition.base})`);
  const env = {...process.env, VITE_APP_LANGUAGE:edition.language, VITE_APP_EDUCATION:edition.education, VITE_APP_BASE:edition.base, VITE_PAGES_MULTISITE:'true'};
  execFileSync(process.execPath, [vite, 'build', '--outDir', edition.output], {cwd:root, env, stdio:'inherit'});
}
console.log('\nAll four editions are ready in dist/.');
