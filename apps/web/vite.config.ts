import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
