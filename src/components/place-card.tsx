import Image from "next/image";
import type { Place } from "@/types/place";

export function PlaceCard({ place }: { place: Place }) {
  return <article className="card">
    <Image src={place.image} alt={place.name} width={640} height={420} className="place-image" />
    <div className="card-body"><span className="eyebrow">{place.category}</span><h3>{place.name}</h3><p>{place.description}</p><small>出行信息{place.verification}</small></div>
  </article>;
}
