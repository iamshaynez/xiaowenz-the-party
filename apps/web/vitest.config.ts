import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@party/protocol',
        replacement: fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url)),
      },
      {
        find: '@party/games',
        replacement: fileURLToPath(new URL('../../packages/games/src/index.ts', import.meta.url)),
      },
      // 测试文件位于仓库根 tests/ui，向上解析不到工作区内的 three；指回本包依赖。
      // 用正则精确匹配主入口，不影响 three/addons/* 等子路径按源码位置解析。
      {
        find: /^three$/,
        replacement: fileURLToPath(new URL('./node_modules/three/build/three.module.js', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    include: ['../../tests/ui/**/*.test.tsx'],
    setupFiles: ['../../tests/ui/setup.ts'],
    css: true,
  },
});
