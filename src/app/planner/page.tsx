import { PlannerForm } from "@/features/planner/planner-form";

export const metadata = { title: "规划行程" };

export default function PlannerPage() {
  return <section className="container section planner"><span className="eyebrow">YOUR NANJING JOURNEY</span><h1>这次，你想怎样遇见南京？</h1><p className="intro">先收集时间、预算与兴趣，再逐步接入知识检索和行程校验。</p><PlannerForm /></section>;
}
