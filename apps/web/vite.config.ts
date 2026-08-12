import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// Identifies the built bundle. CI passes the commit; local builds get a
// timestamp. Compiled into the app AND emitted as /version.txt so a running
// client can tell whether a newer build has been deployed (see
// src/lib/build-version.ts).
const BUILD_ID = process.env.GITHUB_SHA ?? `dev-${Date.now()}`;

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    {
      name: 'emit-build-id',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.txt', source: BUILD_ID });
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        /**
         * Keep the framework in a chunk of its own, separate from app code.
         *
         * FUNCTION form, not the `{ name: [ids] }` form: under pnpm,
         * react-router, @remix-run/router and scheduler are TRANSITIVE and not
         * resolvable from apps/web, and the object form treats every id as an
         * entry module — the build dies outright with "Could not resolve entry
         * module react-router". Matching by path is the only thing that works.
         *
         * Why these eight and no more: they are the only dependencies every
         * route needs and that the entry already imports statically, so
         * grouping them costs nothing on first load — measured at 466,486 raw /
         * 144,642 gzip with the split against 467,822 / 144,738 without. The
         * real win is CACHING: build-version.ts reloads clients as soon as a new
         * BUILD_ID is served, so users re-fetch the entry on every deploy, and
         * this keeps half the critical path out of that.
         *
         * Do NOT extend the group. Coarser vendor-ui (radix + lucide + cva),
         * vendor-forms (react-hook-form + zod) and vendor-date groups measured
         * 69,838 raw / 20,283 gzip WORSE, because the entry needs a slice of
         * each group and the group drags in the rest.
         *
         * The one measured exception, if request count ever matters more than
         * first-load bytes: adding 'lucide-react' here costs +2,270 gzip on the
         * critical path but collapses 54 chunks to 43 and sub-1KB chunks from 18
         * to 9 — those are single icons shared between module chunks.
         */
        manualChunks(id: string) {
          if (!id.includes('/node_modules/')) return undefined;
          const inPkg = (...names: string[]) =>
            names.some((name) => id.includes(`/node_modules/${name}/`));
          return inPkg(
            'react',
            'react-dom',
            'scheduler',
            'react-router',
            'react-router-dom',
            '@remix-run/router',
            '@tanstack/react-query',
            '@tanstack/query-core',
          )
            ? 'vendor-core'
            : undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Consume shared source directly in dev — no rebuild loop while editing
      '@jumpstart/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Same-origin /api in dev; production nginx does the same (§4)
      '/api': { target: 'http://localhost:3001', changeOrigin: false },
    },
  },
});
