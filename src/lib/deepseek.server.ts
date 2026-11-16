import { plannerPrompt } from "@/lib/planner-prompt";
import { places, contentReviewedAt } from "@/data/places";
import { selectPlanningPlaces, planningContext, planningRequirements, assertRequiredStops } from "@/lib/planning-context";
import { cityChapters } from "@/data/city-guide";
import { itinerarySchema, unwrapItinerary } from "@/lib/itinerary-schema";
import { getAIConfig } from "@/lib/ai-config.server";
import { parsePlanDraft, type PlanRequest, type PlanResult } from "@/lib/plan-contract";
import { preflight, assessPlan, QualityError, policyFor, availablePlaces } from "@/lib/plan-quality";
import { visitReferences } from "@/data/travel-reference";
import { visitSchedule } from "@/lib/visit-schedule";

export class PlanError extends Error {
  generation?: PlanResult["generation"];
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export async function generatePlan(input: PlanRequest, signal: AbortSignal, base?: PlanResult): Promise<PlanResult> {
  const started = Date.now();
  preflight(input, places);
  let config: ReturnType<typeof getAIConfig>;
  try { config = getAIConfig(); } catch {
    throw new PlanError("AI_NOT_CONFIGURED", "服务端模型配置不完整，请检查本地环境配置并重启服务。", 503);
  }
  const requirements = planningRequirements(input, places);
  const policy = policyFor(input, places);
  const availableIds = new Set(availablePlaces(input, places).map(place => place.id));
  if (requirements.requiredPlaceIds.some(id => !availableIds.has(id))) throw new PlanError("CONFLICTING_REQUIREMENTS", "需要的游览体验与日期、室内、体力或预算条件冲突，请调整条件。尚未调用模型。", 422);
  if (requirements.shoppingOnly && input.duration === "两日游") throw new PlanError("INSUFFICIENT_SHOPPING_DATA", "目前购物资料集中在新街口一个商圈，不能可靠地编成两天不重复的路线。请改为半日/一日，或补充其他兴趣。尚未调用模型。", 422);
  if (requirements.singleDestination && input.duration === "两日游") throw new PlanError("INSUFFICIENT_DATA", "你只选择了一处目的地，目前不能将同一地点重复编成两天路线。请缩短时长或补充其他地点。尚未调用模型。", 422);
  const capacity = (input.duration === "半日游" || policy.lowWalking ? 2 : 3) * (input.duration === "两日游" ? 2 : 1);
  if (requirements.requiredPlaceIds.length > capacity) throw new PlanError("CONFLICTING_REQUIREMENTS", "点名的主要目的地超过这次时长的建议数量，请减少地点或增加游玩时间。尚未调用模型。", 422);
  const candidates = selectPlanningPlaces(input, places);
  const singleStop = requirements.shoppingOnly || requirements.singleDestination || candidates.length === 1;
  const context = candidates.map(place => ({ ...planningContext(place, places), visitReference: visitReferences[place.id], dailyAvailability: visitSchedule(place.id, input) }));
  const system = plannerPrompt;
  let upstream: Response;
  try {
    upstream = await fetch(new URL("/beta/chat/completions", config.endpoint).href, {
      method: "POST", cache: "no-store", redirect: "error", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model, stream: false, max_tokens: 6000,
        thinking: { type: "disabled" }, temperature: 0.3,
        tools: [{ type: "function", function: { name: "submit_itinerary", description: "Submit the itinerary", strict: true, parameters: itinerarySchema(input, candidates.map(place => place.id), policy.lowWalking, singleStop) } }],
        tool_choice: { type: "function", function: { name: "submit_itinerary" } },
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify({ request: input, requirements, policy: policyFor(input, places), basePlan: base ? { title: base.title, summary: base.summary, days: base.days, budgetAdvice: base.budgetAdvice, tips: base.tips } : undefined, cityBackground: requirements.shoppingOnly ? [] : cityChapters, places: context }) }],
      }),
    });
  } catch {
    if (signal.aborted) throw new PlanError("TIMEOUT", "生成已取消或等待超时，请稍后重试。", 504);
    throw new PlanError("UPSTREAM_UNAVAILABLE", "暂时无法连接模型服务，请稍后重试。", 502);
  }
  if (!upstream.ok) {
    // 不返回上游原始错误，避免意外暴露密钥或服务端细节。
    const errors: Record<number, [string, string, number]> = {
      401: ["AI_AUTH_FAILED", "模型服务认证失败，请检查 API Key 后重启服务。", 503],
      402: ["AI_BALANCE_REQUIRED", "模型账户余额不足，请检查 API 账户额度。", 503],
      429: ["AI_RATE_LIMITED", "模型服务繁忙或请求过于频繁，请稍后重试。", 429],
    };
    const [code, message, status] = errors[upstream.status] || ["UPSTREAM_ERROR", "模型服务暂时无法完成请求，请稍后重试。", 502];
    throw new PlanError(code, message, status);
  }
  let generation: PlanResult["generation"] = { model: config.model, elapsedMs: Date.now() - started };
  let rawArguments: string | undefined;
  try {
    const payload = await upstream.json();
    const usage = payload.usage;
    generation = { model: config.model, elapsedMs: Date.now() - started, ...(usage && [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every(n => Number.isInteger(n) && n >= 0) ? { usage: { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens } } : {}) };
    const choice = payload.choices?.[0];
    const calls = choice?.message?.tool_calls;
    if (!["stop", "tool_calls"].includes(choice?.finish_reason) || !Array.isArray(calls) || calls.length !== 1 || calls[0].function?.name !== "submit_itinerary" || typeof calls[0].function.arguments !== "string") throw new Error("Incomplete");
    rawArguments = calls[0].function.arguments;
    const draft = parsePlanDraft(unwrapItinerary(JSON.parse(calls[0].function.arguments), input, policy.lowWalking, singleStop), input, candidates.map(place => place.id));
    const selected = new Set(draft.days.flatMap(day => day.stops.map(stop => stop.placeId)));
    assertRequiredStops(requirements.requiredPlaceIds, draft.days.flatMap(day => day.stops.filter(stop => !stop.optional).map(stop => stop.placeId)));
    const quality = assessPlan(draft, input, places);
    return {
      ...draft,
      generation, quality,
      warnings: [
        "停留时长是编辑参考，不含转场、排队与餐休；按天气和体力灵活调整。",
        `每人 ${input.budget} 元是预算目标，门票、餐饮和交通的实际支出需另核实，尚未汇总报价。`,
        `历史文化资料整理于 ${contentReviewedAt}；${input.date} 的开放、预约与实际交通请在出发前确认。`,
      ],
      sources: candidates.filter(place => selected.has(place.id)).map(place => ({
        id: place.id, name: place.name, description: place.description, region: place.region, image: place.image,
        durationMinutes: place.practical.durationMinutes, effort: place.practical.effort,
        arrival: visitReferences[place.id]?.entry || place.practical.arrival,
        ticket: visitReferences[place.id] ? `${visitReferences[place.id].booking} ${visitReferences[place.id].ticketYuan !== undefined ? `成人参考${visitReferences[place.id].ticketYuan}元；` : ""}${visitReferences[place.id].ticketScope}。核对于${visitReferences[place.id].checkedAt}。` : place.practical.ticket,
        reminder: visitReferences[place.id] ? `${visitReferences[place.id].opening} ${place.practical.reminder}` : place.practical.reminder,
        references: [...place.sources, ...(visitReferences[place.id] && !place.sources.some(source => source.url === visitReferences[place.id].source.url) ? [visitReferences[place.id].source] : [])],
      })),
    };
  } catch (error) {
    if (process.env.EVAL_CAPTURE_OUTPUTS === "1") {
      // 仅显式开启的本地评估使用；默认不记录用户原文，不向浏览器返回。
      try { const fs = await import("node:fs/promises"); await fs.mkdir(".local/evaluations", { recursive: true }); await fs.writeFile(`.local/evaluations/rejected-${Date.now()}.json`, JSON.stringify({ input, rawArguments, reason: error instanceof Error ? error.message : "Unknown" }), "utf8"); } catch {}
    }
    const failure = signal.aborted ? new PlanError("TIMEOUT", "等待超时，没有自动再次调用模型。", 504) : error instanceof QualityError ? new PlanError(error.code, error.message, error.status) : error instanceof Error && error.message === "UNSATISFIED_INTERESTS" ? new PlanError("UNSATISFIED_INTERESTS", "模型结果遗漏了你明确要求的地点或购物安排，已阻止展示不匹配的攻略。没有自动再次调用模型。", 502) : new PlanError("INVALID_AI_OUTPUT", "模型未返回可用的行程，没有自动再次调用模型。", 502);
    failure.generation = generation; throw failure;
  }
}
