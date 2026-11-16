import type { Place } from "@/types/place";

export function namesFor(place: Place): string[] {
  return [place.name, ...(place.aliases || []), ...(place.id === "citywall" ? ["明城墙", "城墙"] : []), ...(place.id === "xinjiekou" ? ["德基", "金鹰", "新百", "中央商场", "新街口铜像", "新街口孙中山像"] : [])];
}

// “南京城墙博物馆”中的“城墙”不能同时强制安排湖畔城墙。
export function mentionedNames(query: string, place: Place, catalog: Place[]): string[] {
  return namesFor(place).filter(name => {
    let index = query.indexOf(name);
    while (index >= 0) {
      const start = index;
      const shadowed = catalog.some(other => other.id !== place.id && namesFor(other).some(long => {
        if (long.length <= name.length) return false;
        let at = query.indexOf(long);
        while (at >= 0) { if (at <= start && at + long.length >= start + name.length) return true; at = query.indexOf(long, at + 1); }
        return false;
      }));
      if (!shadowed) return true;
      index = query.indexOf(name, index + name.length);
    }
    return false;
  });
}

export function affirmative(query: string, phrase: string): boolean {
  let index = query.indexOf(phrase);
  while (index >= 0) {
    const prefix = query.slice(Math.max(0, index - 12), index);
    if (!(/(不想|不要|不去|不逛|不喜欢|不考虑|不安排|不看|避开|排除|删除|去掉|取消)[^，。；,;、]{0,6}$/.test(prefix) || /不$/.test(prefix)) || /不要错过$/.test(prefix)) return true;
    index = query.indexOf(phrase, index + phrase.length);
  }
  return false;
}
