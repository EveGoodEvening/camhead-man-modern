// playwright.config.ts — owner: S. Optional @playwright/test runner for later pixel baselines in e2e/ (TECH §7.2).
// The primary harness is scripts/smoke.mjs (2-slot browser semaphore); this config is for `npx playwright test` only.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  workers: 1,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2 } },
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npx vite build --outDir .smoke/dist --emptyOutDir && npx vite preview --outDir .smoke/dist --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
