"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { durations, walkingOptions, type PlanResult } from "@/lib/plan-contract";

export function PlannerForm({ initialInterests = "" }: { initialInterests?: string }) {
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (result) resultHeading.current?.focus(); }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current) return;
    const form = new FormData(event.currentTarget);
    const active = new AbortController();
    controller.current = active;
    setLoading(true); setError(""); setResult(null);
    const timeout = setTimeout(() => active.abort(), 95000);
    try {
      const response = await fetch("/api/plan", {
        method: "POST", signal: active.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration: form.get("duration"), budget: Number(form.get("budget")),
          interests: form.get("interests"), startPoint: form.get("startPoint"),
          date: form.get("date"), walking: form.get("walking"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "生成失败，请稍后重试。");
      setResult(payload as PlanResult);
    } catch (cause) {
      setError(active.signal.aborted ? "本次等待已结束，可重新生成。取消后模型服务可能仍会计费。" : cause instanceof Error ? cause.message : "连接失败，请稍后重试。");
    } finally {
      clearTimeout(timeout);
      controller.current = null;
      setLoading(false);
    }
  }
  return <>
    <div className="card form-card"><p className="notice">从明孝陵、明城墙到秦淮街巷，围绕你的兴趣选择路线。还没想好？先<Link href="/explore">探索金陵的 10 处目的地 ↗</Link></p><form onSubmit={handleSubmit}>
      <fieldset disabled={loading} className="planner-fields">
        <label htmlFor="duration">游玩时长</label><select name="duration" id="duration" defaultValue="一日游">{durations.map(value => <option key={value}>{value}</option>)}</select>
        <label htmlFor="date">出游日期</label><input name="date" id="date" type="date" required />
        <label htmlFor="startPoint">出发位置</label><input name="startPoint" id="startPoint" maxLength={100} placeholder="例如：南京南站附近" required />
        <label htmlFor="budget">每人预算（元）</label><input name="budget" id="budget" type="number" min="0" max="100000" step="1" defaultValue="300" required />
        <label htmlFor="walking">步行偏好</label><select name="walking" id="walking" defaultValue="适中">{walkingOptions.map(value => <option key={value}>{value}</option>)}</select>
        <label htmlFor="interests">兴趣与其他要求</label><textarea name="interests" id="interests" rows={4} maxLength={500} defaultValue={initialInterests} placeholder="例如：想了解明朝历史，重点看明孝陵与城墙，不赶场，留时间吃南京小吃" required />
        <p className="field-help">提交后，以上需求将发送给 DeepSeek 生成建议。请勿填写身份证号、联系电话等敏感信息。行程暂不保存，刷新后清空。</p>
        <button className="button" type="submit">{loading ? "正在生成…" : "生成我的行程"}</button>
      </fieldset>
      {loading && <button className="text-button" type="button" onClick={() => controller.current?.abort()}>取消等待</button>}
    </form>
    <p role="status" aria-live="polite" className="result">{loading ? "正在结合你的偏好与现有地点资料生成建议，请稍候…" : ""}</p>
    {error && <p className="error-message" role="alert">{error} 你填写的需求已保留，可点击生成按钮重试。</p>}
    </div>
    {result && <section className="plan-result" aria-labelledby="plan-title">
      <span className="eyebrow">YOUR NANJING FIELD GUIDE</span><h2 id="plan-title" tabIndex={-1} ref={resultHeading}>{result.title}</h2><p className="plan-overview">{result.summary}</p>
      {result.days.map(day => <section className="plan-day" key={day.day}><div className="plan-day-heading"><span>DAY {String(day.day).padStart(2, "0")}</span><div><h3>第 {day.day} 天</h3><p>{day.theme}</p></div></div><ol className="plan-stops">{day.stops.map(stop => {
        const place = result.sources.find(source => source.id === stop.placeId);
        return <li className={`card itinerary-stop${stop.optional ? " optional-stop" : ""}`} key={stop.placeId}>
          {stop.optional && <p className="optional-label">可选加游 · 有时间和体力再去，可以直接略过</p>}
          <div className="stop-heading">{place && <Link href={`/explore/${stop.placeId}`} tabIndex={-1} aria-hidden="true"><Image src={place.image} alt="" width={180} height={130} className="stop-photo" /></Link>}<div><span className="eyebrow">{stop.period} · {place?.region}</span><h4><Link href={`/explore/${stop.placeId}`}>{place?.name} <span aria-hidden="true">↗</span></Link></h4>{place && <span className="stop-duration">建议停留 {place.durationMinutes[0]}—{place.durationMinutes[1]} 分钟 · 体力 {place.effort}</span>}</div></div>
          <p className="stop-reason">{stop.reason}</p><h5>到了这里，具体看什么</h5><ol className="stop-activities">{stop.activities.map((activity, index) => <li key={index}>{activity}</li>)}</ol>
          <div className="stop-transition"><strong>到达与衔接</strong><p>{stop.transition}</p></div>
          {place && <details className="stop-practical"><summary>门票、入口与体力提醒</summary><p>{place.arrival}</p><p>{place.ticket}</p><p>{place.reminder}</p></details>}
        </li>;
      })}</ol><aside className="meal-card"><span className="eyebrow">FOOD & REST</span><h4>把用餐与休息安排进去</h4><p>{day.meal}</p></aside></section>)}
      <section className="budget-card"><span className="eyebrow">SPEND WITH INTENTION</span><h3>这趟旅程，预算怎么取舍</h3><ul>{result.budgetAdvice.map((advice, index) => <li key={index}>{advice}</li>)}</ul><small>这是支出安排思路，不是已核算的总价。</small></section>
      {result.tips.length > 0 && <div className="plan-tips"><h3>给你的建议</h3><ul>{result.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul></div>}
      <aside className="notice plan-checklist" aria-label="出行前待确认的信息"><strong>出发前，再确认三件事</strong><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>
      <details className="plan-sources"><summary>查看这份攻略的资料依据</summary><p>根据本地目的地资料检索生成；历史参考可追溯，玩法与时长为编辑建议，非实时运营信息。</p>{result.sources.map(source => <div key={source.id}><p><Link href={`/explore/${source.id}`}><strong>{source.name} ↗</strong></Link>：{source.description}</p><ul>{source.references.map(reference => <li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.title} ↗</a></li>)}</ul></div>)}</details>
    </section>}
  </>;
}
