import { visitReferences } from "@/data/travel-reference";
import type { PlanRequest } from "@/lib/plan-contract";

// 国办发明电〔2025〕7号。假期不等于已确认开馆，须另查场馆公告。
export const holidaySource = "https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html";
const holidays2026 = [["01-01", "01-03"], ["02-15", "02-23"], ["04-04", "04-06"], ["05-01", "05-05"], ["06-19", "06-21"], ["09-25", "09-27"], ["10-01", "10-07"]];

export function tripDates(input: PlanRequest) {
  return Array.from({ length: input.duration === "两日游" ? 2 : 1 }, (_, index) => {
    const date = new Date(`${input.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}
export function visitDay(placeId: string, date: string) {
  const reference = visitReferences[placeId];
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const regularClosed = !!reference?.closedWeekdays?.includes(weekday);
  const holiday = date.startsWith("2026-") && holidays2026.some(([start, end]) => date.slice(5) >= start && date.slice(5) <= end);
  const uncertain = regularClosed && (holiday || !date.startsWith("2026-"));
  return {
    date, weekday, available: !regularClosed || uncertain,
    note: uncertain ? "遇常规闭馆日，但假期或该年份的特殊开放尚需查官方公告，未确认可入场。" : regularClosed ? "按常规周闭馆规则，本日不安排；若官方另有开放公告，请核实后调整日期。" : "未触发已收录的周闭馆规则；不代表已核实余票、临时闭馆或已完成预约。",
  };
}
export function visitSchedule(placeId: string, input: PlanRequest) {
  return tripDates(input).map(date => visitDay(placeId, date));
}
