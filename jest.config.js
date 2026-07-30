module.exports = {
  testTimeout: 60000,
  projects: [
    {
      displayName: 'components',
      testMatch: ['<rootDir>/__tests__/*Modal*.test.tsx'],
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      transform: {
        '^.+\\.[tj]sx?$': [
          'babel-jest',
          {
            presets: [
              ['@babel/preset-env', { targets: { node: 'current' } }],
              ['@babel/preset-typescript'],
              ['@babel/preset-react', { runtime: 'automatic' }],
            ],
          },
        ],
      },
      moduleNameMapper: {
        '^@/components/ui/(.*)$': '<rootDir>/client/components/ui/$1',
        '^@/(.*)$': '<rootDir>/$1',
      },
    },
    {
      displayName: 'api',
      testMatch: ['<rootDir>/__tests__/api.*.test.js'],
      testEnvironment: 'node',
      transform: {},
    },
  ],
  testPathIgnorePatterns: ['/node_modules/', '/client/.next/', '<rootDir>/__tests__/helpers/'],
};
