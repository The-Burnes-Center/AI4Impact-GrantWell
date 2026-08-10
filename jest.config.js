module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    // The root tsconfig pins `types` to node only, which leaves the suite without
    // describe/it/expect; add them here rather than in the build config.
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { types: ['node', 'jest'] } }]
  }
};
