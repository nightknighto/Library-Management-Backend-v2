/// <reference types="vitest/globals" />

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Enables Jest-like global test APIs (describe, it, expect)
    globals: true, 
    // Set to 'node' if this is a pure backend ESM project
    environment: 'node', 
    include: ['tests/core/**/*.test.ts', 'tests/core/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});