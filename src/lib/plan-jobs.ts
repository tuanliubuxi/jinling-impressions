import type { PlanRequest, PlanResult } from "@/lib/plan-contract";

export type PlanJob = {
  version: 1; requestId: string; inputHash: string; createdAt: number;
  status: "pending" | "completed" | "failed";
  result?: PlanResult;
  generation?: PlanResult["generation"];
  error?: { code: string; message: string; status: number };
};
export type JobRepository = { read(id: string): Promise<PlanJob | undefined>; write(job: PlanJob): Promise<void>; prune(before: number): Promise<void> };

export class JobError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

// 同一编号只启动一次；生成生命周期独立于手机连接，刷新后可继续取回结果。
export class PlanJobs {
  private records = new Map<string, PlanJob>();
  private running = new Map<string, Promise<void>>();
  private reservations = new Map<string, { hash: string; promise: Promise<{ job: PlanJob; settled?: Promise<void> }> }>();
  private busy = 0;
  private recent: number[] = [];
  private lastPrune = 0;
  constructor(private repository: JobRepository, private generate: (input: PlanRequest, signal: AbortSignal, base?: PlanResult) => Promise<PlanResult>, private now = Date.now) {}
  useGenerator(generate: (input: PlanRequest, signal: AbortSignal, base?: PlanResult) => Promise<PlanResult>) { this.generate = generate; }

  async get(id: string): Promise<PlanJob | undefined> {
    const reservation = this.reservations.get(id);
    if (reservation) await reservation.promise;
    return this.existing(id);
  }

  async submit(id: string, inputHash: string, input: PlanRequest, base?: PlanResult) {
    const reservation = this.reservations.get(id);
    if (reservation) {
      if (reservation.hash !== inputHash) throw new JobError("REQUEST_CONFLICT", "这次任务的条件不一致，请重新整理需求。", 409);
      return reservation.promise;
    }
    const promise = this.reserve(id, inputHash, input, base);
    this.reservations.set(id, { hash: inputHash, promise });
    try { return await promise; } finally { this.reservations.delete(id); }
  }

  private async existing(id: string): Promise<PlanJob | undefined> {
    const job = this.records.get(id) || await this.repository.read(id);
    if (!job) return undefined;
    if (this.now() - job.createdAt >= 86400000) throw new JobError("JOB_EXPIRED", "这次任务已超过 24 小时保留期，不会自动重新调用模型。", 410);
    this.records.set(id, job);
    if (job.status === "pending" && !this.running.has(id)) {
      job.status = "failed";
      job.error = { code: "JOB_INTERRUPTED", message: "服务曾重启，这次生成已中断；没有自动重试或再次计费。请主动重新生成。", status: 503 };
      await this.repository.write(job);
    }
    return job;
  }

  private async reserve(id: string, inputHash: string, input: PlanRequest, base?: PlanResult) {
    const previous = await this.existing(id);
    if (previous) {
      if (previous.inputHash !== inputHash) throw new JobError("REQUEST_CONFLICT", "这次任务的条件不一致，请重新整理需求。", 409);
      return { job: previous, settled: this.running.get(id) };
    }
    const now = this.now();
    this.recent = this.recent.filter(time => now - time < 60000);
    if (this.busy >= 2 || this.recent.length >= 10) throw new JobError("RATE_LIMITED", "请求较多，请稍后再试。", 429);
    this.busy++;
    const job: PlanJob = { version: 1, requestId: id, inputHash, createdAt: now, status: "pending" };
    try {
      // 先落盘再启动计费调用；写入失败绝不调用模型。
      await this.repository.write(job);
    } catch { this.busy--; throw new JobError("JOB_STORAGE_ERROR", "无法保存任务，尚未调用模型，请检查服务存储后重试。", 503); }
    this.records.set(id, job);
    this.recent.push(now);
    const settled = Promise.resolve().then(async () => {
      try {
        job.result = { ...await this.generate(input, AbortSignal.timeout(90000), base), requestId: id, request: input };
        job.status = "completed";
        job.generation = job.result.generation;
      } catch (error) {
        job.status = "failed";
        if (error && typeof error === "object" && "generation" in error) job.generation = error.generation as PlanResult["generation"];
        const known = error instanceof Error && "code" in error && "status" in error && typeof error.code === "string" && (error.code.startsWith("AI_") || ["TIMEOUT", "UPSTREAM_ERROR", "UPSTREAM_UNAVAILABLE", "INVALID_AI_OUTPUT", "UNSATISFIED_INTERESTS", "INSUFFICIENT_SHOPPING_DATA", "CONFLICTING_REQUIREMENTS", "UNSUPPORTED_DESTINATION", "INSUFFICIENT_DATA", "UNSATISFIED_CONSTRAINTS"].includes(error.code));
        job.error = known ? { code: String((error as JobError).code), message: (error as Error).message, status: Number((error as JobError).status) || 502 } : { code: "INTERNAL_ERROR", message: "生成未完成，请稍后主动重试。", status: 500 };
      }
      console.info(JSON.stringify({ event: "plan_finished", requestId: id, status: job.status, elapsedMs: this.now() - now, code: job.error?.code, generation: job.generation }));
      try { await this.repository.write(job); } catch { console.error("plan_job_result_persist_failed"); }
    }).finally(() => { this.busy--; this.running.delete(id); });
    this.running.set(id, settled);
    if (now - this.lastPrune > 60000) {
      this.lastPrune = now;
      for (const [key, saved] of this.records) if (now - saved.createdAt >= 86400000) this.records.delete(key);
      void this.repository.prune(now - 86400000).catch(() => {});
    }
    return { job, settled };
  }
}
