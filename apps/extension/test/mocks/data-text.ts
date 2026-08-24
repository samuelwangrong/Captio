// Shim for Plasmo's `data-text:*` import scheme (e.g. `import cssText from
// "data-text:../style.css"`). Plasmo's bundler inlines the referenced file's
// contents as a string at build time; Vitest has no equivalent loader, so
// `vitest.config.ts` aliases every `data-text:*` specifier to this module,
// which exports an empty string. Tests that care about actual CSS content
// should assert on DOM/class behavior instead of the injected stylesheet text.
export default ""
