import Image from "next/image";
import Link from "next/link";
import { PlaceCard } from "@/components/place-card";
import { places } from "@/data/places";

export default function HomePage() {
  return <>
    <section className="hero"><Image src="/images/banner_home.jpg" alt="南京秦淮河城市风光" fill priority sizes="100vw" className="hero-image" /><div className="hero-shade" /><div className="container hero-content"><span className="badge">我的家乡 · 南京</span><h1>遇见南京，<br />从你的旅程开始。</h1><p>说说你的时间、预算与兴趣，让 AI 结合现有地点资料，为你整理一份南京游览建议。</p><div className="actions"><Link className="button" href="/planner">开始规划</Link><Link className="button secondary" href="/explore">探索金陵</Link></div><small>当前覆盖精选地点，交通、费用与开放安排需在出发前核实。</small></div></section>
    <section className="container section"><span className="eyebrow">EXPLORE NANJING</span><h2>先认识这座城</h2><p className="intro">延续原项目的南京主题，让城市内容成为后续智能规划的基础。</p><div className="grid">{places.map(place => <PlaceCard key={place.id} place={place} />)}</div></section>
  </>;
}
