import type { PlanRequest, PlanResult } from "@/lib/plan-contract";
import { parsePlanRequest } from "@/lib/plan-contract";
import { isPlanResult, isRequestId, jobLifetimeMs, type SavedTask } from "@/lib/plan-job-contract";

export const plannerSessionKey = "jinling-planner-v2";
export const draftFields = ["duration", "date", "startPoint", "budget", "walking", "interests"] as const;
export type PlannerDraft = Record<typeof draftFields[number], string>;
export type PlanVersion = { requestId: string; input: PlanRequest; result: PlanResult; completedAt: number };
export type PlannerSession = { version: 2; savedAt: number; draft: PlannerDraft; task?: SavedTask; retryTask?: SavedTask; result?: PlanResult; resultInput?: PlanRequest; history?: PlanVersion[] };
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

export function readPlannerSession(storage: Storage, now = Date.now()): PlannerSession | undefined {
  try {
    const value = JSON.parse(storage.getItem(plannerSessionKey) || "null");
    if (!value || value.version !== 2 || typeof value.savedAt !== "number" || now - value.savedAt >= jobLifetimeMs || !value.draft || !draftFields.every(field => typeof value.draft[field] === "string")) return undefined;
    function task(data: unknown): SavedTask | undefined {
      if (!data || typeof data !== "object") return undefined;
      const item = data as SavedTask;
      try { if (isRequestId(item.requestId) && typeof item.startedAt === "number" && now - item.startedAt < jobLifetimeMs) return { requestId: item.requestId, startedAt: item.startedAt, input: parsePlanRequest(item.input) }; } catch { /* 不恢复损坏的任务。 */ }
      return undefined;
    }
    let resultInput: PlanRequest | undefined;
    try { if (value.resultInput) resultInput = parsePlanRequest(value.resultInput); } catch { /* 保留合法旧结果，不伪造其生成条件。 */ }
    const history: PlanVersion[] = [];
    for (const item of Array.isArray(value.history) ? value.history.slice(0, 5) : []) {
      try { if (isRequestId(item.requestId) && isPlanResult(item.result) && typeof item.completedAt === "number" && now - item.completedAt < jobLifetimeMs) history.push({ requestId: item.requestId, input: parsePlanRequest(item.input), result: item.result, completedAt: item.completedAt }); } catch { /* 单条损坏不丢弃其他版本。 */ }
    }
    return { version: 2, savedAt: value.savedAt, draft: value.draft, task: task(value.task), retryTask: task(value.retryTask), result: isPlanResult(value.result) ? value.result : undefined, resultInput, history };
  } catch { return undefined; }
}

export function writePlannerSession(storage: Storage, session: PlannerSession): boolean {
  try { storage.setItem(plannerSessionKey, JSON.stringify(session)); return true; } catch { return false; }
}
