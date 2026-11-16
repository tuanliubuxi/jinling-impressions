import type { Place } from "@/types/place";
import type { PlanRequest } from "@/lib/plan-contract";

function affirmative(query: string, phrase: string): boolean {
  let index = query.indexOf(phrase);
  while (index >= 0) {
    const prefix = query.slice(Math.max(0, index - 10), index);
    if (!/(不想|不要|不去|不逛|不喜欢|不考虑|不安排|不看|避开|排除)[^，。；,;、]{0,6}$/.test(prefix) || /不要错过$/.test(prefix)) return true;
    index = query.indexOf(phrase, index + phrase.length);
  }
  return false;
}

export function planningRequirements(input: PlanRequest, catalog: Place[]) {
  const query = input.interests.toLowerCase();
  const wants = (words: string[]) => words.some(word => affirmative(query, word));
  const shopping = wants(["商场", "购物", "逛街", "买东西", "商圈", "shopping", "mall", "德基", "金鹰", "新百", "中央商场"]);
  const ming = wants(["明朝", "明代", "明史", "朱元璋"]);
  const aliases: Record<string, string[]> = { citywall: ["明城墙", "城墙"], xinjiekou: ["德基", "金鹰", "新百", "中央商场"] };
  const requiredPlaceIds = catalog.filter(place => wants([place.name.toLowerCase(), ...(aliases[place.id] || [])])).map(place => place.id);
  if (shopping && catalog.some(place => place.id === "xinjiekou") && !requiredPlaceIds.includes("xinjiekou")) requiredPlaceIds.push("xinjiekou");
  const otherInterests = wants(["历史", "文化", "明朝", "明代", "明史", "公园", "湖泊", "自然", "夜景", "夜游", "小吃", "街巷", "登山", "爬山"]);
  const shoppingOnly = shopping && !otherInterests && requiredPlaceIds.every(id => id === "xinjiekou");
  return { shopping, shoppingOnly, ming, requiredPlaceIds };
}

// 先保留明确需求，再补充主题候选，不能把购物地点因资料库排序而挤出去。
export function selectPlanningPlaces(input: PlanRequest, catalog: Place[]): Place[] {
  const query = input.interests.toLowerCase();
  const requirements = planningRequirements(input, catalog);
  if (requirements.shoppingOnly) return catalog.filter(place => place.id === "xinjiekou");
  const ranked = catalog.map((place, index) => {
    let score = place.themes.reduce((sum, theme) => sum + (affirmative(query, theme.toLowerCase()) ? 3 : 0), 0);
    if (requirements.requiredPlaceIds.includes(place.id)) score += 100;
    if (requirements.ming && place.themes.includes("明代")) score += 20;
    if (input.walking === "少走路" && place.practical.effort === "较高") score -= 4;
    return { place, score, index };
  });
  return ranked.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 8).map(item => item.place);
}

export function assertRequiredStops(requiredIds: string[], selectedIds: string[]) {
  if (requiredIds.some(id => !selectedIds.includes(id))) throw new Error("UNSATISFIED_INTERESTS");
}

export function planningContext(place: Place) {
  return {
    id: place.id, name: place.name, region: place.region, themes: place.themes,
    description: place.description, history: place.history,
    highlights: place.highlights, suggestedWalk: place.walk,
    editorialVisitMinutes: place.practical.durationMinutes, effort: place.practical.effort,
    bestTime: place.practical.bestTime, arrival: place.practical.arrival,
    ticketNote: place.practical.ticket, reminder: place.practical.reminder,
    foodNote: place.foodNote, nearbyIds: place.nearbyIds,
  };
}
