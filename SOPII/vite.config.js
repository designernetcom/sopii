import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(process.cwd(), 'src') },
  },
  server: {
    /*
     * 5174, not 5173: the admin panel in ../SOPI-Admin takes 5173, and the two
     * are usually running side by side.
     */
    port: 5174,
    open: false,
    /*
     * Proxies `/api` and `/media` to the admin panel's Express server, so the
     * browser only ever talks to one origin in dev. `/media` is where product,
     * category and banner photography is served from — the same directory the
     * panel reads. Override the target with API_PROXY_TARGET when the API runs
     * elsewhere.
     */
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/media': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      /*
       * Crawlers look for these at the site root, but they are generated from
       * what the admin panel publishes, so the API owns them. Proxying keeps
       * them on the shop's own origin — which is the only origin a crawler
       * will accept them from. Production needs the equivalent rule on the
       * host serving the built site; see docs/SEO.md.
       *
       * `/sitemap-` covers the chunked children of the sitemap index: a large
       * catalogue cannot be described by one file, so /sitemap.xml is now an
       * index pointing at /sitemap-products-1.xml and friends.
       */
      '/sitemap.xml': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '^/sitemap-.*\\.xml$': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/robots.txt': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    /*
     * Raised from es2020. Every browser that supports ES modules at all — which
     * is the only kind Vite ships to — has supported optional chaining, nullish
     * coalescing and `Promise.allSettled` since 2020. Targeting es2020 made
     * esbuild down-compile `??=`, `?.` and class fields into larger, slower
     * equivalents for browsers that do not exist in the traffic.
     */
    target: 'es2022',
    cssCodeSplit: true,
    /*
     * Source maps are not shipped, but they are generated so a production stack
     * trace can be symbolicated. Upload them to the error tracker and keep them
     * out of the public bundle — `hidden` emits the files without the
     * `//# sourceMappingURL` comment that would make a browser fetch them.
     */
    sourcemap: 'hidden',
    /*
     * The default is 4 KB, which inlines small images as base64 data URIs. That
     * looks like a saving and is not: an inlined asset cannot be cached
     * separately, cannot be served by the CDN, and is ~33% larger as base64
     * inside a JavaScript bundle that must be parsed before anything paints.
     * Everything goes to a file.
     */
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        /*
         * Chunking by *what changes together*, not by package name.
         *
         * The previous config listed `icons: ['lucide-react']`, which is a
         * shape worth keeping — it gives the icon set one long-lived cache
         * entry shared by every route — but naming packages one at a time
         * means a new dependency silently lands in the main chunk. A function
         * splits on the real axis instead: the framework changes on a React
         * upgrade, the form/validation stack changes on its own schedule, and
         * everything else is application code that changes on every deploy.
         *
         * The point is cache lifetime. A shopper who visits twice a week
         * re-downloads only the application chunk; React and zod stay in the
         * browser cache across deploys.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          /*
           * The trailing separator is load-bearing. Without it the `react`
           * alternative also matches `react-hook-form` and `react-is`, which
           * quietly drags the form stack into the framework chunk — the one
           * chunk on the critical path of every page, including the pages with
           * no forms on them. Anchoring each name to a directory boundary is
           * what keeps the split meaning what it says.
           */
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(
              id,
            )
          ) {
            return 'react';
          }
          if (/[\\/]node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/.test(id)) {
            return 'forms';
          }
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) {
            return 'icons';
          }
          return 'vendor';
        },
      },
    },
    /*
     * A budget, not a suggestion. §8 asks for a low JavaScript bundle; a
     * warning at the default 500 KB is far too late to notice a regression, and
     * 250 KB uncompressed is roughly 80 KB over the wire — about the size of
     * the largest chunk this app should ever ship.
     */
    chunkSizeWarningLimit: 250,
  },
});
