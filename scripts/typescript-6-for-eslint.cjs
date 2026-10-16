const Module = require("node:module");

// typescript-eslint 8 loads `typescript` and rejects TypeScript 7.
// This process is ESLint only, so every `typescript` import here is TypeScript 6.
// `pnpm typecheck` still uses TypeScript 7.
const typescript6 = require.resolve("typescript-6");
const original = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "typescript") return typescript6;
  return original.call(this, request, parent, isMain, options);
};
