import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// 只转译无依赖的契约模块，使用 Node 内置测试，不下载测试框架。
const source = readFileSync(new URL("../src/lib/plan-contract.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parsePlanRequest, parsePlanDraft } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const request = { duration: "一日游", budget: 300, interests: "文化", startPoint: "南京南站", date: "2026-11-18", walking: "少走路" };
const draft = () => ({ title: "文化游览建议", summary: "信息待核实", days: [{ day: 1, stops: [{ placeId: "a", period: "下午", reason: "文化兴趣" }] }], tips: [] });

test("输入裁剪并拒绝异常预算、空白与不存在的日期", () => {
  assert.equal(parsePlanRequest({ ...request, interests: "  文化  " }).interests, "文化");
  for (const bad of [{ budget: "300" }, { budget: -1 }, { budget: 1.5 }, { budget: Infinity }, { interests: "   " }, { interests: "a".repeat(501) }, { startPoint: " " }, { date: "2026-02-30" }, { duration: "三日游" }, { walking: "飞行" }]) {
    assert.throws(() => parsePlanRequest({ ...request, ...bad }));
  }
});

test("输出仅接受白名单地点，不允许重复或错配天数", () => {
  assert.equal(parsePlanDraft(draft(), request, ["a"]).days[0].stops[0].placeId, "a");
  assert.throws(() => parsePlanDraft(draft(), request, ["b"]));
  const duplicate = draft(); duplicate.days[0].stops.push({ ...duplicate.days[0].stops[0] });
  assert.throws(() => parsePlanDraft(duplicate, request, ["a"]));
  assert.throws(() => parsePlanDraft(draft(), { ...request, duration: "两日游" }, ["a"]));
});

test("拒绝不完整字段、无效时段与空行程，丢弃未知字段", () => {
  for (const bad of [null, { ...draft(), title: "" }, { ...draft(), tips: [1] }, { ...draft(), days: [] }, { ...draft(), days: [{ day: 1, stops: [] }] }]) {
    assert.throws(() => parsePlanDraft(bad, request, ["a"]));
  }
  const timed = draft(); timed.days[0].stops[0].period = "09:00";
  assert.throws(() => parsePlanDraft(timed, request, ["a"]));
  const parsed = parsePlanDraft({ ...draft(), cost: 0, safe: true }, request, ["a"]);
  assert.equal(parsed.cost, undefined);
  assert.equal(parsed.safe, undefined);
});

test("半日不超过两站，两日须分别有不同地点", () => {
  const many = draft(); many.days[0].stops = ["a", "b", "c"].map(placeId => ({ placeId, period: "下午", reason: "文化" }));
  assert.throws(() => parsePlanDraft(many, { ...request, duration: "半日游" }, ["a", "b", "c"]));
  const two = draft(); two.days.push({ day: 2, stops: [{ placeId: "b", period: "上午", reason: "文化" }] });
  assert.equal(parsePlanDraft(two, { ...request, duration: "两日游" }, ["a", "b"]).days.length, 2);
});
