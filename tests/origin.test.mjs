import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(readFileSync(new URL("../src/lib/request-origin.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { isSameSiteRequest } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const request = headers => new Request("http://localhost:3000/api/plan", { method: "POST", headers });

test("框架内部 URL 为 localhost 时，以实际 Host 接受局域网同源请求", () => {
  assert.equal(isSameSiteRequest(request({ host: "192.0.2.10:3000", origin: "http://192.0.2.10:3000" })), true);
  assert.equal(isSameSiteRequest(request({ host: "jinling.test:3103", origin: "http://jinling.test:3103" })), true);
  assert.equal(isSameSiteRequest(request({ host: "localhost:3000", origin: "http://localhost:3000" })), true);
  assert.equal(isSameSiteRequest(request({ host: "198.51.100.20:3000", origin: "http://198.51.100.20:3000" })), true);
  assert.equal(isSameSiteRequest(request({ host: "203.0.113.30:3000", origin: "http://203.0.113.30:3000" })), true);
});

test("仍拒绝跨站、不同端口、null 来源和伪造转发头", () => {
  for (const origin of ["https://evil.example", "http://192.0.2.10:4000", "null", "http://192.0.2.10:3000/extra"]) {
    assert.equal(isSameSiteRequest(request({ host: "192.0.2.10:3000", origin })), false);
  }
  assert.equal(isSameSiteRequest(request({ host: "localhost:3000", origin: "https://evil.example", "x-forwarded-host": "evil.example" })), false);
});

test("仅显式公开来源允许 HTTPS 穿透代理重写 Host", () => {
  const original = process.env.PUBLIC_APP_ORIGINS;
  try {
    process.env.PUBLIC_APP_ORIGINS = "https://example.cpolar.top";
    assert.equal(isSameSiteRequest(request({ host: "localhost:3000", origin: "https://example.cpolar.top" })), true);
    assert.equal(isSameSiteRequest(request({ host: "localhost:3000", origin: "https://other.cpolar.top" })), false);
  } finally { if (original === undefined) delete process.env.PUBLIC_APP_ORIGINS; else process.env.PUBLIC_APP_ORIGINS = original; }
});

test("cpolar通配符支持刷新后的多级子域，拒绝伪造后缀、非预期协议与端口", () => {
  const original = process.env.PUBLIC_APP_ORIGINS;
  try {
    process.env.PUBLIC_APP_ORIGINS = "https://**.cpolar.top,http://**.cpolar.top";
    for (const origin of ["https://new.r31.cpolar.top", "https://other.r32.cpolar.top", "https://one.cpolar.top", "http://new.r31.cpolar.top"]) assert.equal(isSameSiteRequest(request({ host: "localhost:3000", origin })), true, origin);
    for (const origin of ["https://cpolar.top", "https://evilcpolar.top", "https://cpolar.top.evil.example", "https://one.cpolar.top.evil.example", "https://one.cpolar.top:444", "https://*.cpolar.top", "https://one.coplar.top"]) assert.equal(isSameSiteRequest(request({ host: "localhost:3000", origin })), false, origin);
    process.env.PUBLIC_APP_ORIGINS = "https://*.cpolar.top";
    assert.equal(isSameSiteRequest(request({ host: "localhost:3000", origin: "https://one.cpolar.top" })), true);
    assert.equal(isSameSiteRequest(request({ host: "localhost:3000", origin: "https://one.r31.cpolar.top" })), false);
  } finally { if (original === undefined) delete process.env.PUBLIC_APP_ORIGINS; else process.env.PUBLIC_APP_ORIGINS = original; }
});
