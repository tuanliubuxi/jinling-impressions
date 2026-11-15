import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3101";
const live = process.argv.includes("--live");
const twoDays = process.argv.includes("--two-days");
async function check(path, init, expected) {
  const response = await fetch(new URL(path, base), { ...init, signal: AbortSignal.timeout(100000) });
  assert.equal(response.status, expected, `${path}: expected HTTP ${expected}, got ${response.status}`);
  console.log(`PASS ${init?.method || "GET"} ${path} ${expected}`);
  return response;
}
for (const path of ["/", "/explore", "/planner"]) await check(path, undefined, 200);
const placeIds = ["mingxiaoling", "citywall", "zhongshanling", "wutong", "xuanwuhu", "fuzimiao", "qinhuai_night", "laomendong", "bridge", "xinjiekou"];
for (const id of placeIds) {
  const detail = await (await check(`/explore/${id}`, undefined, 200)).text();
  assert.ok(detail.includes("第一次来，可以这样走") && detail.includes("资料与更新说明"));
}
await check("/explore/not-a-place", undefined, 404);
const prefilled = await (await check(`/planner?interest=${encodeURIComponent("想游览明孝陵")}`, undefined, 200)).text();
assert.ok(prefilled.includes("想游览明孝陵"));
const health = await (await check("/api/health", undefined, 200)).json();
assert.equal(typeof health.aiConfigured, "boolean");
console.log(`AI configuration present: ${health.aiConfigured}`);
const input = { duration: twoDays ? "两日游" : "一日游", budget: twoDays ? 600 : 300, interests: "想了解明朝历史，重点看明孝陵与城墙，不赶场，留时间吃南京小吃", startPoint: "南京南站附近", date: "2026-11-18", walking: "适中" };
const post = body => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
await check("/api/plan", post({ ...input, budget: -1 }), 400);
await check("/api/plan", { ...post(input), body: "{" }, 400);
await check("/api/plan", { ...post(input), body: " ".repeat(9000) }, 413);
await check("/api/plan", { method: "POST", body: "text" }, 415);
await check("/api/plan", { ...post(input), headers: { "Content-Type": "application/json", Origin: "https://unrelated.example" } }, 403);
if (live) {
  assert.equal(health.aiConfigured, true, "Configure .env.local and restart server first");
  const response = await fetch(new URL("/api/plan", base), { ...post(input), signal: AbortSignal.timeout(100000) });
  const result = await response.json();
  if (!response.ok) {
    // 只打印由本应用生成的错误代码；不输出上游响应或任何环境变量。
    throw new Error(`Live request failed: HTTP ${response.status}, code=${result.code || "UNKNOWN"}`);
  }
  assert.equal(result.days.length, twoDays ? 2 : 1);
  assert.ok(result.days[0].stops.length > 0);
  const ids = new Set(placeIds);
  for (const day of result.days) {
    assert.ok(day.theme.length > 0 && day.meal.length > 0);
    for (const stop of day.stops) {
      assert.ok(ids.has(stop.placeId));
      assert.ok(stop.activities.length >= 2 && stop.transition.length > 0);
    }
  }
  assert.ok(result.days.some(day => day.stops.some(stop => stop.placeId === "mingxiaoling")));
  assert.ok(result.budgetAdvice.length >= 2);
  assert.equal(result.warnings.length, 3);
  assert.ok(result.sources.length > 0);
  console.log(`PASS live DeepSeek planning: ${result.days.length} day(s), ${result.days.reduce((sum, day) => sum + day.stops.length, 0)} stop(s), detailed activities, meals, budget and sources present`);
  console.log(JSON.stringify({ title: result.title, days: result.days.map(day => ({ theme: day.theme, stops: day.stops.map(stop => ({ placeId: stop.placeId, activities: stop.activities.length })) })) }));
} else {
  console.log("Live model call skipped. Pass --live to make one billable request.");
}
