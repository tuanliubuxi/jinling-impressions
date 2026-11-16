import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "金陵印象 · 南京 AI 文旅助手", template: "%s | 金陵印象" },
  description: "从南京文化探索出发，构建有来源、可调整的个性化行程规划体验。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><SiteHeader /><main>{children}</main><footer className="container footer">金陵印象 · 山水城林，古今交融<span>AI 游览建议 · 出行信息待核实</span></footer></body></html>;
}
