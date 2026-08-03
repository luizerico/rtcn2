module.exports = {
  testTimeout: 60000,
  projects: [
    {
      displayName: 'components',
      testMatch: [
        '<rootDir>/__tests__/*Modal*.test.tsx',
        '<rootDir>/__tests__/access.test.ts',
      ],
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
        '^react$': '<rootDir>/node_modules/react',
        '^react-dom$': '<rootDir>/node_modules/react-dom',
        '^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
        '^react/(.*)$': '<rootDir>/node_modules/react/$1',
        '^@/components/ui/(.*)$': '<rootDir>/client/components/ui/$1',
        '^@/(.*)$': '<rootDir>/client/$1',
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
