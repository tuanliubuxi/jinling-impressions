import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import ts from "typescript";

async function load(path) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { places } = await load("../src/data/places.ts");
const { selectPlanningPlaces, planningRequirements, assertRequiredStops } = await load("../src/lib/planning-context.ts");
const input = { duration: "一日游", budget: 300, interests: "明朝历史", startPoint: "南京南站", date: "2026-11-18", walking: "适中" };

test("所有目的地都有完整图文、官方参考与有效关联，图片可用", () => {
  assert.equal(places.length, 10);
  const ids = new Set(places.map(place => place.id));
  assert.equal(ids.size, places.length);
  for (const place of places) {
    assert.ok(place.history.length >= 2 && place.highlights.length >= 3 && place.walk.length >= 3);
    assert.ok(place.sources.length >= 1);
    for (const source of place.sources) assert.equal(new URL(source.url).protocol, "https:");
    for (const id of place.nearbyIds) assert.ok(ids.has(id) && id !== place.id);
    assert.ok(existsSync(new URL(`../public${place.image}`, import.meta.url)));
    assert.ok(place.practical.durationMinutes[0] > 0 && place.practical.durationMinutes[1] >= place.practical.durationMinutes[0]);
  }
});

test("商场同义词会选中新街口，纯购物不混入明史景点", () => {
  for (const interests of ["逛商场", "购物", "想去逛街", "去德基买东西", "想去金鹰", "shopping", "mall"]) {
    const choices = selectPlanningPlaces({ ...input, interests }, places);
    assert.deepEqual(choices.map(place => place.id), ["xinjiekou"]);
    assert.deepEqual(planningRequirements({ ...input, interests }, places).requiredPlaceIds, ["xinjiekou"]);
  }
});

test("混合明史和购物不能挤掉购物；否定表达不强制购物", () => {
  const mixed = { ...input, interests: "想看明孝陵和明城墙，也要逛商场" };
  const requirements = planningRequirements(mixed, places);
  assert.deepEqual(new Set(requirements.requiredPlaceIds), new Set(["mingxiaoling", "citywall", "xinjiekou"]));
  assert.ok(selectPlanningPlaces(mixed, places).some(place => place.id === "xinjiekou"));
  assert.throws(() => assertRequiredStops(requirements.requiredPlaceIds, ["mingxiaoling", "citywall"]));
  assert.doesNotThrow(() => assertRequiredStops(requirements.requiredPlaceIds, ["mingxiaoling", "citywall", "xinjiekou"]));
  assert.equal(planningRequirements({ ...input, interests: "不想逛商场，只想看明史" }, places).shopping, false);
});

test("明史查询优先明孝陵与明城墙，明确点名优先返回", () => {
  const ming = selectPlanningPlaces(input, places);
  assert.deepEqual(new Set(ming.slice(0, 2).map(place => place.id)), new Set(["mingxiaoling", "citywall"]));
  const explicit = selectPlanningPlaces({ ...input, interests: "我想去南京长江大桥" }, places);
  assert.equal(explicit[0].id, "bridge");
  assert.equal(ming.length, 8);
});
