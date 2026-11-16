import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./load-module.mjs";
const { places } = loadModule("../src/data/places.ts");
const { preflight, assessPlan, availablePlaces } = loadModule("../src/lib/plan-quality.ts");
const { planningRequirements } = loadModule("../src/lib/planning-context.ts");
const input = { duration: "一日游", budget: 300, interests: "自然风景", startPoint: "南京南站", date: "2026-11-20", walking: "适中" };
const draft = ids => ({ days: [{ day: 1, stops: ids.map((placeId, i) => ({ placeId, period: ["上午", "下午", "傍晚", "夜间"][i], optional: i >= 3 })) }] });
test("雨天仅室内、少走路、预算与排除条件在选材前生效", () => {
  const indoor = availablePlaces({ ...input, interests: "下雨只在室内活动" }, places).map(p => p.id);
  assert.ok(indoor.includes("xinjiekou") && indoor.includes("nanjing-museum") && indoor.includes("six-dynasties"));
  assert.ok(!indoor.includes("presidential-palace") && !indoor.includes("niushoushan"));
  assert.ok(!availablePlaces({ ...input, walking: "少走路" }, places).some(p => p.id === "zhongshanling"));
  assert.ok(!availablePlaces({ ...input, budget: 0 }, places).some(p => p.id === "mingxiaoling"));
  assert.ok(!availablePlaces({ ...input, interests: "不要去明孝陵" }, places).some(p => p.id === "mingxiaoling"));
  assert.ok(!planningRequirements({ ...input, interests: "不购物，想看湖景" }, places).shopping);
  assert.ok(!availablePlaces({ ...input, interests: "不购物，想看湖景" }, places).some(p => p.id === "xinjiekou"));
});
test("未收录、明确冲突与不足以支撑两天的条件在调用前拒绝", () => {
  for (const patch of [{ interests: "汤山" }, { interests: "只在室内，必须去明孝陵" }, { interests: "明孝陵", budget: 10 }, { interests: "只去免费，必须去总统府" }]) assert.throws(() => preflight({ ...input, ...patch }, places));
  assert.throws(() => preflight({ ...input, interests: "室内购物", duration: "两日游" }, places.filter(place => place.id === "xinjiekou")));
  for (const interests of ["南京博物院", "总统府", "牛首山", "红山动物园", "栖霞山"]) assert.doesNotThrow(() => preflight({ ...input, interests }, places));
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
test("最新删除要求覆盖旧版本中明确提过的地点", () => {
  const revised = { ...input, interests: "明孝陵和南京明城墙", revision: { baseRequestId: "12345678-1234-4123-8123-123456789abc", instruction: "去掉城墙，增加购物" } };
  assert.ok(!planningRequirements(revised, places).requiredPlaceIds.includes("citywall"));
  assert.ok(planningRequirements(revised, places).requiredPlaceIds.includes("xinjiekou"));
  assert.ok(availablePlaces({ ...input, interests: "不要南京明城墙", revision: { ...revised.revision, instruction: "现在改为想去城墙" } }, places).some(place => place.id === "citywall"));
  assert.doesNotThrow(() => preflight({ ...input, interests: "不需要南京博物院，只看湖景" }, places));
});

test("闭馆按实际出游日验证，两日游可将博物院放在第二天", () => {
  const monday = { ...input, date: "2026-11-23", interests: "只去南京博物院" };
  assert.throws(() => preflight(monday, places), { code: "CLOSED_ON_TRIP_DATE" });
  const two = { ...monday, duration: "两日游" };
  assert.doesNotThrow(() => preflight(two, places));
  assert.ok(availablePlaces(two, places).some(p => p.id === "nanjing-museum"));
  const route = { days: [{ day: 1, stops: [{ placeId: "xuanwuhu", period: "上午" }] }, { day: 2, stops: [{ placeId: "nanjing-museum", period: "上午" }] }] };
  assert.doesNotThrow(() => assessPlan(route, two, places));
  route.days[0].stops[0].placeId = "nanjing-museum";
  assert.throws(() => assessPlan(route, two, places), { code: "UNSATISFIED_CONSTRAINTS" });
});

test("场馆晚间禁止，未知收费单列，已核实普通票参与预算", () => {
  const evening = draft(["six-dynasties"]); evening.days[0].stops[0].period = "夜间";
  assert.throws(() => assessPlan(evening, input, places), { code: "UNSATISFIED_CONSTRAINTS" });
  assert.throws(() => preflight({ ...input, interests: "必须去六朝博物馆", budget: 20 }, places), { code: "CONFLICTING_REQUIREMENTS" });
  assert.ok(assessPlan(draft(["presidential-palace"]), input, places).notes.some(note => /未核价.*总统府/.test(note)));
  assert.equal(assessPlan(draft(["six-dynasties"]), input, places).knownTicketsYuan, 30);
});

test("假期不直接套普通周一，未知年份与特殊开放提示确认", () => {
  const { visitDay, tripDates } = loadModule("../src/lib/visit-schedule.ts");
  assert.equal(visitDay("nanjing-museum", "2026-10-05").available, true);
  assert.match(visitDay("nanjing-museum", "2026-10-05").note, /未确认/);
  assert.match(visitDay("nanjing-museum", "2027-01-04").note, /尚需查/);
  assert.deepEqual(tripDates({ ...input, date: "2026-12-31", duration: "两日游" }), ["2026-12-31", "2027-01-01"]);
});

test("正文不能暗中加入夜游与登城，但可明确说明不安排", () => {
  const route = draft(["xuanwuhu"]);
  route.summary = "傍晚接秦淮夜色";
  assert.throws(() => assessPlan(route, input, places), { code: "UNSATISFIED_CONSTRAINTS" });
  route.summary = "不安排秦淮夜色";
  route.days[0].stops[0].activities = ["有体力再考虑湖畔城墙"];
  assert.throws(() => assessPlan(route, input, places), { code: "UNSATISFIED_CONSTRAINTS" });
  route.days[0].stops[0].activities = ["看水面与城墙层次，不登城"];
  assert.doesNotThrow(() => assessPlan(route, input, places));
});

test("湖景需求落到实际湖泊站点，点名莫愁湖不强加玄武湖", () => {
  assert.ok(planningRequirements({ ...input, interests: "历史、湖景和街巷" }, places).requiredPlaceIds.includes("xuanwuhu"));
  const required = planningRequirements({ ...input, interests: "只去莫愁湖看湖景" }, places).requiredPlaceIds;
  assert.deepEqual(required, ["mochouhu"]);
  assert.ok(planningRequirements({ ...input, interests: "两天看湖景、历史建筑、街巷和夜景" }, places).requiredPlaceIds.includes("qinhuai_night"));
  assert.ok(!planningRequirements({ ...input, interests: "看湖景，不要秦淮夜景" }, places).requiredPlaceIds.includes("qinhuai_night"));
});
