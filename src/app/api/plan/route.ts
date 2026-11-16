import { after } from "next/server";
import { createHash } from "node:crypto";
import { PlanError } from "@/lib/deepseek.server";
import { parsePlanRequest } from "@/lib/plan-contract";
import { isRequestId } from "@/lib/plan-job-contract";
import { planJobs } from "@/lib/plan-job-store.server";
import { JobError, type PlanJob } from "@/lib/plan-jobs";
import { isSameSiteRequest } from "@/lib/request-origin";
import { preflight, QualityError } from "@/lib/plan-quality";
import { places } from "@/data/places";

export const runtime = "nodejs";
export const maxDuration = 120;

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function jobReply(job: PlanJob) {
  if (job.status === "completed") return reply({ status: "completed", requestId: job.requestId, result: job.result });
  if (job.status === "failed") {
    const { status, ...error } = job.error || { code: "INTERNAL_ERROR", message: "生成未完成。", status: 500 };
    return reply({ status: "failed", requestId: job.requestId, ...error, generation: job.generation }, status);
  }
  return reply({ status: "pending", requestId: job.requestId }, 202);
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("requestId");
  if (!isRequestId(id)) return reply({ code: "INVALID_REQUEST_ID", message: "任务编号无效。" }, 400);
  try {
    const job = await planJobs.get(id);
    return job ? jobReply(job) : reply({ code: "JOB_NOT_FOUND", message: "未找到这次任务，没有重新调用模型。" }, 404);
  } catch (error) {
    if (error instanceof JobError) return reply({ code: error.code, message: error.message }, error.status);
    return reply({ code: "JOB_STORAGE_ERROR", message: "暂时无法读取任务，没有重新调用模型。" }, 503);
  }
}

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new PlanError("INVALID_REQUEST", "请求内容不能为空。", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new PlanError("REQUEST_TOO_LARGE", "请求内容过长，请精简要求。", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof PlanError) throw error;
    throw new PlanError("INVALID_REQUEST", "请求格式不正确，请重新填写。", 400);
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  if (!isSameSiteRequest(request)) return reply({ code: "ORIGIN_REJECTED", message: "请求来源未通过校验，尚未创建生成任务。请从当前站点重新提交。" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ code: "INVALID_REQUEST", message: "请使用 JSON 格式提交需求。" }, 415);
  let input;
  try {
    const body = await readBody(request);
    input = parsePlanRequest(body);
  } catch (error) {
    if (error instanceof PlanError) return reply({ code: error.code, message: error.message }, error.status);
    return reply({ code: "INVALID_REQUEST", message: error instanceof Error ? error.message : "请检查输入。" }, 400);
  }
  const id = request.headers.get("idempotency-key");
  if (!isRequestId(id)) return reply({ code: "INVALID_REQUEST_ID", message: "页面版本已更新，请刷新后重新填写；尚未调用模型。" }, 400);
  try {
    // 相同任务优先读取；修改时服务器加载旧结果，不接受客户端伪造的攻略正文。
    const existing = await planJobs.get(id);
    let base;
    if (input.revision && !existing) {
      const previous = await planJobs.get(input.revision.baseRequestId);
      if (previous?.status !== "completed" || !previous.result) throw new QualityError("REVISION_NOT_FOUND", "原行程已过期或不可用，请从可读取的结果发起修改。", 404);
      base = previous.result;
    }
    if (!existing) preflight(input, places);
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const { job, settled } = await planJobs.submit(id, hash, input, base);
    // after 维持生成生命周期。浏览器断线/刷新只停止等待，不丢弃已付费的生成。
    if (settled) after(() => settled);
    return jobReply(job);
  } catch (error) {
    if (error instanceof JobError || error instanceof PlanError || error instanceof QualityError) return reply({ code: error.code, message: error.message }, error.status);
    return reply({ code: "INTERNAL_ERROR", message: "暂时无法生成行程，请稍后重试。" }, 500);
  }
}
