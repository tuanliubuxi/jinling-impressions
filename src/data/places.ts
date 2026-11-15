import type { Place } from "@/types/place";

// 从 base 内容整理的展示种子数据，尚不能作为实时出行依据。
export const places: Place[] = [
  { id: "zhongshanling", name: "中山陵", category: "景点", image: "/images/zhongshanling.jpg", description: "走进紫金山，了解南京的历史与山林风光。", verification: "待核实" },
  { id: "xuanwuhu", name: "玄武湖", category: "景点", image: "/images/xuanwuhu.jpg", description: "从湖岸绿地到城市天际线，探索山水城林。", verification: "待核实" },
  { id: "laomendong", name: "老门东", category: "文化街区", image: "/images/laomendong.jpg", description: "沿着街巷慢行，发现老城南的文化与生活。", verification: "待核实" },
];
