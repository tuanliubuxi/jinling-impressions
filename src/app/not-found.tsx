import Link from "next/link";

export default function NotFound() {
  return <section className="container section"><h1>这条街巷还没找到</h1><p>页面不存在，回到首页继续探索南京。</p><Link href="/" className="button">返回首页</Link></section>;
}
