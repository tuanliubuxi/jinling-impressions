import type { PlanRequest, PlanResult } from "@/lib/plan-contract";
import { parsePlanRequest } from "@/lib/plan-contract";
import { isPlanResult, isRequestId, jobLifetimeMs, type SavedTask } from "@/lib/plan-job-contract";

export const plannerSessionKey = "jinling-planner-v2";
export const draftFields = ["duration", "date", "startPoint", "budget", "walking", "interests"] as const;
export type PlannerDraft = Record<typeof draftFields[number], string>;
export type PlannerSession = { version: 2; savedAt: number; draft: PlannerDraft; task?: SavedTask; retryTask?: SavedTask; result?: PlanResult; resultInput?: PlanRequest };
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
    return { version: 2, savedAt: value.savedAt, draft: value.draft, task: task(value.task), retryTask: task(value.retryTask), result: isPlanResult(value.result) ? value.result : undefined, resultInput };
  } catch { return undefined; }
}

export function writePlannerSession(storage: Storage, session: PlannerSession): boolean {
  try { storage.setItem(plannerSessionKey, JSON.stringify(session)); return true; } catch { return false; }
}
