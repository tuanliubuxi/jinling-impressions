export const durations = ["半日游", "一日游", "两日游"] as const;
export const walkingOptions = ["少走路", "适中", "可以多走"] as const;

export type PlanRequest = {
  duration: typeof durations[number];
  budget: number;
  interests: string;
  startPoint: string;
  date: string;
  walking: typeof walkingOptions[number];
};

export type PlanDraft = {
  title: string;
  summary: string;
  days: { day: number; stops: { placeId: string; period: string; reason: string }[] }[];
  tips: string[];
};

export type PlanResult = PlanDraft & {
  warnings: string[];
  sources: { id: string; name: string; description: string }[];
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function parsePlanRequest(value: unknown): PlanRequest {
  if (!record(value) || !durations.includes(value.duration as PlanRequest["duration"])) {
    throw new Error("请选择有效的游玩时长。");
  }
  if (typeof value.budget !== "number" || !Number.isInteger(value.budget) || value.budget < 0 || value.budget > 100000) {
    throw new Error("预算须为 0—100000 元之间的整数。");
  }
  if (!text(value.interests, 500)) throw new Error("请填写兴趣要求，最多 500 字。");
  if (!text(value.startPoint, 100)) throw new Error("请填写出发位置，最多 100 字。");
  if (!walkingOptions.includes(value.walking as PlanRequest["walking"])) throw new Error("请选择步行偏好。");
  if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) throw new Error("请选择有效的出游日期。");
  const parsedDate = new Date(`${value.date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value.date) {
    throw new Error("出游日期不存在。");
  }
  return {
    duration: value.duration as PlanRequest["duration"], budget: value.budget,
    interests: value.interests.trim(), startPoint: value.startPoint.trim(),
    date: value.date, walking: value.walking as PlanRequest["walking"],
  };
}

// JSON 模式只保证 JSON 语法；仍需核对字段、地点白名单、重复地点与天数。
export function parsePlanDraft(value: unknown, request: PlanRequest, allowedIds: string[]): PlanDraft {
  const invalid = () => new Error("模型返回的行程格式不完整，请重试或简化要求。");
  if (!record(value) || !text(value.title, 80) || !text(value.summary, 600) || !Array.isArray(value.days)) throw invalid();
  const expectedDays = request.duration === "两日游" ? 2 : 1;
  if (value.days.length !== expectedDays) throw invalid();
  const seen = new Set<string>();
  const days = value.days.map((day: unknown, index: number) => {
    if (!record(day) || day.day !== index + 1 || !Array.isArray(day.stops) || !day.stops.length || day.stops.length > (request.duration === "半日游" ? 2 : 3)) throw invalid();
    const stops = day.stops.map((stop: unknown) => {
      if (!record(stop) || typeof stop.placeId !== "string" || !allowedIds.includes(stop.placeId) || seen.has(stop.placeId)) throw invalid();
      if (typeof stop.period !== "string" || !["上午", "下午", "傍晚"].includes(stop.period) || !text(stop.reason, 400)) throw invalid();
      seen.add(stop.placeId);
      return { placeId: stop.placeId, period: stop.period, reason: stop.reason.trim() };
    });
    return { day: index + 1, stops };
  });
  if (!Array.isArray(value.tips) || value.tips.length > 5 || value.tips.some(tip => !text(tip, 300))) throw invalid();
  return { title: value.title.trim(), summary: value.summary.trim(), days, tips: (value.tips as string[]).map(tip => tip.trim()) };
}
