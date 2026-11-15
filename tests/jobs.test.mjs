import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

async function load(file) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { PlanJobs } = await load("../src/lib/plan-jobs.ts");
function repository() {
  const files = new Map();
  return { read: async id => structuredClone(files.get(id)), write: async job => { files.set(job.requestId, structuredClone(job)); }, prune: async () => {}, files };
}
const input = { duration: "一日游", date: "2026-11-18", budget: 300, interests: "明代", walking: "适中", startPoint: "车站" };
const result = { title: "测试结果" };

test("同编号的并发请求、断线重连、结果重取只生成一次", async () => {
  let calls = 0, resolve;
  const jobs = new PlanJobs(repository(), async () => { calls++; return new Promise(done => { resolve = done; }); });
  const [a, b] = await Promise.all([jobs.submit("same", "hash", input), jobs.submit("same", "hash", input)]);
  assert.equal(a.job.status, "pending");
  assert.equal(b.job.requestId, a.job.requestId);
  assert.equal(calls, 1);
  assert.equal((await jobs.get("same")).status, "pending");
  resolve(result); await a.settled;
  const cached = await jobs.submit("same", "hash", input);
  assert.deepEqual(cached.job.result, result);
  assert.equal(calls, 1);
});

test("相同编号不能换条件；完成结果在服务重启后仍可复用", async () => {
  const disk = repository(); let calls = 0;
  const first = new PlanJobs(disk, async () => { calls++; return result; });
  const created = await first.submit("same", "hash", input); await created.settled;
  await assert.rejects(first.submit("same", "changed-hash", input), error => error.status === 409);
  const restarted = new PlanJobs(disk, async () => { calls++; return result; });
  assert.equal((await restarted.submit("same", "hash", input)).job.status, "completed");
  assert.equal(calls, 1);
});

test("重启遗留的未完成任务、失败任务和过期任务不会自动重算", async () => {
  const disk = repository(); let calls = 0;
  const now = Date.now();
  disk.files.set("interrupted", { version: 1, requestId: "interrupted", inputHash: "h", status: "pending", createdAt: now });
  const jobs = new PlanJobs(disk, async () => { calls++; return result; }, () => now);
  assert.equal((await jobs.submit("interrupted", "h", input)).job.error.code, "JOB_INTERRUPTED");
  disk.files.set("expired", { version: 1, requestId: "expired", inputHash: "h", status: "completed", createdAt: now - 86400001, result });
  await assert.rejects(jobs.submit("expired", "h", input), error => error.status === 410);
  assert.equal(calls, 0);
});

test("存储不可写时不调用模型；后台生成失败不会因重连再次计费", async () => {
  let calls = 0;
  const disk = repository();
  const broken = new PlanJobs({ ...disk, write: async () => { throw new Error("disk full"); } }, async () => { calls++; return result; });
  await assert.rejects(broken.submit("x", "h", input), error => error.code === "JOB_STORAGE_ERROR");
  assert.equal(calls, 0);
  const jobs = new PlanJobs(disk, async () => { calls++; throw new Error("failed"); });
  const created = await jobs.submit("y", "h", input); await created.settled;
  assert.equal((await jobs.submit("y", "h", input)).job.status, "failed");
  assert.equal(calls, 1);
});

test("并发限额约束新生成，不阻止已有任务重连", async () => {
  const jobs = new PlanJobs(repository(), async () => new Promise(() => {}));
  await jobs.submit("a", "h", input); await jobs.submit("b", "h", input);
  await assert.rejects(jobs.submit("c", "h", input), error => error.status === 429);
  assert.equal((await jobs.submit("a", "h", input)).job.status, "pending");
});
