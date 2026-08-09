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
