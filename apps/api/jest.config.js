/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Only mock the Prisma client and infrastructure modules in unit tests.
  // Integration tests (Step 2) will override this.
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  // Suppress noisy Prisma/client import warnings in unit tests
  silent: false,
  // Verbose output for readability
  verbose: true,
};
