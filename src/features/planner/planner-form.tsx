"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { durations, walkingOptions, parsePlanRequest, type PlanResult } from "@/lib/plan-contract";
import { createRequestId, isPlanResult, type SavedTask } from "@/lib/plan-job-contract";
import { draftFields, readPlannerSession, writePlannerSession, type PlannerDraft } from "@/lib/planner-session";

class TaskFailure extends Error {
  constructor(message: string, public terminal = false) { super(message); }
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  });
}

export function PlannerForm({ initialInterests = "" }: { initialInterests?: string }) {
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [task, setTask] = useState<SavedTask | null>(null);
  const controller = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const taskRef = useRef<SavedTask | null>(null);
  const resultRef = useRef<PlanResult | null>(null);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    let saved: ReturnType<typeof readPlannerSession>;
    try { saved = readPlannerSession(window.sessionStorage); } catch { /* 浏览器禁止存储时仍展示表单，提交前会阻止计费。 */ }
    const sameInterest = !initialInterests || saved?.draft.interests === initialInterests;
    const restore = sameInterest || !!saved?.task;
    if (saved && restore && formRef.current) {
      for (const name of draftFields) {
        const field = formRef.current.elements.namedItem(name);
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) field.value = saved.draft[name];
      }
      if (saved.result) { resultRef.current = saved.result; setResult(saved.result); }
      taskRef.current = saved.task || null; setTask(saved.task || null);
    }
    setReady(true);
    const timer = setTimeout(() => { if (saved?.task && restore) void runTask(saved.task); }, 0);
    return () => { clearTimeout(timer); controller.current?.abort(); controller.current = null; };
    // 首次恢复读取 ref；不能随每次输入或结果更新重新提交任务。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (result) resultHeading.current?.focus({ preventScroll: true }); }, [result]);

  function draft(): PlannerDraft {
    const values = {} as PlannerDraft;
    for (const name of draftFields) {
      const field = formRef.current?.elements.namedItem(name);
      values[name] = field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement ? field.value : "";
    }
    return values;
  }

  function persist(): boolean {
    try {
      return writePlannerSession(window.sessionStorage, { version: 2, savedAt: Date.now(), draft: draft(), task: taskRef.current || undefined, result: resultRef.current || undefined });
    } catch { return false; }
  }

  async function readReply(response: Response, requestId: string): Promise<PlanResult | null> {
    let body;
    try { body = await response.json(); } catch { throw new TaskFailure("暂时无法读取服务器响应，本次任务编号已保留。"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new TaskFailure("服务器返回了无法识别的响应，本次任务编号已保留。");
    if (!response.ok) throw new TaskFailure(typeof body.message === "string" ? body.message : "服务器暂时不可用，请继续查看本次任务。", body.status === "failed" || [400, 409, 410].includes(response.status));
    if (body.requestId !== requestId) throw new TaskFailure("响应与本次任务不一致，请继续查看，未创建新任务。");
    if (response.status === 202 && body.status === "pending") return null;
    if (body.status !== "completed" || !isPlanResult(body.result)) throw new TaskFailure("结果格式暂时无法显示，本次任务编号已保留，未重新生成。");
    return body.result;
  }

  async function runTask(saved: SavedTask) {
    if (controller.current && !controller.current.signal.aborted) return;
    const active = new AbortController();
    controller.current = active;
    taskRef.current = saved; setTask(saved); setLoading(true); setError("");
    const timeout = setTimeout(() => active.abort(), 110000);
    try {
      // 重连始终沿用同一个幂等编号；服务端只创建一次计费生成。
      let completed = await readReply(await fetch("/api/plan", { method: "POST", signal: active.signal, headers: { "Content-Type": "application/json", "Idempotency-Key": saved.requestId }, body: JSON.stringify(saved.input) }), saved.requestId);
      while (!completed) {
        await pause(1200, active.signal);
        completed = await readReply(await fetch(`/api/plan?requestId=${encodeURIComponent(saved.requestId)}`, { signal: active.signal, cache: "no-store" }), saved.requestId);
      }
      if (controller.current !== active || active.signal.aborted) return;
      resultRef.current = completed; setResult(completed);
      taskRef.current = null; setTask(null); persist();
    } catch (cause) {
      if (controller.current !== active) return;
      if (cause instanceof TaskFailure && cause.terminal) { taskRef.current = null; setTask(null); }
      persist();
      setError(active.signal.aborted ? "已暂停等待，后台生成不会因此重新开始。可继续查看同一次结果。" : cause instanceof Error ? cause.message : "连接暂时中断，可以继续查看同一次任务。");
    } finally {
      clearTimeout(timeout);
      if (controller.current === active) { controller.current = null; setLoading(false); }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || controller.current) return;
    if (taskRef.current) { void runTask(taskRef.current); return; }
    try {
      const values = draft();
      const input = parsePlanRequest({ ...values, budget: Number(values.budget) });
      const nextTask = { requestId: createRequestId(), input, startedAt: Date.now() };
      const previousResult = resultRef.current;
      taskRef.current = nextTask; resultRef.current = null;
      if (!persist()) {
        taskRef.current = null;
        resultRef.current = previousResult;
        throw new Error("浏览器无法保存任务，已阻止生成。请允许本站存储或更换浏览器后再试。");
      }
      setResult(null); void runTask(nextTask);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "请检查输入和浏览器兼容性，尚未调用模型。"); }
  }
  return <>
    <div className="card form-card"><p className="notice">从明孝陵、明城墙到秦淮街巷，围绕你的兴趣选择路线。还没想好？先<Link href="/explore">探索金陵的 10 处目的地 ↗</Link></p>
    {!ready && <p role="status">正在载入交互脚本，暂不能提交。如果一直未就绪，请检查浏览器是否允许本站运行 JavaScript。</p>}
    <noscript><p className="error-message">生成行程需要 JavaScript。请开启浏览器的本站脚本权限后重新打开，当前未调用模型。</p></noscript>
    <form ref={formRef} onSubmit={handleSubmit} onChange={() => { if (ready) persist(); }} method="post">
      <fieldset disabled={!ready || loading || !!task} className="planner-fields">
        <label htmlFor="duration">游玩时长</label><select name="duration" id="duration" defaultValue="一日游">{durations.map(value => <option key={value}>{value}</option>)}</select>
        <label htmlFor="date">出游日期</label><input name="date" id="date" type="date" required />
        <label htmlFor="startPoint">出发位置</label><input name="startPoint" id="startPoint" maxLength={100} placeholder="例如：南京南站附近" required />
        <label htmlFor="budget">每人预算（元）</label><input name="budget" id="budget" type="number" min="0" max="100000" step="1" defaultValue="300" required />
        <label htmlFor="walking">步行偏好</label><select name="walking" id="walking" defaultValue="适中">{walkingOptions.map(value => <option key={value}>{value}</option>)}</select>
        <label htmlFor="interests">兴趣与其他要求</label><textarea name="interests" id="interests" rows={4} maxLength={500} defaultValue={initialInterests} placeholder="例如：想了解明朝历史，重点看明孝陵与城墙，不赶场，留时间吃南京小吃" required />
        <p className="field-help">提交后需求将发送给 DeepSeek，请勿填写敏感信息。本次进度与结果会保存，刷新后可恢复；再次生成才会创建新任务。</p>
        <button className="button" type="submit">{!ready ? "页面加载中…" : loading ? "正在生成…" : result ? "重新生成（再次调用模型）" : "生成我的行程"}</button>
      </fieldset>
      {loading && <button className="text-button" type="button" onClick={() => controller.current?.abort()}>暂停等待（后台继续，结果可恢复）</button>}
      {task && !loading && <button className="button" type="button" onClick={() => void runTask(task)}>继续查看这次结果</button>}
    </form>
    <p role="status" aria-live="polite" className="result">{loading ? "正在结合你的偏好与现有地点资料生成建议，请稍候…" : ""}</p>
    {error && <p className="error-message" role="alert">{error} {task ? "请继续查看已有任务，无需重新生成。" : "输入已保留；点击生成才会主动创建新任务。"}</p>}
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
