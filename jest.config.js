/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json', // Assuming tsconfig.json exists or needs to be created/referenced
      isolatedModules: true, 
    }
  },
};