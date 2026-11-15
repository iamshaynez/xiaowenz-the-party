import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@party/protocol': fromRoot('./packages/protocol/src/index.ts'),
      '@party/game-core': fromRoot('./packages/game-core/src/index.ts'),
      '@party/games': fromRoot('./packages/games/src/index.ts'),
      '@party/room': fromRoot('./packages/room/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/{business,network}/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['apps/server/src/**', 'packages/*/src/**'],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
