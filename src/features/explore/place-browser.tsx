"use client";

import { useState } from "react";
import { PlaceCard } from "@/components/place-card";
import { categories } from "@/data/places";
import type { Place } from "@/types/place";

export function PlaceBrowser({ places }: { places: Place[] }) {
  const [category, setCategory] = useState<string>("全部");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered = places.filter(place => (category === "全部" || place.category === category) && `${place.name} ${place.region} ${place.themes.join(" ")}`.toLowerCase().includes(needle));
  return <>
    <div className="explore-controls"><div className="filter-tabs" role="group" aria-label="按主题浏览">{categories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="place-search"><label className="sr-only" htmlFor="place-search">搜索地点、主题或区域</label><input type="search" id="place-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索明代、秦淮、摄影…" maxLength={100} /></div></div>
    <p className="collection-count" role="status">找到 {filtered.length} 处目的地 · 停留时长为编辑建议</p>
    <div className="grid">{filtered.map(place => <PlaceCard key={place.id} place={place} />)}</div>
    {!filtered.length && <div className="empty-collection"><h3>换个关键词，再找找南京</h3><p>试试“历史”“散步”“钟山”，或查看全部目的地。</p><button className="button" type="button" onClick={() => { setCategory("全部"); setQuery(""); }}>查看全部</button></div>}
  </>;
}
