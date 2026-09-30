import { defineConfig } from '@playwright/test';

// End-to-end smoke tests. These launch the *built* Electron app (out/main),
// not dev, so they exercise the same file:// asset loading a real install uses.
// Run `npm run build` (and `npm run assets`) first; the npm test:e2e script
// chains them.
export default defineConfig({
  testDir: './test/e2e',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
});
