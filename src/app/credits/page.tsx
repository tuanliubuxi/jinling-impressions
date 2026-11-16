import Link from "next/link";
import { places } from "@/data/places";
import { placeImages } from "@/data/place-images";

export const metadata = { title: "图片来源与署名" };

export default function ImageCredits() {
  return <div className="container section"><span className="eyebrow">IMAGE CREDITS</span><h1>影像里的南京</h1><p className="intro">感谢摄影者留下这些城市记录。照片依各文件页许可使用，展示资源经过缩放与 WebP 转码；拍摄日期与当下景观可能不同。各图许可单独适用。</p>{places.filter(place => placeImages[place.id]?.length).map(place => <section key={place.id} className="reference-section"><h2><Link href={`/explore/${place.id}`}>{place.name} ↗</Link></h2><ul>{placeImages[place.id].map(photo => <li key={photo.src}><a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.caption}</a> — {photo.author}，{photo.takenAt}，<a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a>；{photo.changes}。</li>)}</ul></section>)}</div>;
}
