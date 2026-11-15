import { mkdir, readFile, writeFile, rename, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { isPlanResult, isRequestId } from "@/lib/plan-job-contract";
import { PlanJobs, JobError, type PlanJob, type JobRepository } from "@/lib/plan-jobs";
import { generatePlan } from "@/lib/deepseek.server";

const directory = path.join(process.cwd(), ".local", "plan-jobs");
function file(id: string) {
  if (!isRequestId(id)) throw new JobError("INVALID_REQUEST_ID", "任务编号无效。", 400);
  return path.join(directory, `${id}.json`);
}
const repository: JobRepository = {
  async read(id) {
    try {
      const job = JSON.parse(await readFile(file(id), "utf8"));
      if (job.version !== 1 || job.requestId !== id || typeof job.inputHash !== "string" || typeof job.createdAt !== "number" || !["pending", "completed", "failed"].includes(job.status) || job.status === "completed" && !isPlanResult(job.result) || job.status === "failed" && (!job.error || typeof job.error.message !== "string")) throw new Error("Invalid job file");
      return job as PlanJob;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
      throw new JobError("JOB_STORAGE_ERROR", "任务记录暂时无法读取，不会重新调用模型。", 503);
    }
  },
  async write(job) {
    await mkdir(directory, { recursive: true });
    const temporary = `${file(job.requestId)}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(job), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file(job.requestId));
  },
  async prune(before) {
    for (const name of await readdir(directory)) {
      if (!name.endsWith(".json") || !isRequestId(name.slice(0, -5))) continue;
      const job = await repository.read(name.slice(0, -5));
      if (job && job.createdAt < before) await unlink(file(job.requestId));
    }
  },
};

// 开发热更新保留同进程任务，重启则从磁盘恢复已完成结果。
const runtime = globalThis as typeof globalThis & { jinlingPlanJobsV1?: PlanJobs };
export const planJobs = runtime.jinlingPlanJobsV1 ??= new PlanJobs(repository, generatePlan);
