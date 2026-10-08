/**
 * Only the shared core packages are unit-tested with vitest.
 * The RN app has its own jest setup (apps/mobile/jest.config.js).
 * Plain .cjs on purpose: importable by vitest without a local install.
 */
module.exports = {
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
};
