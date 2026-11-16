import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(file, imports = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(name => { assert.ok(name in imports); return imports[name]; }, module, module.exports);
  return module.exports;
}
const contract = load("../src/lib/plan-contract.ts");
const jobContract = load("../src/lib/plan-job-contract.ts");
const { readPlannerSession, writePlannerSession, plannerSessionKey } = load("../src/lib/planner-session.ts", { "@/lib/plan-contract": contract, "@/lib/plan-job-contract": jobContract });
const input = { duration: "一日游", date: "2026-11-18", budget: 300, interests: "明代", walking: "适中", startPoint: "车站" };
const draft = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)]));
const id = "11111111-1111-4111-8111-111111111111";
const storage = () => { const data = new Map(); return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; };

test("刷新后恢复原任务编号和输入，不创建新编号", () => {
  const disk = storage(), now = Date.now();
  assert.equal(writePlannerSession(disk, { version: 2, savedAt: now, draft, task: { requestId: id, input, startedAt: now } }), true);
  const restored = readPlannerSession(disk, now + 1000);
  assert.equal(restored.task.requestId, id);
  assert.deepEqual(restored.task.input, input);
  assert.deepEqual(restored.draft, draft);
});

test("损坏、过期缓存和旧结果结构不会进入渲染", () => {
  const disk = storage(), now = Date.now();
  disk.setItem(plannerSessionKey, "{bad"); assert.equal(readPlannerSession(disk), undefined);
  writePlannerSession(disk, { version: 2, savedAt: now, draft, result: { title: "old schema" } });
  assert.equal(readPlannerSession(disk, now).result, undefined);
  assert.equal(readPlannerSession(disk, now + 86400001), undefined);
});

test("存储被浏览器拒绝时返回失败，不清除原有缓存", () => {
  const disk = storage(); disk.setItem(plannerSessionKey, "previous result");
  const blocked = { ...disk, setItem: () => { throw new Error("quota"); } };
  assert.equal(writePlannerSession(blocked, { version: 2, savedAt: Date.now(), draft }), false);
  assert.equal(disk.getItem(plannerSessionKey), "previous result");
});
