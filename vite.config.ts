import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the same build loads from a web server or from file:// inside the desktop app.
  base: './',
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'electron/**/*.test.ts'] },
});
