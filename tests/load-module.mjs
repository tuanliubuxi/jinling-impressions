import { readFileSync } from "node:fs";
import ts from "typescript";
export function loadModule(path, overrides = {}, cache = new Map()) {
  const url = path instanceof URL ? path : new URL(path, import.meta.url);
  if (cache.has(url.href)) return cache.get(url.href);
  const code = ts.transpileModule(readFileSync(url, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; cache.set(url.href, module.exports);
  new Function("require", "module", "exports", code)(name => {
    if (name in overrides) return overrides[name];
    if (name.startsWith("@/")) return loadModule(`../src/${name.slice(2)}.ts`, overrides, cache);
    throw new Error(`Unexpected import ${name}`);
  }, module, module.exports);
  cache.set(url.href, module.exports); return module.exports;
}
