import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import ts from "typescript";
import { loadModule } from "./load-module.mjs";

async function load(path) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { places } = loadModule("../src/data/places.ts");
const { selectPlanningPlaces, planningRequirements, assertRequiredStops } = loadModule("../src/lib/planning-context.ts");
const input = { duration: "一日游", budget: 300, interests: "明朝历史", startPoint: "南京南站", date: "2026-11-18", walking: "适中" };

test("所有目的地都有完整图文、官方参考与有效关联，图片可用", () => {
  assert.equal(places.length, 31);
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
  assert.equal(ming.length, 12);
});

test("新收录目的地和别名能成为实际需求，博物馆名称不串台", () => {
  for (const [interests, expected] of [["科巷", "kexiang"], ["南博", "nanjing-museum"], ["南京市博物馆", "chaotian-palace"], ["红山动物园", "hongshan-zoo"], ["南京城墙博物馆", "citywall-museum"], ["新街口孙中山像", "xinjiekou"]]) {
    assert.deepEqual(planningRequirements({ ...input, interests }, places).requiredPlaceIds, [expected]);
    assert.equal(selectPlanningPlaces({ ...input, interests }, places)[0].id, expected);
  }
});

test("纯逛吃不会用观光景点代替，远郊不挤入普通市内候选", () => {
  const food = selectPlanningPlaces({ ...input, interests: "只想吃小吃和逛吃" }, places);
  assert.ok(food.length >= 1 && food.every(place => place.category === "美食街巷"));
  assert.ok(!selectPlanningPlaces({ ...input, interests: "第一次来，随便看看" }, places).some(place => place.remote));
});

test("删除的目的地不再出现在目录或推荐关联中；纪念馆别名可规划", () => {
  const removed = new Set(["mingwalang", "hongmiao", "sangi-lane", "nanhu"]);
  assert.ok(places.every(place => !removed.has(place.id) && place.nearbyIds.every(id => !removed.has(id))));
  const { placeImages } = loadModule("../src/data/place-images.ts");
  assert.ok(places.every(place => placeImages[place.id]?.length > 0));
  assert.ok(placeImages["nanjing-memorial"].length >= 4);
  for (const interests of ["南京大屠杀纪念馆", "南京大屠杀遇难同胞纪念馆", "江东门纪念馆"]) {
    assert.deepEqual(planningRequirements({ ...input, interests }, places).requiredPlaceIds, ["nanjing-memorial"]);
  }
});

test("单目的地需求只提供一个候选，避免同园区上午下午重复排站", () => {
  for (const interests of ["去牛首山，别安排市区", "只去红山动物园，不加其他地点", "只去南京博物院看展"]) {
    const request = { ...input, walking: "可以多走", interests };
    assert.equal(planningRequirements(request, places).singleDestination, true);
    assert.equal(selectPlanningPlaces(request, places).length, 1);
  }
});

test("图库文件、来源与逐图许可完整，明确登记素材缺口", () => {
  const { placeImages } = loadModule("../src/data/place-images.ts");
  let count = 0;
  for (const [id, photos] of Object.entries(placeImages)) {
    assert.ok(places.some(place => place.id === id));
    const seen = new Set();
    for (const photo of photos) {
      assert.ok(!seen.has(photo.src)); seen.add(photo.src);
      const bytes = readFileSync(new URL(`../public${photo.src}`, import.meta.url));
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
      assert.ok(photo.author && photo.caption && photo.width > 0 && photo.height > 0);
      assert.ok(photo.license.startsWith("CC"));
      assert.equal(new URL(photo.sourceUrl).protocol, "https:");
      assert.equal(new URL(photo.licenseUrl).protocol, "https:");
      count++;
    }
  }
  assert.ok(count >= 120);
  assert.ok(placeImages.mingxiaoling.length >= 8);
});
