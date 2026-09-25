/**
 * Build de la page de test golden.
 *
 * `root` = resume-forge/ (comme la config de l'app) pour que Tailwind scanne
 * les mêmes sources et produise le même CSS. Seuls les 3 modules Tauri
 * utilisés par src/lib/export-pdf.ts sont remplacés.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');
const mocks = path.resolve(__dirname, 'harness/tauri-mocks');

export default defineConfig({
  root: projectRoot,
  base: './',
  logLevel: 'warn',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@tauri-apps\/api\/core$/, replacement: `${mocks}/core.ts` },
      { find: /^@tauri-apps\/plugin-dialog$/, replacement: `${mocks}/dialog.ts` },
      { find: /^@tauri-apps\/plugin-fs$/, replacement: `${mocks}/fs.ts` },
      { find: '@', replacement: path.resolve(projectRoot, 'src') },
    ],
  },
  build: {
    outDir: path.resolve(__dirname, '.out/harness-dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 10_000,
    rollupOptions: { input: path.resolve(__dirname, 'harness/index.html') },
  },
});
