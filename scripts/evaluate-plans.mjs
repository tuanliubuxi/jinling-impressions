import { mkdir, writeFile } from "node:fs/promises";
import { loadModule } from "../tests/load-module.mjs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// 默认只列场景；--live 显式开启计费调用。不输出环境变量或上游原始错误。
const cases = [
  { id: "memorial", interests: "只去江东门纪念馆了解南京大屠杀史实与和平教育，不加其他地点" },
  { id: "first-visit", interests: "第一次来南京，想了解这座城市，历史和市民生活都想看看，不赶场" },
  { id: "family", interests: "带6岁孩子，想看自然风景，方便吃饭和休息，不爬山", walking: "少走路" },
  { id: "senior", interests: "带老人，腿脚不便，湖边休息为主，不去中山陵", walking: "少走路" },
  { id: "rain-indoor", interests: "下雨，只安排室内，想逛商场和吃饭" },
  { id: "photo-night", interests: "想拍南京街巷和秦淮夜景，不去明孝陵" },
  { id: "food-half", interests: "下午半天，想吃南京小吃和逛老门东，别赶场", duration: "半日游" },
  { id: "zero-budget", interests: "自带水和食物，不购物不买票，想看湖景和城市生活", budget: 0, walking: "少走路" },
  { id: "modern-history", interests: "想了解民国和孙中山，重点去中山陵，可以多走", walking: "可以多走" },
  { id: "two-days", interests: "第一次来，想看历史建筑、湖景、街巷和夜景，两天分区域，不赶场", duration: "两日游" },
  { id: "shopping", interests: "逛商场，比较德基和金鹰，吃饭休息，不想看历史景区" },
  { id: "mixed", interests: "想看明孝陵，也想在新街口逛商场，不加其他打卡点" },
  { id: "exclusions", interests: "不要去夫子庙、不要明孝陵，想看玄武湖和湖边城墙" },
  { id: "museum", interests: "只去南京博物院看展，不加其他目的地" },
  { id: "remote", interests: "去牛首山，别安排市区" },
  { id: "kexiang", interests: "半天在科巷逛吃，想了解南京小吃，不看景区", duration: "半日游" },
  { id: "six-dynasties", interests: "下雨，只在室内看六朝文化，去六朝博物馆" },
  { id: "wall-museum", interests: "想去南京城墙博物馆了解城砖，不登城，不去湖边" },
  { id: "quiet", interests: "想去颐和路和小西湖看街巷，不去夫子庙，不赶场" },
  { id: "hongshan", interests: "带孩子在红山动物园看动物和科普，只安排这一个目的地", walking: "可以多走" },
  { id: "south-culture", interests: "想看大报恩寺遗址与城南生活，注意区分现代塔与明代遗址" },
  { id: "unsupported", interests: "去汤山泡温泉", expected: "UNSUPPORTED_DESTINATION" },
  { id: "conflicting-budget", interests: "必须去明孝陵", budget: 10, expected: "CONFLICTING_REQUIREMENTS" },
  { id: "conflicting-indoor", interests: "只在室内，必须去明孝陵", expected: "CONFLICTING_REQUIREMENTS" },
];
const base = { duration: "一日游", budget: 300, interests: "", startPoint: "南京南站", date: "2026-11-20", walking: "适中" };
if (!process.argv.includes("--live")) { console.log(cases.map(item => `${item.id}: ${item.interests}`).join("\n")); console.log("Pass --live for billable evaluation."); process.exit(0); }
process.loadEnvFile(".env.local");
const { generatePlan } = loadModule("../src/lib/deepseek.server.ts");
const apiBase = process.env.EVAL_API_BASE_URL;
async function runPlan(input, signal, basePlan) {
  if (!apiBase) return generatePlan(input, signal, basePlan);
  const id = randomUUID();
  const init = { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": id }, body: JSON.stringify(input), signal };
  let response = await fetch(`${apiBase}/api/plan`, init), body = await response.json();
  while (response.status === 202) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    response = await fetch(`${apiBase}/api/plan?requestId=${id}`, { signal }); body = await response.json();
  }
  if (!response.ok || body.status !== "completed") { const error = new Error(body.message || "API failure"); Object.assign(error, { code: body.code, generation: body.generation }); throw error; }
  const repeated = await fetch(`${apiBase}/api/plan`, init);
  const again = await repeated.json();
  assert.equal(repeated.status, 200); assert.deepEqual(again.result, body.result, "重复POST必须复用相同结果和用量");
  return body.result;
}
const selected = process.env.EVAL_CASES ? cases.filter(item => process.env.EVAL_CASES.split(",").includes(item.id)) : cases;
const report = { evaluatedAt: new Date().toISOString(), results: [] };
const nativeFetch = globalThis.fetch;
let diagnostic;
globalThis.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  if (response.ok) { try { const body = await response.clone().json(); diagnostic = { finishReason: body.choices?.[0]?.finish_reason, content: body.choices?.[0]?.message?.content, toolCalls: body.choices?.[0]?.message?.tool_calls }; } catch {} }
  return response;
};
await mkdir(".local/evaluations", { recursive: true });
const output = `.local/evaluations/${Date.now()}.json`;
for (const item of selected) {
  const { id, expected, ...patch } = item; const input = { ...base, ...patch }; const started = Date.now(); diagnostic = undefined;
  try {
    const result = await runPlan(input, AbortSignal.timeout(110000));
    report.results.push({ id, input, outcome: expected ? "unexpected-success" : "success", result });
    console.log(`${id}: success, ${result.days.map(day => day.stops.map(stop => stop.placeId).join("→")).join(" / ")}, ${result.generation?.usage?.totalTokens ?? "unknown"} tokens`);
    if (id === "mixed") {
      const revisedInput = { ...input, walking: "少走路", revision: { baseRequestId: result.requestId || "12345678-1234-4123-8123-123456789abc", instruction: "去掉明孝陵，只保留购物和休息，减少步行" } };
      try {
        const revision = await runPlan(revisedInput, AbortSignal.timeout(110000), result);
        assert.ok(revision.days.every(day => day.stops.every(stop => stop.placeId !== "mingxiaoling")), "修改结果必须删除指定地点");
        report.results.push({ id: "revision-remove-stop", input: revisedInput, outcome: "success", result: revision });
        console.log(`revision-remove-stop: success, ${revision.generation?.usage?.totalTokens ?? "unknown"} tokens`);
      } catch (error) { report.results.push({ id: "revision-remove-stop", outcome: "failure", code: error.code, message: error.message, generation: error.generation }); console.log(`revision-remove-stop: ${error.code || "FAILED"}`); }
    }
  } catch (error) {
    report.results.push({ id, input, outcome: error.code === expected ? "expected-rejection" : "failure", code: error.code || "UNKNOWN", message: error.code ? error.message : "Unexpected local error", elapsedMs: Date.now() - started, generation: error.generation, diagnostic });
    console.log(`${id}: ${error.code === expected ? "expected " : ""}${error.code || "FAILED"}`);
  }
  await writeFile(output, JSON.stringify(report, null, 2), "utf8");
}
console.log(`Report: ${output}`);
console.log(JSON.stringify(report.results.reduce((counts, item) => ({ ...counts, [item.outcome]: (counts[item.outcome] || 0) + 1 }), {})));
if (report.results.some(item => ["failure", "unexpected-success"].includes(item.outcome))) process.exitCode = 1;
