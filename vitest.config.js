import { defineConfig } from 'vitest/config'

// Pure-module unit tests only (no DOM, no network). Keeps the build config in
// vite.config.js untouched.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'api/**/*.test.js', 'shared/**/*.test.js'],
  },
})
