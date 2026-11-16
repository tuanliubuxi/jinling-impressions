// 运营信息与编辑预留分开维护。票价是来源中的成人普通参考价，不是当日成交价。
import { expandedPlaces } from "@/data/expanded-places";
export type VisitReference = {
  entry: string; opening: string; booking: string; ticketYuan?: number; ticketScope: string;
  environment: "outdoor" | "mixed" | "indoor"; source: { title: string; url: string }; checkedAt: string;
};

const zhongshan = { title: "中山陵园管理局 · 购票与预约提示（2025-09-30）", url: "https://zschina.nanjing.gov.cn/fjms/fwzn/mpxx/" };
const guide = { title: "中山陵园管理局 · 游览指南（2025-06-26）", url: "https://zschina.nanjing.gov.cn/zszx/dtxx/202506/t20250626_5593899.html" };
const lake = { title: "玄武湖管理处 · 景区官网", url: "https://www.xuanwuhu.net/" };
const south = { title: "秦淮区政府 · 交通优化与公共交通说明（2026-01-16）", url: "https://www.njqh.gov.cn/qhqrmzf/202601/t20260116_5770226.html" };
const shops = { title: "南京市政府 · 新街口商圈（2026-09-15）", url: "https://www.nanjing.gov.cn/zzb/ywdt/njxx/202609/t20260915_5910381.html" };
const checkedAt = "2026-11-16";
export const visitReferences: Record<string, VisitReference> = {
  mingxiaoling: { entry: "明孝陵景区：先选石象路—神道—陵宫的游览范围，再按官方导览选择入口；不默认走遍钟山。", opening: "景区与内部展馆分开开放，季节和临时安排须查当期公告。", booking: "实名购票；通过钟山风景区小程序或景区入口购票，优惠资格另核验。", ticketYuan: 70, ticketScope: "成人普通单景区参考价；不含联票、优惠及其他消费", environment: "outdoor", source: zhongshan, checkedAt },
  zhongshanling: { entry: "钟山片区中山陵陵寝：按预约检录口进入，片区到入口仍需衔接。", opening: "陵寝、墓室和附属文博场馆开放范围不同；预约日以官方当期公告为准。", booking: "陵寝实名预约免费参观，使用钟山风景区预约渠道；周边收费项目另购。", ticketYuan: 0, ticketScope: "仅陵寝预约参观，不含音乐台等项目", environment: "outdoor", source: zhongshan, checkedAt },
  wutong: { entry: "陵园路开放步道的一小段；按现场标识与主景点出口衔接，不进入车道拍照。", opening: "道路与沿线景区不是同一开放范围，临时交通管理须另核实。", booking: "道路步行与沿线景区预约分开处理。", ticketScope: "道路短线；来源未给出统一票价，不计入已知票价小计", environment: "outdoor", source: guide, checkedAt },
  citywall: { entry: "默认湖畔神策门—太平门城段，具体登城入口以现场公告为准；中华门属于另一片区。", opening: "官方英文页面常规参考 08:30—17:00，明确提示季节及活动会调整；非当日承诺。", booking: "先确认城段、售票入口和停止入场时间；优惠资格现场核验。", ticketYuan: 30, ticketScope: "神策门—太平门城段成人参考价；不套用于中华门", environment: "outdoor", source: { title: "南京城墙官方 · 开放与票务", url: "https://english.njcitywall.cn/?obj=ticket" }, checkedAt },
  xuanwuhu: { entry: "选择玄武门等一个明确入口，走附近湖岸短线；不默认完整环湖。", opening: "官网：环湖路全年24小时；五洲及情侣园4—10月06:00—22:00，11—3月06:00—21:00。临时公告优先。", booking: "公共游览免门票；游船、展馆、活动另核实。", ticketYuan: 0, ticketScope: "仅公共游览，不含游船与游乐项目", environment: "outdoor", source: lake, checkedAt },
  fuzimiao: { entry: "秦淮城南，以具体场馆或水岸落点到达；地铁夫子庙站或三山街站出站后按导向步行。", opening: "公共街巷、文庙、科举场馆分别营业；不把街区夜游等同场馆夜间开放。", booking: "节假日片区可能交通管控或预约，场馆与游船另核实。", ticketScope: "公共街巷路线；收费场馆不包含，票价尚未核实", environment: "outdoor", source: south, checkedAt },
  qinhuai_night: { entry: "夫子庙附近开放水岸步行，先确定允许停留的位置；不默认包含乘船。", opening: "傍晚或夜间观景，亮灯、活动、船班以当期公告为准。", booking: "步行、乘船和节假日预约分别确认，预留返程。", ticketScope: "仅公共水岸步行；游船价格未核实且不包含", environment: "outdoor", source: south, checkedAt },
  laomendong: { entry: "老门东公共街巷；武定门或三山街方向到达后按现场导向进入，店铺需具体定位。", opening: "街巷和店铺、展览、演出不共用营业时间，选店后另查。", booking: "节假日片区管控和演出预约单独核实。", ticketScope: "公共街巷路线；餐饮、演出与展览不包含，未核实统一票价", environment: "outdoor", source: south, checkedAt },
  bridge: { entry: "南京长江大桥南堡周边，明确观景位置；不默认步行横跨大桥。", opening: "桥面交通、南堡公园与玻璃栈道不是统一开放项目，现场公告优先。", booking: "公园与付费项目分别核实。G30观光线可作交通参考，班次当日另查。", ticketScope: "南堡周边观景；玻璃栈道等收费项目不包含，票价未核实", environment: "outdoor", source: { title: "南京交通运输局 · G30观光线（2025-08-05）", url: "https://jtj.nanjing.gov.cn/njsjtysj/202508/t20250805_5622181.html" }, checkedAt },
  xinjiekou: { entry: "新街口商圈：先选德基广场、金鹰新街口店、南京新百或中央商场中的1—2家，明确商场而非只到路口。", opening: "各商场、餐厅及活动营业时间分别查询，不假定统一10点开门或夜间营业。", booking: "普通逛店与展览、餐厅预约不同，热门活动以商场官方渠道为准。", ticketYuan: 0, ticketScope: "仅普通逛店；购物、餐饮、展览及娱乐另计", environment: "indoor", source: shops, checkedAt },
};

for (const place of expandedPlaces) {
  visitReferences[place.id] = {
    entry: place.practical.arrival,
    opening: place.practical.bestTime + "最新开放、临时闭馆与停止入场以官方当期通知为准。",
    booking: place.practical.ticket,
    ticketScope: place.admission === "public" ? "公共游览或常设参观范围；消费、临展及其他项目另核，不保证当天可入场" : "收费参观，尚未核实当日票价，不计入已知票价小计；出发前另查",
    environment: place.environment || "mixed", source: place.sources[0], checkedAt,
    ...(place.id === "nanjing-memorial" ? { ticketYuan: 0, source: place.sources[1], ticketScope: "官方展馆免费参观，须实名分馆预约；不含交通、寄存及其他服务费用" } : {}),
  };
}

// 下面不是地图计算/人工实测时长，而是本站用于避免排满行程的保守编辑预留。
export function transferReserve(fromRegion: string, toRegion: string): [number, number] {
  if (fromRegion === toRegion) return [15, 30];
  if ([fromRegion, toRegion].some(region => region === "牛首山片区" || region === "栖霞山片区")) return [90, 120];
  return [45, 75];
}
