import { PlannerForm } from "@/features/planner/planner-form";

export const metadata = { title: "规划行程" };

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ interest?: string | string[] }> }) {
  const interest = (await searchParams).interest;
  const initialInterests = typeof interest === "string" ? interest.slice(0, 500) : "";
  return <section className="container section planner"><span className="eyebrow">YOUR NANJING JOURNEY</span><h1>这次，你想怎样遇见南京？</h1><p className="intro">不止一张地点清单：从兴趣出发，安排看点、停留、用餐与区域衔接，把时间留给值得细看的南京。</p><PlannerForm key={initialInterests} initialInterests={initialInterests} /></section>;
}
