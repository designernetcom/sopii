import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/*
 * Test config, kept out of vite.config.ts so the build config stays a build
 * config. Vitest reads this file in preference to that one, which means the
 * `@` alias has to be repeated here — without it every module that imports
 * through `@/` fails to resolve under test but builds fine.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
