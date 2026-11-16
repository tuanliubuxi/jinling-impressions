import type { PlanRequest } from "@/lib/plan-contract";
type Schema = Record<string, unknown>;
const text = (max: number): Schema => ({ type: "string", pattern: `^[\\s\\S]{0,${max}}$` });
function limits(input: PlanRequest, lowWalking: boolean, shoppingOnly: boolean) {
  return { days: input.duration === "两日游" ? 2 : 1, stops: shoppingOnly ? 1 : input.duration === "半日游" || lowWalking ? 2 : 3 };
}
// 扁平工具参数避免模型生成深层括号，由服务器决定天数和额外槽位上限。
export function itinerarySchema(input: PlanRequest, allowedIds: string[], lowWalking: boolean, shoppingOnly: boolean) {
  const properties: Record<string, Schema> = { title: text(80), summary: text(600) };
  const count = limits(input, lowWalking, shoppingOnly);
  for (let day = 1; day <= count.days; day++) {
    properties[`d${day}_theme`] = text(160); properties[`d${day}_meal`] = text(500);
    for (let stop = 1; stop <= count.stops; stop++) {
      const prefix = `d${day}_s${stop}_`;
      Object.assign(properties, {
        [`${prefix}include`]: { type: "boolean", description: "是否安排此站；未用槽位false，至少保留一站，不强凑地点" },
        [`${prefix}placeId`]: { type: "string", enum: allowedIds },
        [`${prefix}period`]: { type: "string", enum: ["上午", "下午", "傍晚", "夜间"] },
        [`${prefix}reason`]: text(500), [`${prefix}activity1`]: text(240), [`${prefix}activity2`]: text(240), [`${prefix}transition`]: text(400),
      });
    }
  }
  for (let i = 1; i <= 3; i++) { properties[`budget${i}`] = text(300); properties[`tip${i}`] = text(300); }
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

export function unwrapItinerary(value: unknown, input: PlanRequest, lowWalking: boolean, shoppingOnly: boolean): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid tool result");
  const root = value as Record<string, unknown>;
  const count = limits(input, lowWalking, shoppingOnly);
  const days = Array.from({ length: count.days }, (_, index) => {
    const d = index + 1;
    const stops = [];
    for (let s = 1; s <= count.stops; s++) {
      const prefix = `d${d}_s${s}_`;
      if (typeof root[`${prefix}include`] !== "boolean") throw new Error("Invalid inclusion flag");
      if (!root[`${prefix}include`]) continue;
      stops.push({ placeId: root[`${prefix}placeId`], period: root[`${prefix}period`], reason: root[`${prefix}reason`], activities: [root[`${prefix}activity1`], root[`${prefix}activity2`]], transition: root[`${prefix}transition`] });
    }
    return { day: d, theme: root[`d${d}_theme`], meal: root[`d${d}_meal`], stops };
  });
  return { title: root.title, summary: root.summary, days, budgetAdvice: [root.budget1, root.budget2, root.budget3], tips: [root.tip1, root.tip2, root.tip3] };
}
