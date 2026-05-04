// Vitest alias target for the `server-only` package (see vitest.config.ts).
// At runtime in production builds, importing `server-only` from a client
// module crashes the build. In tests we want server modules to be importable,
// so we replace the package with this empty module.
export {};
