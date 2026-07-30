/// <reference types="jest" />

declare namespace jest {
  interface Matchers<R, T = any> {
    toBeInTheDocument(): R;
  }
}
