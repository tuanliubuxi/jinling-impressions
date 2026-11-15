import Image from "next/image";
import Link from "next/link";
import type { Place } from "@/types/place";

export function PlaceCard({ place }: { place: Place }) {
  return <Link className="card destination-card" href={`/explore/${place.id}`}>
    <div className="destination-image"><Image src={place.image} alt={place.name} width={640} height={420} sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 33vw" className="place-image" /><span className="region-chip">{place.region}</span></div>
    <div className="card-body"><span className="eyebrow">{place.category}</span><h3>{place.name}</h3><p>{place.description}</p><div className="card-meta"><span>建议 {place.practical.durationMinutes[0]}—{place.practical.durationMinutes[1]} 分钟</span><span>体力 · {place.practical.effort}</span></div><span className="card-more">读一读这里的故事 <span aria-hidden="true">↗</span></span></div>
  </Link>;
}
