// Minimal shims so CI type-check passes without installing heavy dev deps

// Allow importing Medusa packages without type declarations
declare module '@medusajs/*'
declare module '@medusajs/framework/*'

// Very small Jest globals used by the integration test
declare const jest: {
  setTimeout: (ms: number) => void
}
declare function describe(name: string, fn: () => void): void
declare function it(name: string, fn: () => void | Promise<void>): void
declare function expect(actual: unknown): {
  toEqual: (expected: unknown) => void
}
