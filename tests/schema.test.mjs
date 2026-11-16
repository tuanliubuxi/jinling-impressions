import test from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./load-module.mjs";
const { itinerarySchema, unwrapItinerary } = loadModule("../src/lib/itinerary-schema.ts");
test("严格输出按时长与体力限制槽位，不允许模型增添第三个少走路地点", () => {
  const schema = itinerarySchema({ duration: "两日游" }, ["xuanwuhu", "xinjiekou"], true, false);
  assert.ok(schema.required.includes("d2_theme"));
  assert.ok(schema.required.includes("d2_s2_include"));
  assert.ok(!schema.required.includes("d2_s3_include"));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.d1_s1_placeId.enum, ["xuanwuhu", "xinjiekou"]);
});
test("占位槽不变成行程，活动与预算转成业务数组，非法结构拒绝", () => {
  const input = { duration: "一日游" };
  const parsed = unwrapItinerary({ d1_s1_include: true, d1_s1_placeId: "xinjiekou", d1_s1_activity1: "选商场", d1_s1_activity2: "安排休息", d1_s2_include: false }, input, true, false);
  assert.equal(parsed.days[0].stops.length, 1);
  assert.deepEqual(parsed.days[0].stops[0].activities, ["选商场", "安排休息"]);
  assert.throws(() => unwrapItinerary({ days: [] }, input, true, false));
});
