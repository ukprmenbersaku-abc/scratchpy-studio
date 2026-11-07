import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_APP_BASE || '/',
  plugins: [react(), {
    name: 'scratchpy-page-metadata',
    // Match Pages' directory canonicalization: Vite otherwise serves the root
    // SPA for slashless edition paths such as /en and /education/en.
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (['/en', '/education', '/education/en'].includes(url.pathname)) {
          res.statusCode = 308;
          res.setHeader('Location', `${url.pathname}/${url.search}`);
          res.end();
          return;
        }
        next();
      });
    },
    transformIndexHtml(html) {
      const en = process.env.VITE_APP_LANGUAGE === 'en';
      const education = process.env.VITE_APP_EDUCATION === 'true';
      const title = education ? (en ? 'ScratchPy Education — From blocks to code' : 'ScratchPy Education — ブロックからコードへ') : (en ? 'ScratchPy Studio — Scratch and ScratchPy converter' : 'ScratchPy Studio — .sb3 ⇔ ScratchPy 相互変換');
      return html.replace('<html lang="ja">', `<html lang="${en ? 'en' : 'ja'}">`).replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
    },
  }],
  // Avoid dependency-cache races when both language servers start together.
  cacheDir: process.env.VITE_APP_EDUCATION === 'true' ? (process.env.VITE_APP_LANGUAGE === 'en' ? 'node_modules/.vite-education-en' : 'node_modules/.vite-education') : process.env.VITE_APP_LANGUAGE === 'en' ? 'node_modules/.vite-en' : 'node_modules/.vite-ja',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
