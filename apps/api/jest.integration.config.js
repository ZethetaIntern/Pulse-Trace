/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/integration/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  // Set up environment variables before any module imports.
  // setupFiles runs before test file loading, so process.env values
  // are available when env.ts is imported.
  setupFiles: ['<rootDir>/src/__tests__/integration/setup-env.ts'],
  // Global teardown to clean up Redis DB 1 after all suites
  globalTeardown: '<rootDir>/src/__tests__/integration/global-teardown.ts',
  verbose: true,
  // Integration tests need more time for async worker processing
  testTimeout: 30000,
};
