import Image from "next/image";
import Link from "next/link";
import { PlaceBrowser } from "@/features/explore/place-browser";
import { places, citySources, contentReviewedAt } from "@/data/places";
import { cityChapters, firstVisitTips } from "@/data/city-guide";

export const metadata = { title: "探索金陵 · 城市文化与目的地", description: "从六朝文脉到明代都城，从秦淮街巷到现代都市，发现南京值得细看的目的地。" };

export default function ExplorePage() {
  return <>
    <section className="explore-hero"><Image src="/images/places/citywall/78fe808af6e1.webp" alt="南京城墙与玄武湖风光" fill priority sizes="100vw" /><div className="explore-overlay" /><div className="container explore-hero-content"><span className="badge">金陵城市读本 / NANJING</span><h1>一座南京，<br />不止一种读法。</h1><p>先认识这座城的来处，再走进它的山水、街巷和人间烟火。</p><a className="button" href="#destinations">寻找我的目的地 ↓</a></div></section>
    <nav className="explore-subnav container" aria-label="探索页面目录"><a href="#city-culture">01 / 读懂南京</a><a href="#destinations">02 / 选择目的地</a><a href="#first-visit">03 / 初访指南</a></nav>
    <section className="container section" id="city-culture"><div className="editorial-heading"><div><span className="eyebrow">THE STORY OF A CITY</span><h2>山水之间，叠着一部城市史。</h2></div><p>南京的历史不是一条单线。把不同时代放回各自的位置，古都的厚重与街头的轻盈便都有了来处。</p></div><div className="culture-chapters">{cityChapters.map((chapter, index) => <article key={chapter.era}><span className="chapter-number">0{index + 1}</span><span className="eyebrow">{chapter.era}</span><h3>{chapter.title}</h3><p>{chapter.text}</p></article>)}</div><details className="editorial-sources"><summary>历史文化参考资料</summary><ul>{citySources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul><p>整理日期：{contentReviewedAt}。历史依参考资料整理，玩法、时长与取舍为编辑建议。</p></details></section>
    <section className="destination-section" id="destinations"><div className="container section"><span className="eyebrow">PLACES WORTH YOUR TIME</span><div className="section-row"><h2>把时间留给喜欢的地方</h2><span>{places.length} 处精选目的地 / {new Set(places.map(place => place.region)).size} 个游览片区</span></div><p className="intro">点开图片卡片，了解历史背景、核心看点、建议走法，以及出发前需要知道的事。</p><PlaceBrowser places={places} /></div></section>
    <section className="container section" id="first-visit"><span className="eyebrow">YOUR FIRST NANJING VISIT</span><h2>第一次来，先知道这些。</h2><div className="first-visit-grid">{firstVisitTips.map((tip, index) => <article key={tip.title}><span>0{index + 1}</span><div><h3>{tip.title}</h3><p>{tip.text}</p></div></article>)}</div><div className="explore-cta"><div><h3>有了心仪的地方，再把它们串起来。</h3><p>告诉我们时间、预算与兴趣，生成一份有重点的游览建议。</p></div><Link className="button" href="/planner">开始规划行程 ↗</Link></div></section>
  </>;
}
