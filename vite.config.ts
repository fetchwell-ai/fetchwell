import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string };
const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [tailwindcss(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  build: {
    outDir: '../../dist-renderer',
    emptyOutDir: true,
  },
});
