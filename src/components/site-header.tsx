import Link from "next/link";

export function SiteHeader() {
  return <header className="site-header"><div className="container navbar">
    <Link href="/" className="brand">金陵印象<span>南京 AI 文旅助手</span></Link>
    <nav aria-label="主导航"><Link href="/">首页</Link><Link href="/explore">探索南京</Link><Link href="/planner">规划行程</Link></nav>
  </div></header>;
}
