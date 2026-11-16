import type { Place } from "@/types/place";
import type { PlanRequest } from "@/lib/plan-contract";
import { availablePlaces, policyFor, queryFor } from "@/lib/plan-quality";
import { affirmative, mentionedNames } from "@/lib/place-match";


export function planningRequirements(input: PlanRequest, catalog: Place[]) {
  const query = queryFor(input).toLowerCase();
  const wants = (words: string[]) => words.some(word => affirmative(query, word));
  const excluded = policyFor(input, catalog).excluded;
  const shopping = !excluded.includes("xinjiekou") && wants(["商场", "购物", "逛街", "买东西", "商圈", "shopping", "mall", "德基", "金鹰", "新百", "中央商场"]);
  const ming = wants(["明朝", "明代", "明史", "朱元璋"]);
  const requiredPlaceIds = catalog.filter(place => !excluded.includes(place.id) && wants(mentionedNames(query, place, catalog).map(name => name.toLowerCase()))).map(place => place.id);
  if (shopping && !excluded.includes("xinjiekou") && catalog.some(place => place.id === "xinjiekou") && !requiredPlaceIds.includes("xinjiekou")) requiredPlaceIds.push("xinjiekou");
  // 泛指湖景时提供一个实际湖泊站点；点名其他湖泊则尊重原选择。
  if (wants(["湖景", "湖边", "湖泊"]) && !requiredPlaceIds.some(id => /湖/.test(catalog.find(place => place.id === id)?.name || "")) && !excluded.includes("xuanwuhu") && catalog.some(place => place.id === "xuanwuhu")) requiredPlaceIds.push("xuanwuhu");
  if (wants(["夜景", "夜游", "夜色"]) && !requiredPlaceIds.some(id => ["bridge", "yuzui", "qinhuai_night"].includes(id)) && !excluded.includes("qinhuai_night") && catalog.some(place => place.id === "qinhuai_night")) requiredPlaceIds.push("qinhuai_night");
  const otherInterests = wants(["历史", "文化", "明朝", "明代", "明史", "公园", "湖泊", "自然", "夜景", "夜游", "小吃", "美食", "逛吃", "看展", "博物馆", "亲子", "动物", "街巷", "登山", "爬山"]);
  const shoppingOnly = shopping && !otherInterests && requiredPlaceIds.every(id => id === "xinjiekou");
  const food = wants(["美食", "逛吃", "小吃"]);
  const foodOnly = food && !shopping && !wants(["历史", "文化", "明史", "六朝", "近代", "看展", "博物馆", "湖景", "自然", "夜景", "夜游", "亲子"]) && requiredPlaceIds.every(id => catalog.find(place => place.id === id)?.category === "美食街巷");
  const singleDestination = requiredPlaceIds.length === 1 && !/不只|不止|不仅/.test(query) && /只去|只游览|只安排|不加其他|不叠加|别安排市区/.test(query);
  return { shopping, shoppingOnly, foodOnly, singleDestination, ming, requiredPlaceIds };
}

// 先保留明确需求，再补充主题候选，不能把购物地点因资料库排序而挤出去。
export function selectPlanningPlaces(input: PlanRequest, catalog: Place[]): Place[] {
  const query = queryFor(input).toLowerCase();
  const requirements = planningRequirements(input, catalog);
  catalog = availablePlaces(input, catalog);
  if (requirements.singleDestination) return catalog.filter(place => place.id === requirements.requiredPlaceIds[0]);
  if (requirements.shoppingOnly) return catalog.filter(place => place.id === "xinjiekou");
  if (requirements.foodOnly) return catalog.filter(place => place.category === "美食街巷");
  const ranked = catalog.map((place, index) => {
    let score = place.themes.reduce((sum, theme) => sum + (affirmative(query, theme.toLowerCase()) ? 3 : 0), 0);
    if (requirements.requiredPlaceIds.includes(place.id)) score += 100;
    if (requirements.ming && place.themes.includes("明代")) score += 20;
    if (/美食|逛吃|小吃/.test(query) && place.category === "美食街巷") score += 18;
    if (/博物馆|看展|展览/.test(query) && place.category === "博物场馆") score += 18;
    if (/亲子|孩子|儿童/.test(query) && place.themes.includes("亲子")) score += 12;
    if (/小众|安静|慢游/.test(query) && place.themes.includes("小众")) score += 10;
    if (place.remote && !requirements.requiredPlaceIds.includes(place.id) && !/远郊|郊游|登山/.test(query)) score -= 30;
    if (input.walking === "少走路" && place.practical.effort === "较高") score -= 4;
    return { place, score, index };
  });
  return ranked.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, Math.max(12, requirements.requiredPlaceIds.length)).map(item => item.place);
}

export function assertRequiredStops(requiredIds: string[], selectedIds: string[]) {
  if (requiredIds.some(id => !selectedIds.includes(id))) throw new Error("UNSATISFIED_INTERESTS");
}

export function planningContext(place: Place, catalog: Place[] = []) {
  return {
    id: place.id, name: place.name, region: place.region, themes: place.themes,
    description: place.description, history: place.history,
    highlights: place.highlights, suggestedWalk: place.walk.filter(step => !catalog.some(other => other.id !== place.id && mentionedNames(step, other, catalog).length)),
    editorialVisitMinutes: place.practical.durationMinutes, effort: place.practical.effort,
    bestTime: place.practical.bestTime, arrival: place.practical.arrival,
    ticketNote: place.practical.ticket, reminder: place.practical.reminder,
    foodNote: place.foodNote,
    environment: place.environment, admission: place.admission, remote: place.remote || false,
  };
}
