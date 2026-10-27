import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The level loader uses import.meta.glob; a persisted transform would miss newly added level files.
    fsModuleCache: false,
  },
})
