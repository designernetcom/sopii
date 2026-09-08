import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    open: false,
    /*
     * Proxies the admin panel's `/api` calls to the Express server, so the
     * browser sees one origin and CORS never enters the picture in dev.
     * Override the target with API_PROXY_TARGET when the API runs elsewhere.
     */
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    /*
     * Lowered from 1200 KB, which was high enough that the 422 KB recharts
     * chunk never triggered it. A budget nothing can exceed is not a budget.
     */
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        /*
         * WHY THE FUNCTION FORM, NOT `{ charts: ['recharts'] }`
         * -------------------------------------------------------------------
         * The object form names a package and asks Rollup to give it a chunk.
         * Vite then treats that chunk as part of the entry's graph and emits a
         * `<link rel="modulepreload">` for it in index.html — so **recharts,
         * 422 KB of it, was being preloaded on every page load of the panel,
         * including the login screen**, despite only two lazily-routed pages
         * importing it. A user signing in downloaded a charting library before
         * the password field appeared.
         *
         * The function form assigns modules to chunks by inspecting each id,
         * and leaves reachability to Rollup — so recharts lands in its own
         * chunk that is fetched when the dashboard route is, and not before.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;

          /* The trailing separator matters: without it `react` also matches
             `react-hook-form` and `react-redux`, which pulls them into the one
             chunk every page loads. */
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(
              id,
            )
          ) {
            return 'react';
          }
          if (/[\\/]node_modules[\\/](@reduxjs[\\/]toolkit|react-redux|redux|immer|reselect)[\\/]/.test(id)) {
            return 'redux';
          }
          /* Recharts and the d3 packages it is built from — one lazy chunk. */
          if (/[\\/]node_modules[\\/](recharts|d3-|victory-|internmap|decimal\.js)/.test(id)) {
            return 'charts';
          }
          if (/[\\/]node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/.test(id)) {
            return 'forms';
          }

          /*
           * Everything else gets a chunk of its own rather than `undefined`.
           *
           * `undefined` hands the decision back to Rollup, which groups modules
           * by which entries reach them — and it put `clsx` (imported by
           * `utils/cn`, which every component uses) into the *charts* chunk,
           * because charts was the largest group that also reached it. The
           * result: 422 KB of recharts became a static dependency of the entry
           * and was preloaded on every page load of the panel, login screen
           * included.
           *
           * Naming a `vendor` chunk keeps the small shared libraries — clsx,
           * tailwind-merge, lucide-react — out of the lazy ones, which is what
           * lets charts stay lazy.
           */
          return 'vendor';
        },
      },
    },
  },
});
