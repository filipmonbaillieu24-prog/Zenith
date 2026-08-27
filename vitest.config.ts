import path from 'path';

// Each app resolves @zenith/shared through its own vite.config.ts alias. Running
// the suite from the repo root goes through none of them, so any test reaching
// shared code failed to resolve it and its file was reported as a failed suite
// with zero tests - which reads like an empty file rather than a broken import.
//
// Plain object rather than defineConfig from 'vitest/config': vitest is not a
// dependency of this repo, so that import is not resolvable from here.
export default {
  resolve: {
    alias: {
      '@zenith/shared': path.resolve(__dirname, 'shared/index.ts')
    }
  },
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'shared/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**']
  }
};
