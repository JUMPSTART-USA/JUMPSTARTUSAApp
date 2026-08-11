import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Separate from vite.config.ts on purpose.
 *
 * The web app had no tests at all, so root `pnpm test` exercised only the API
 * and packages/shared — and tsc cannot see what actually breaks in here: a
 * dropped history entry, an error boundary that never resets, a boolean prop
 * wired to the wrong boolean. That behaviour shipped on inspection alone.
 *
 * Why not a `test` block inside vite.config.ts: vitest 2 (the version apps/api
 * already pins) bundles Vite 5's types while this app builds on Vite 6, so
 * vitest/config's `defineConfig` types the react plugin against the wrong Vite
 * and the config stops typechecking. Keeping the two files apart means the build
 * config keeps Vite 6's types and the test config keeps vitest's.
 *
 * No @vitejs/plugin-react here: it exists for Fast Refresh, which tests do not
 * use. esbuild compiles the JSX from tsconfig's `jsx: react-jsx`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Same as the build: consume shared source, not its dist.
      '@jumpstart/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  define: { __BUILD_ID__: JSON.stringify('test') },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
