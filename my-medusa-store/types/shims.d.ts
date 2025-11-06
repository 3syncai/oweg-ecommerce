// Minimal shims so CI type-check passes without installing heavy dev deps

// Allow importing any Medusa packages without type declarations
declare module '@medusajs/*'
declare module '@medusajs/framework/*'

// Jest globals used in integration tests
declare const jest: any
declare const describe: any
declare const it: any
declare const expect: any

