import type { PlanRequest, PlanResult } from "@/lib/plan-contract";

export const jobLifetimeMs = 24 * 60 * 60 * 1000;
export type SavedTask = { requestId: string; input: PlanRequest; startedAt: number };
export type JobReply = { requestId: string; status: "pending" } | { requestId: string; status: "completed"; result: PlanResult };
export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

export function createRequestId(): string {
  // 局域网 HTTP 页面通常没有 crypto.randomUUID；getRandomValues 不要求 HTTPS。
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === "string"); }

// 对 API、旧浏览器缓存和本地存储共用防护，避免旧响应在渲染 .map 时崩溃。
export function isPlanResult(value: unknown): value is PlanResult {
  if (!object(value) || typeof value.title !== "string" || typeof value.summary !== "string" || !strings(value.warnings) || !strings(value.tips) || !strings(value.budgetAdvice)) return false;
  if (!Array.isArray(value.days) || !value.days.length || !Array.isArray(value.sources) || !value.sources.length) return false;
  if (value.requestId !== undefined && !isRequestId(value.requestId)) return false;
  if (value.generation !== undefined) {
    const stats = value.generation;
    if (!object(stats) || typeof stats.model !== "string" || typeof stats.elapsedMs !== "number" || !Number.isFinite(stats.elapsedMs) || stats.elapsedMs < 0) return false;
    if (stats.usage !== undefined && (!object(stats.usage) || ![stats.usage.promptTokens, stats.usage.completionTokens, stats.usage.totalTokens].every(n => typeof n === "number" && Number.isInteger(n) && n >= 0))) return false;
  }
  if (value.quality !== undefined) {
    const quality = value.quality;
    const nonnegative = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0;
    if (!object(quality) || !nonnegative(quality.knownTicketsYuan) || !nonnegative(quality.suggestedReserveYuan) || typeof quality.budgetTight !== "boolean" || !strings(quality.notes) || !Array.isArray(quality.days) || !Array.isArray(quality.ticketItems)) return false;
    if (!quality.days.every(day => object(day) && [day.day, day.visitMinutes, day.transferReserveMinutes, day.mealAndArrivalReserveMinutes, day.totalReferenceMinutes].every(nonnegative) && Array.isArray(day.legs) && day.legs.every(leg => object(leg) && [leg.from, leg.to, leg.mode, leg.basis].every(s => typeof s === "string") && Array.isArray(leg.minutes) && leg.minutes.length === 2 && leg.minutes.every(nonnegative)))) return false;
    if (!quality.ticketItems.every(item => object(item) && typeof item.place === "string" && nonnegative(item.ticketYuan) && typeof item.ticketScope === "string" && typeof item.checkedAt === "string" && object(item.source) && typeof item.source.url === "string" && typeof item.source.title === "string")) return false;
  }
  const sources = value.sources;
  if (!sources.every(source => object(source) && ["id", "name", "description", "region", "image", "effort", "arrival", "ticket", "reminder"].every(field => typeof source[field] === "string") && Array.isArray(source.durationMinutes) && source.durationMinutes.length === 2 && source.durationMinutes.every(n => typeof n === "number") && Array.isArray(source.references) && source.references.every(ref => object(ref) && typeof ref.title === "string" && typeof ref.url === "string"))) return false;
  return value.days.every(day => object(day) && typeof day.day === "number" && typeof day.theme === "string" && typeof day.meal === "string" && Array.isArray(day.stops) && day.stops.length > 0 && day.stops.every(stop => object(stop) && typeof stop.placeId === "string" && sources.some(source => source.id === stop.placeId) && typeof stop.period === "string" && typeof stop.reason === "string" && typeof stop.transition === "string" && typeof stop.optional === "boolean" && strings(stop.activities)));
}
