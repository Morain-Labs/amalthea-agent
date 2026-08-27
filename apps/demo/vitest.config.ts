import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure unit tests only: nothing here may need the emulator or the network.
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
