import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS relies on emitDecoratorMetadata, which esbuild (vitest's default
// transformer) cannot emit — SWC handles the transform for tests.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
  plugins: [
    swc.vite({
      module: { type: 'commonjs' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
    }),
  ],
});
