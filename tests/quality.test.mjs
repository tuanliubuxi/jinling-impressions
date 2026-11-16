import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./load-module.mjs";
const { places } = loadModule("../src/data/places.ts");
const { preflight, assessPlan, availablePlaces } = loadModule("../src/lib/plan-quality.ts");
const { planningRequirements } = loadModule("../src/lib/planning-context.ts");
const input = { duration: "一日游", budget: 300, interests: "自然风景", startPoint: "南京南站", date: "2026-11-20", walking: "适中" };
const draft = ids => ({ days: [{ day: 1, stops: ids.map((placeId, i) => ({ placeId, period: ["上午", "下午", "傍晚", "夜间"][i], optional: i >= 3 })) }] });
test("雨天仅室内、少走路、预算与排除条件在选材前生效", () => {
  assert.deepEqual(availablePlaces({ ...input, interests: "下雨只在室内活动" }, places).map(p => p.id), ["xinjiekou"]);
  assert.ok(!availablePlaces({ ...input, walking: "少走路" }, places).some(p => p.id === "zhongshanling"));
  assert.ok(!availablePlaces({ ...input, budget: 0 }, places).some(p => p.id === "mingxiaoling"));
  assert.ok(!availablePlaces({ ...input, interests: "不要去明孝陵" }, places).some(p => p.id === "mingxiaoling"));
  assert.ok(!planningRequirements({ ...input, interests: "不购物，想看湖景" }, places).shopping);
  assert.ok(!availablePlaces({ ...input, interests: "不购物，想看湖景" }, places).some(p => p.id === "xinjiekou"));
});
test("未收录、明确冲突与不足以支撑两天的条件在调用前拒绝", () => {
  for (const patch of [{ interests: "南京博物院" }, { interests: "只在室内，必须去明孝陵" }, { interests: "明孝陵", budget: 10 }, { interests: "室内购物", duration: "两日游" }]) assert.throws(() => preflight({ ...input, ...patch }, places));
});
test("时间顺序、夜景时段、少走路站数和累计门票必须满足", () => {
  assert.throws(() => assessPlan(draft(["qinhuai_night"]), input, places));
  assert.throws(() => assessPlan(draft(["xuanwuhu", "citywall", "xinjiekou"]), { ...input, walking: "少走路" }, places));
  assert.throws(() => assessPlan(draft(["mingxiaoling", "citywall"]), { ...input, budget: 80 }, places));
  assert.throws(() => assessPlan(draft(["mingxiaoling", "zhongshanling"]), { ...input, duration: "半日游" }, places));
});
test("报告分开标明官方票价参考、编辑预留和未知范围", () => {
  const report = assessPlan(draft(["xuanwuhu", "citywall"]), input, places);
  assert.equal(report.knownTicketsYuan, 30);
  assert.equal(report.days[0].transferReserveMinutes, 15);
  assert.match(report.days[0].legs[0].basis, /非实测/);
  assert.equal(report.ticketItems[0].checkedAt, "2026-11-16");
});
test("本轮删除覆盖旧版本中明确提过的地点", () => {
  const revised = { ...input, interests: "明孝陵和南京明城墙", revision: { baseRequestId: "12345678-1234-4123-8123-123456789abc", instruction: "去掉城墙，增加购物" } };
  assert.ok(!planningRequirements(revised, places).requiredPlaceIds.includes("citywall"));
  assert.ok(planningRequirements(revised, places).requiredPlaceIds.includes("xinjiekou"));
  assert.ok(availablePlaces({ ...input, interests: "不要南京明城墙", revision: { ...revised.revision, instruction: "现在改为想去城墙" } }, places).some(place => place.id === "citywall"));
  assert.doesNotThrow(() => preflight({ ...input, interests: "不需要南京博物院，只看湖景" }, places));
});
