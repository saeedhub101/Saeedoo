import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Unit-test runner. Tests live in test/unit and exercise the pure logic that
// guards Saeed's core behavior (animation gating, settings defaults, sprite
// geometry, the tool-call parser). The Electron module is aliased to a stub
// (test/mocks/electron.ts) so main-process modules import cleanly under Node.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      electron: resolve(__dirname, 'test/mocks/electron.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    globals: false,
    reporters: 'default',
  },
});
