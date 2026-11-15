import type { PlanResult } from "@/lib/plan-contract";
import { parsePlanRequest } from "@/lib/plan-contract";
import { isPlanResult, isRequestId, jobLifetimeMs, type SavedTask } from "@/lib/plan-job-contract";

export const plannerSessionKey = "jinling-planner-v2";
export const draftFields = ["duration", "date", "startPoint", "budget", "walking", "interests"] as const;
export type PlannerDraft = Record<typeof draftFields[number], string>;
export type PlannerSession = { version: 2; savedAt: number; draft: PlannerDraft; task?: SavedTask; result?: PlanResult };
type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

export function readPlannerSession(storage: Storage, now = Date.now()): PlannerSession | undefined {
  try {
    const value = JSON.parse(storage.getItem(plannerSessionKey) || "null");
    if (!value || value.version !== 2 || typeof value.savedAt !== "number" || now - value.savedAt >= jobLifetimeMs || !value.draft || !draftFields.every(field => typeof value.draft[field] === "string")) return undefined;
    let task: SavedTask | undefined;
    if (value.task && isRequestId(value.task.requestId) && typeof value.task.startedAt === "number" && now - value.task.startedAt < jobLifetimeMs) task = { requestId: value.task.requestId, startedAt: value.task.startedAt, input: parsePlanRequest(value.task.input) };
    return { version: 2, savedAt: value.savedAt, draft: value.draft, task, result: isPlanResult(value.result) ? value.result : undefined };
  } catch { return undefined; }
}

export function writePlannerSession(storage: Storage, session: PlannerSession): boolean {
  try { storage.setItem(plannerSessionKey, JSON.stringify(session)); return true; } catch { return false; }
}
