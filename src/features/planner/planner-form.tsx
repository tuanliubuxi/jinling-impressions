"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { durations, walkingOptions, type PlanResult } from "@/lib/plan-contract";

export function PlannerForm() {
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
    <div className="card form-card"><p className="notice">当前覆盖中山陵、玄武湖、老门东。生成的是初步游览建议，交通、开放安排和费用仍需核实。</p><form onSubmit={handleSubmit}>
      <fieldset disabled={loading} className="planner-fields">
        <label htmlFor="duration">游玩时长</label><select name="duration" id="duration" defaultValue="一日游">{durations.map(value => <option key={value}>{value}</option>)}</select>
        <label htmlFor="date">出游日期</label><input name="date" id="date" type="date" required />
        <label htmlFor="startPoint">出发位置</label><input name="startPoint" id="startPoint" maxLength={100} placeholder="例如：南京南站附近" required />
        <label htmlFor="budget">每人预算（元）</label><input name="budget" id="budget" type="number" min="0" max="100000" step="1" defaultValue="300" required />
        <label htmlFor="walking">步行偏好</label><select name="walking" id="walking" defaultValue="适中">{walkingOptions.map(value => <option key={value}>{value}</option>)}</select>
        <label htmlFor="interests">兴趣与其他要求</label><textarea name="interests" id="interests" rows={4} maxLength={500} placeholder="例如：喜欢历史文化，希望留时间休息" required />
        <p className="field-help">提交后，以上需求将发送给 DeepSeek 生成建议。请勿填写身份证号、联系电话等敏感信息。行程暂不保存，刷新后清空。</p>
        <button className="button" type="submit">{loading ? "正在生成…" : "生成我的行程"}</button>
      </fieldset>
      {loading && <button className="text-button" type="button" onClick={() => controller.current?.abort()}>取消等待</button>}
    </form>
    <p role="status" aria-live="polite" className="result">{loading ? "正在结合你的偏好与现有地点资料生成建议，请稍候…" : ""}</p>
    {error && <p className="error-message" role="alert">{error} 你填写的需求已保留，可点击生成按钮重试。</p>}
    </div>
    {result && <section className="plan-result" aria-labelledby="plan-title">
      <span className="eyebrow">你的南京游览建议</span><h2 id="plan-title" tabIndex={-1} ref={resultHeading}>{result.title}</h2><p>{result.summary}</p>
      <aside className="notice" aria-label="出行前待确认的信息"><strong>出发前，还需要确认</strong><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>
      {result.days.map(day => <section className="plan-day" key={day.day}><h3>第 {day.day} 天</h3><ol className="plan-stops">{day.stops.map(stop => <li className="card itinerary-stop" key={stop.placeId}><span className="eyebrow">{stop.period}</span><h4>{result.sources.find(source => source.id === stop.placeId)?.name}</h4><p>{stop.reason}</p><small>游览时长、交通及费用待确认</small></li>)}</ol></section>)}
      {result.tips.length > 0 && <div className="plan-tips"><h3>给你的建议</h3><ul>{result.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul></div>}
      <details className="plan-sources"><summary>查看本次使用的地点资料</summary><p>以下是本地内容初稿，尚未完成来源核实；当前未接入联网检索。</p>{result.sources.map(source => <p key={source.id}><strong>{source.name}：</strong>{source.description}</p>)}</details>
    </section>}
  </>;
}
