import type { Place } from "@/types/place";
import type { PlanRequest } from "@/lib/plan-contract";

// 小型本地内容库使用透明的关键词排序，优先保留明确点名与主题匹配的资料。
export function selectPlanningPlaces(input: PlanRequest, catalog: Place[]): Place[] {
  const query = input.interests.toLowerCase();
  const ming = /明朝|明代|明史|朱元璋/.test(query);
  const ranked = catalog.map((place, index) => {
    let score = place.themes.reduce((sum, theme) => sum + (query.includes(theme.toLowerCase()) ? 3 : 0), 0);
    if (query.includes(place.name.toLowerCase())) score += 30;
    if (ming && place.themes.includes("明代")) score += 20;
    if (input.walking === "少走路" && place.practical.effort === "较高") score -= 4;
    return { place, score, index };
  });
  return ranked.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 8).map(item => item.place);
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
