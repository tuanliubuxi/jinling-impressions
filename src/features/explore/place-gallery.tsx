"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { PlaceImage } from "@/data/place-images";

export function PlaceGallery({ name, images }: { name: string; images: PlaceImage[] }) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | null>(null);
  const swiped = useRef(false);
  if (!images.length) return <div className="container gallery-pending"><p>这里的实景图片正在补充，先从下方看点与游览指南认识{name}。</p></div>;
  const current = images[index];
  const move = (amount: number) => setIndex(value => (value + amount + images.length) % images.length);
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); }
  };
  const picture = (large = false) => <Image key={current.src} src={current.src} alt={current.alt} fill sizes={large ? "100vw" : "(max-width: 1180px) 100vw, 1180px"} priority={!large && index === 0} className="gallery-photo" />;
  return <section className="container place-gallery" aria-label={`${name}图片集`} onKeyDown={keys}>
    <div className="gallery-stage" onTouchStart={event => { swiped.current = false; touchStart.current = event.touches[0].clientX; }} onTouchCancel={() => { touchStart.current = null; }} onTouchEnd={event => {
      if (touchStart.current !== null) { const distance = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(distance) > 45) { swiped.current = true; move(distance > 0 ? -1 : 1); } }
      touchStart.current = null;
    }}>
      <button type="button" ref={opener} className="gallery-open" aria-label={`放大查看：${current.alt}`} onClick={() => { if (swiped.current) { swiped.current = false; return; } dialog.current?.showModal(); }}>{picture()}</button>
      {images.length > 1 && <><button type="button" className="gallery-arrow previous" aria-label="上一张图片" onClick={() => move(-1)}>←</button><button type="button" className="gallery-arrow next" aria-label="下一张图片" onClick={() => move(1)}>→</button></>}
      <span className="gallery-count" aria-hidden="true">{index + 1} / {images.length}</span>
    </div>
    <p className="gallery-caption" aria-live="polite">{current.caption}<span>摄影：{current.author} · {current.takenAt || "拍摄日期未注明"}</span></p>
    {images.length > 1 && <div className="gallery-thumbnails" role="group" aria-label="选择图片">{images.map((photo, position) => <button key={photo.src} type="button" aria-label={`第 ${position + 1} 张：${photo.alt}`} aria-pressed={position === index} onClick={() => setIndex(position)}><Image src={photo.src} alt="" width={112} height={76} sizes="112px" /></button>)}</div>}
    <details className="gallery-credit"><summary>图片来源与许可</summary><p><a href={current.sourceUrl} target="_blank" rel="noreferrer">原始文件与作者 ↗</a> · <a href={current.licenseUrl} target="_blank" rel="noreferrer">{current.license}</a> · {current.changes}。核验日期：{current.reviewedAt}。照片记录拍摄时的场景，季节与现场可能不同。</p></details>
    <dialog ref={dialog} className="gallery-dialog" aria-label={`${name}图片放大查看`} onClose={() => opener.current?.focus()} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <button type="button" className="gallery-close" aria-label="关闭放大图片" onClick={() => dialog.current?.close()}>关闭 ×</button>
      <div className="gallery-lightbox-image">{picture(true)}</div><p>{current.caption} · {index + 1} / {images.length}</p>
      {images.length > 1 && <div className="gallery-lightbox-controls"><button type="button" onClick={() => move(-1)}>← 上一张</button><button type="button" onClick={() => move(1)}>下一张 →</button></div>}
    </dialog>
  </section>;
}
