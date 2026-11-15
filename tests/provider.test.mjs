import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

function loadModule(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const contract = loadModule("../src/lib/plan-contract.ts");
const { generatePlan } = loadModule("../src/lib/deepseek.server.ts", {
  "@/data/places": { places: [{ id: "a", name: "示例地点", description: "文化" }] },
  "@/lib/ai-config.server": { getAIConfig: () => ({ endpoint: "https://api.deepseek.com/chat/completions", model: "test-model", apiKey: "test-key-only" }) },
  "@/lib/plan-contract": contract,
});
const input = { duration: "一日游", budget: 300, interests: "文化", startPoint: "车站", date: "2026-11-18", walking: "少走路" };
const draft = { title: "建议", summary: "待核实", days: [{ day: 1, stops: [{ placeId: "a", period: "下午", reason: "文化" }] }], tips: [] };
const success = (content, finish_reason = "stop") => Response.json({ choices: [{ finish_reason, message: { content } }] });

test("模型请求约束、固定风险提醒及来源来自服务端资料", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.response_format.type, "json_object");
      assert.equal(body.thinking.type, "disabled");
      assert.equal(body.stream, false);
      assert.equal(options.headers.Authorization, "Bearer test-key-only");
      return success(JSON.stringify({ ...draft, warnings: [], sources: [{ id: "fake" }] }));
    };
    const plan = await generatePlan(input, new AbortController().signal);
    assert.equal(plan.warnings.length, 3);
    assert.equal(plan.sources[0].id, "a");
  } finally { globalThis.fetch = original; }
});

test("认证、余额、限流错误不泄露上游原始响应", async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, code] of [[401, "AI_AUTH_FAILED"], [402, "AI_BALANCE_REQUIRED"], [429, "AI_RATE_LIMITED"], [500, "UPSTREAM_ERROR"]]) {
      globalThis.fetch = async () => new Response("PRIVATE-UPSTREAM-DETAIL", { status });
      await assert.rejects(generatePlan(input, new AbortController().signal), error => error.code === code && !error.message.includes("PRIVATE"));
    }
  } finally { globalThis.fetch = original; }
});

test("空输出、截断、无效 JSON、未知地点均拒绝展示", async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [success(" "), success("{}", "length"), success("{broken"), success(JSON.stringify({ ...draft, days: [{ day: 1, stops: [{ placeId: "fake", period: "下午", reason: "文化" }] }] }))]) {
      globalThis.fetch = async () => response;
      await assert.rejects(generatePlan(input, new AbortController().signal), error => error.code === "INVALID_AI_OUTPUT");
    }
  } finally { globalThis.fetch = original; }
});

test("网络中断与取消均返回安全的可重试错误", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("PRIVATE-CONNECTION-DETAIL"); };
    await assert.rejects(generatePlan(input, new AbortController().signal), error => error.code === "UPSTREAM_UNAVAILABLE" && !error.message.includes("PRIVATE"));
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(generatePlan(input, aborted.signal), error => error.code === "TIMEOUT");
  } finally { globalThis.fetch = original; }
});
