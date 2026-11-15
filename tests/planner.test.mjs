import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// 只转译无依赖的契约模块，使用 Node 内置测试，不下载测试框架。
const source = readFileSync(new URL("../src/lib/plan-contract.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parsePlanRequest, parsePlanDraft } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const request = { duration: "一日游", budget: 300, interests: "文化", startPoint: "南京南站", date: "2026-11-18", walking: "少走路" };
const stop = placeId => ({ placeId, period: "下午", reason: "文化兴趣", activities: ["观察石刻", "留时间休息"], transition: "先确认入口与到达方式" });
const draft = () => ({ title: "文化游览建议", summary: "信息待核实", days: [{ day: 1, theme: "文化慢游", meal: "在同片区安排正餐", stops: [stop("a")] }], tips: [], budgetAdvice: ["为正餐留预算", "门票另行确认"] });

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
  const two = draft(); two.days.push({ day: 2, theme: "街巷慢游", meal: "用餐与休息结合", stops: [stop("b")] });
  assert.equal(parsePlanDraft(two, { ...request, duration: "两日游" }, ["a", "b"]).days.length, 2);
});

test("攻略必须有具体玩法、转场说明、用餐与预算安排", () => {
  for (const field of ["activities", "transition"]) {
    const invalid = draft(); delete invalid.days[0].stops[0][field];
    assert.throws(() => parsePlanDraft(invalid, request, ["a"]));
  }
  const sparse = draft(); sparse.days[0].stops[0].activities = ["随便看看"];
  assert.throws(() => parsePlanDraft(sparse, request, ["a"]));
  const noBudget = draft(); noBudget.budgetAdvice = [];
  assert.throws(() => parsePlanDraft(noBudget, request, ["a"]));
  const noMeal = draft(); noMeal.days[0].meal = "";
  assert.throws(() => parsePlanDraft(noMeal, request, ["a"]));
});

test("完整第四站作为备选保留，不能变成第四个必去任务", () => {
  const four = draft(); four.days[0].stops = ["a", "b", "c", "d"].map(stop);
  const parsed = parsePlanDraft(four, request, ["a", "b", "c", "d"]);
  assert.deepEqual(parsed.days[0].stops.map(item => item.optional), [false, false, false, true]);
  four.days[0].stops.push(stop("e"));
  assert.throws(() => parsePlanDraft(four, request, ["a", "b", "c", "d", "e"]));
});
