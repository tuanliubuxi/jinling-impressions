import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3101";
const live = process.argv.includes("--live");
async function check(path, init, expected) {
  const response = await fetch(new URL(path, base), { ...init, signal: AbortSignal.timeout(100000) });
  assert.equal(response.status, expected, `${path}: expected HTTP ${expected}, got ${response.status}`);
  console.log(`PASS ${init?.method || "GET"} ${path} ${expected}`);
  return response;
}
for (const path of ["/", "/explore", "/planner"]) await check(path, undefined, 200);
const health = await (await check("/api/health", undefined, 200)).json();
assert.equal(typeof health.aiConfigured, "boolean");
console.log(`AI configuration present: ${health.aiConfigured}`);
const input = { duration: "一日游", budget: 300, interests: "喜欢历史文化，希望精简安排并留时间休息", startPoint: "南京南站附近", date: "2026-11-18", walking: "少走路" };
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
  assert.equal(result.days.length, 1);
  assert.ok(result.days[0].stops.length > 0);
  const ids = new Set(["zhongshanling", "xuanwuhu", "laomendong"]);
  for (const day of result.days) for (const stop of day.stops) assert.ok(ids.has(stop.placeId));
  assert.equal(result.warnings.length, 3);
  assert.ok(result.sources.length > 0);
  console.log(`PASS live DeepSeek planning: ${result.days.length} day(s), ${result.days[0].stops.length} stop(s), warnings and sources present`);
} else {
  console.log("Live model call skipped. Pass --live to make one billable request.");
}
