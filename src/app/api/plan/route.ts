import { generatePlan, PlanError } from "@/lib/deepseek.server";
import { parsePlanRequest } from "@/lib/plan-contract";

export const runtime = "nodejs";
export const maxDuration = 120;

// 本地初版的进程级限流；多实例部署前需要改为共享限流。
let inFlight = 0;
let recentRequests: number[] = [];
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

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
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ code: "ORIGIN_REJECTED", message: "请从本站发起规划请求。" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply({ code: "INVALID_REQUEST", message: "请使用 JSON 格式提交需求。" }, 415);
  let input;
  try {
    const body = await readBody(request);
    input = parsePlanRequest(body);
  } catch (error) {
    if (error instanceof PlanError) return reply({ code: error.code, message: error.message }, error.status);
    return reply({ code: "INVALID_REQUEST", message: error instanceof Error ? error.message : "请检查输入。" }, 400);
  }
  const now = Date.now();
  recentRequests = recentRequests.filter(time => now - time < 60000);
  if (inFlight >= 2 || recentRequests.length >= 10) return reply({ code: "RATE_LIMITED", message: "请求较多，请稍后再试。" }, 429);
  recentRequests.push(now);
  inFlight++;
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90000)]);
    return reply(await generatePlan(input, signal));
  } catch (error) {
    if (error instanceof PlanError) return reply({ code: error.code, message: error.message }, error.status);
    return reply({ code: "INTERNAL_ERROR", message: "暂时无法生成行程，请稍后重试。" }, 500);
  } finally { inFlight--; }
}
