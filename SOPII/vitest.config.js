import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/*
 * Test config, kept out of vite.config.js so the build config stays a build
 * config. Vitest reads this file in preference to that one.
 *
 * `environment: 'jsdom'` is needed by the component tests only; the utility
 * tests are pure and would run fine in node. Running everything in jsdom costs
 * a fraction of a second and avoids per-file environment annotations.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
  },
});
