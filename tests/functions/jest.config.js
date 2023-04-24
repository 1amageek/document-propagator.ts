module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.spec.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
};
