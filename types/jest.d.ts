declare namespace jest {
  interface Matchers<R, T = any> {
    toBeInTheDocument(): R;
    toContainElement(element: HTMLElement | null): R;
    toHaveAttribute(attr: string, value?: string): R;
    toHaveClass(className: string): R;
    toHaveFocus(): R;
    toHaveFormErrorMessage(message?: string): R;
    toHaveId(id: string): R;
    toBeEmpty(): R;
    toBeDisabled(): R;
    toBeEnabled(): R;
    toBeValid(): R;
    toBeInvalid(): R;
    toBeChecked(): R;
    toBeUnchecked(): R;
    toHaveStyle(css: string): R;
    toHaveTextContent(text: string | RegExp, options?: Partial<TextContentOptions>): R;
    toHaveAttribute(attr: string, value?: string): R;
    toHaveProp(prop: string, value?: string): R;
  }
}
