/// <reference types="plasmo" />

// Plasmo's `data-text:*` import scheme inlines the referenced file's
// contents as a string at build time (e.g. `import cssText from
// "data-text:../style.css"`). TypeScript doesn't know about this resolver,
// so declare it as an ambient module returning a string.
declare module "data-text:*" {
  const text: string
  export default text
}
