import { PlaceCard } from "@/components/place-card";
import { places } from "@/data/places";

export const metadata = { title: "探索南京" };

export default function ExplorePage() {
  return <section className="container section"><span className="eyebrow">CITY COLLECTION</span><h1>探索南京</h1><p className="intro">第一批内容来自 base，后续将补充来源、坐标、游览时长和预约信息。</p><div className="grid">{places.map(place => <PlaceCard key={place.id} place={place} />)}</div></section>;
}
