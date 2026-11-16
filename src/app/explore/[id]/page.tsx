import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlace, places, contentReviewedAt } from "@/data/places";
import { PlaceCard } from "@/components/place-card";
import { VisitReference } from "@/components/visit-reference";

type Props = { params: Promise<{ id: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return places.map(place => ({ id: place.id })); }
export async function generateMetadata({ params }: Props) {
  const place = getPlace((await params).id);
  return { title: place ? `${place.name} · 景点与游览指南` : "地点未找到", description: place?.description };
}

export default async function PlaceDetail({ params }: Props) {
  const place = getPlace((await params).id);
  if (!place) notFound();
  const related = place.nearbyIds.map(getPlace).filter(item => item !== undefined);
  const plannerURL = `/planner?interest=${encodeURIComponent(`想游览${place.name}，关注${place.themes.slice(0, 3).join("、")}`)}`;
  return <>
    <nav className="container breadcrumb" aria-label="面包屑"><Link href="/">首页</Link><span>/</span><Link href="/explore">探索金陵</Link><span>/</span><span aria-current="page">{place.name}</span></nav>
    <section className="destination-hero"><Image src={place.image} alt={place.name} fill priority sizes="100vw" /><div className="explore-overlay" /><div className="container"><span className="badge">{place.region} · {place.category}</span><h1>{place.name}</h1><p>{place.description}</p></div></section>
    <div className="container detail-facts"><div><span>建议停留</span><strong>{place.practical.durationMinutes[0]}—{place.practical.durationMinutes[1]} 分钟</strong></div><div><span>游览体力</span><strong>{place.practical.effort}</strong></div><div><span>主题关键词</span><strong>{place.themes.slice(0, 3).join(" · ")}</strong></div><small>时长与体力为编辑参考，非实测或无障碍认证</small></div>
    <div className="container destination-layout section"><article className="destination-article"><section><span className="eyebrow">BEFORE YOU GO</span><h2>先读懂这里，再出发。</h2>{place.history.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section><section><h2>值得放慢脚步的看点</h2><div className="highlight-list">{place.highlights.map((highlight, index) => <div key={highlight.title}><span>0{index + 1}</span><div><h3>{highlight.title}</h3><p>{highlight.detail}</p></div></div>)}</div></section><section><h2>第一次来，可以这样走</h2><ol className="walking-guide">{place.walk.map(step => <li key={step}>{step}</li>)}</ol><p className="editorial-note">以上为编辑建议，请结合现场开放范围与个人体力调整。</p></section><section><h2>留给吃饭和休息的时间</h2><p>{place.foodNote}</p></section><section className="reference-section"><h3>资料与更新说明</h3><p>历史文化参考如下，游览建议由本站整理。整理日期：{contentReviewedAt}，不代表运营信息实时更新。</p><ul>{place.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul></section></article>
    <aside className="destination-aside"><span className="eyebrow">VISIT NOTES</span><h2>出行小笺</h2><dl><dt>什么时候看</dt><dd>{place.practical.bestTime}</dd><dt>如何安排到达</dt><dd>{place.practical.arrival}</dd><dt>门票与预约</dt><dd>{place.practical.ticket}</dd><dt>特别留意</dt><dd>{place.practical.reminder}</dd></dl><Link href={plannerURL} className="button">把这里加入我的计划 ↗</Link><Link href="/explore#destinations" className="back-link">← 返回目的地列表</Link></aside></div>
    <div className="container"><VisitReference placeId={place.id} /></div>
    {related.length > 0 && <section className="related-section"><div className="container section"><span className="eyebrow">KEEP EXPLORING</span><h2>还可以一起了解</h2><p className="intro">同片区或主题相关目的地，是否同日串联仍要结合时间与体力取舍。</p><div className="grid">{related.map(item => <PlaceCard key={item.id} place={item} />)}</div></div></section>}
  </>;
}
