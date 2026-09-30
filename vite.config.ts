/// <reference types="vitest/config" />
// vite.config.ts — owner: S. TECH §1.4 + ARCHITECTURE §1.3. index.html is the only build input.
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
