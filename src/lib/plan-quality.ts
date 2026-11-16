import type { PlanDraft, PlanRequest } from "@/lib/plan-contract";
import type { Place } from "@/types/place";
import { visitReferences, transferReserve } from "@/data/travel-reference";
import { namesFor, mentionedNames, affirmative } from "@/lib/place-match";

export class QualityError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}
export function queryFor(input: PlanRequest) { return `${input.interests}。${input.revision?.instruction || ""}`; }
export function policyFor(input: PlanRequest, catalog: Place[]) {
  const query = queryFor(input).toLowerCase();
  const isExcluded = (words: string[]) => {
    const clauses = query.split(/[，。；,;、]/).filter(clause => words.some(word => clause.includes(word)));
    const last = clauses.at(-1) || "";
    return words.some(word => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:不去|不要|不想去|不逛|不需要|避开|删除|去掉|取消|排除)[^，。；,;、]{0,8}${escaped}|不${escaped}`).test(last);
    });
  };
  const excluded = catalog.filter(place => isExcluded([...mentionedNames(query, place, catalog), ...(place.id === "xinjiekou" ? ["购物", "商场", "逛街", "买东西", "shopping", "mall"] : [])])).map(place => place.id);
  const indoorOnly = /室内|不淋雨|避雨|不去户外|不要户外/.test(query) && !/不想.{0,2}室内|不要.{0,2}室内/.test(query);
  const lowWalking = input.walking === "少走路" || /轮椅|行动不便|腿脚不便|少走路|减少步行|不爬山|不登阶/.test(query);
  const noTickets = /不买票|不去收费|只去免费/.test(query);
  const unknown = ["南京博物院", "总统府", "红山动物园", "侵华日军南京大屠杀遇难同胞纪念馆", "牛首山", "鸡鸣寺", "栖霞山", "汤山"].filter(word => query.includes(word) && !isExcluded([word]) && !catalog.some(place => namesFor(place).includes(word)));
  return { excluded, indoorOnly, lowWalking, noTickets, unknown };
}
export function availablePlaces(input: PlanRequest, catalog: Place[]) {
  const policy = policyFor(input, catalog);
  return catalog.filter(place => !policy.excluded.includes(place.id) && (!policy.indoorOnly || visitReferences[place.id]?.environment === "indoor") && (!policy.lowWalking || place.practical.effort !== "较高") && (!(policy.noTickets || input.budget === 0) || place.admission !== "ticketed" && (visitReferences[place.id]?.ticketYuan ?? 0) === 0) && (visitReferences[place.id]?.ticketYuan === undefined || visitReferences[place.id].ticketYuan! <= input.budget));
}
export function preflight(input: PlanRequest, catalog: Place[]) {
  const policy = policyFor(input, catalog);
  if (policy.unknown.length) throw new QualityError("UNSUPPORTED_DESTINATION", `目前缺少${policy.unknown.join("、")}的可靠资料，不能把其他景点当作替代完成你的要求。可先从探索页现有目的地选择，或移除该要求。尚未调用模型。`);
  const explicit = catalog.filter(place => mentionedNames(queryFor(input), place, catalog).some(name => affirmative(queryFor(input), name)) && !policy.excluded.includes(place.id));
  if (explicit.reduce((sum, place) => sum + (visitReferences[place.id]?.ticketYuan ?? 0), 0) > input.budget) throw new QualityError("CONFLICTING_REQUIREMENTS", "点名地点的成人参考票价小计已超过预算，请调整地点或预算；尚未调用模型。");
  if (explicit.some(place => policy.indoorOnly && visitReferences[place.id]?.environment !== "indoor" || policy.lowWalking && place.practical.effort === "较高" || (policy.noTickets || input.budget === 0) && place.admission === "ticketed" || (visitReferences[place.id]?.ticketYuan ?? 0) > input.budget)) throw new QualityError("CONFLICTING_REQUIREMENTS", "点名的地点与室内、少走路或预算条件存在冲突，请调整条件；尚未调用模型。");
  const available = availablePlaces(input, catalog);
  if (!available.length || input.duration === "两日游" && available.length < 2) throw new QualityError("INSUFFICIENT_DATA", "现有资料不足以在这些条件下安排不重复的路线，请缩短时长或调整要求。尚未调用模型。");
  return policy;
}
export function assessPlan(draft: PlanDraft, input: PlanRequest, catalog: Place[]) {
  const policy = policyFor(input, catalog);
  const allowed = new Set(availablePlaces(input, catalog).map(place => place.id));
  const periods = ["上午", "下午", "傍晚", "夜间"];
  const days = draft.days.map(day => {
    const main = day.stops.filter(stop => !stop.optional);
    if (day.stops.some(stop => !allowed.has(stop.placeId))) throw new QualityError("UNSATISFIED_CONSTRAINTS", "模型安排了与排除地点、体力、室内或预算条件冲突的地点，未展示为成功。", 502);
    if (day.stops.some((stop, i) => i > 0 && periods.indexOf(stop.period) < periods.indexOf(day.stops[i - 1].period)) || day.stops.some(stop => stop.placeId === "qinhuai_night" && !["傍晚", "夜间"].includes(stop.period))) throw new QualityError("UNSATISFIED_CONSTRAINTS", "模型的游览时段顺序不合理，未展示为成功。", 502);
    const chosen = main.map(stop => catalog.find(place => place.id === stop.placeId)!);
    if (chosen.some((place, index) => index > 1 && chosen[index - 1].region !== place.region && chosen.slice(0, index - 1).some(previous => previous.region === place.region))) throw new QualityError("UNSATISFIED_CONSTRAINTS", "路线存在跨区折返，未展示为成功。", 502);
    const visit = chosen.reduce((sum, place) => sum + place.practical.durationMinutes[0], 0);
    let transfer = 0, crossRegion = 0;
    const legs = chosen.slice(1).map((place, i) => {
      const previous = chosen[i]; const minutes = transferReserve(previous.region, place.region);
      transfer += minutes[0]; if (previous.region !== place.region) crossRegion++;
      return { from: previous.name, to: place.name, minutes, mode: previous.region === place.region ? "同片区衔接，按体力选择步行或当地接驳" : "跨区，优先公共交通，具体线路行前另查", basis: "编辑预留，非实测或实时导航" };
    });
    const reserve = input.duration === "半日游" ? 60 : 120;
    const limit = input.duration === "半日游" ? 240 : 660;
    if (visit + transfer + reserve > limit || policy.lowWalking && (main.length > 2 || visit > 240) || crossRegion > (input.duration === "半日游" ? 1 : 2)) throw new QualityError("UNSATISFIED_CONSTRAINTS", "模型路线过于紧凑，超过本次时长或步行偏好的规划上限，未展示为成功。", 502);
    return { day: day.day, visitMinutes: visit, transferReserveMinutes: transfer, mealAndArrivalReserveMinutes: reserve, totalReferenceMinutes: visit + transfer + reserve, legs };
  });
  const ticketItems = draft.days.flatMap(day => day.stops.filter(stop => !stop.optional)).map(stop => ({ place: catalog.find(place => place.id === stop.placeId)!.name, ...visitReferences[stop.placeId] })).filter(item => typeof item.ticketYuan === "number");
  const knownTickets = ticketItems.reduce((sum, item) => sum + (item.ticketYuan ?? 0), 0);
  if (knownTickets > input.budget) throw new QualityError("UNSATISFIED_CONSTRAINTS", "已知成人参考票价小计超过预算，未展示为成功。", 502);
  const dailyAllowance = input.duration === "半日游" ? 35 : 70;
  const suggestedReserve = knownTickets + dailyAllowance * draft.days.length;
  return { days, knownTicketsYuan: knownTickets, suggestedReserveYuan: suggestedReserve, budgetTight: suggestedReserve > input.budget, ticketItems: ticketItems.map(({ place, ticketYuan, ticketScope, source, checkedAt }) => ({ place, ticketYuan: ticketYuan!, ticketScope, source, checkedAt })), notes: ["时间按主要站点最短编辑停留＋转场预留＋到达/返程与餐休预留检查，不是实际通行测算；备选站点另占时间。", `餐饮与市内交通另按每天${dailyAllowance}元作编辑预留，不是报价；不含住宿、城际交通、购物、船票及其他可选项目。`, ...(suggestedReserve > input.budget ? ["预算低于本站编辑预留，需自带餐食、减少消费或增加预算；当前不能保证全程费用可覆盖。"] : [])] };
}
