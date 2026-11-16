"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { durations, walkingOptions, parsePlanRequest, type PlanRequest, type PlanResult } from "@/lib/plan-contract";
import { createRequestId, isPlanResult, jobLifetimeMs, type SavedTask } from "@/lib/plan-job-contract";
import { draftFields, readPlannerSession, writePlannerSession, type PlannerDraft, type PlanVersion } from "@/lib/planner-session";
import { GenerationStats } from "./generation-stats";
import { QualityReport } from "./quality-report";

class TaskFailure extends Error {
  constructor(message: string, public terminal = false, public canResubmit = false) { super(message); }
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
  const [resultInput, setResultInput] = useState<PlanRequest | null>(null);
  const [resultDirty, setResultDirty] = useState(false);
  const [history, setHistory] = useState<PlanVersion[]>([]);
  const historyRef = useRef<PlanVersion[]>([]);
  const [failureStats, setFailureStats] = useState<PlanResult["generation"]>();
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const taskRef = useRef<SavedTask | null>(null);
  const retryTaskRef = useRef<SavedTask | null>(null);
  const resultRef = useRef<PlanResult | null>(null);
  const resultInputRef = useRef<PlanRequest | null>(null);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    let saved: ReturnType<typeof readPlannerSession>;
    try { saved = readPlannerSession(window.sessionStorage); } catch { /* 浏览器禁止存储时仍展示表单，提交前会阻止计费。 */ }
    const sameInterest = !initialInterests || saved?.draft.interests === initialInterests;
    const restore = sameInterest || !!saved?.task;
    if (saved && restore && formRef.current) {
      historyRef.current = saved.history || []; setHistory(historyRef.current);
      for (const name of draftFields) {
        const field = formRef.current.elements.namedItem(name);
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) field.value = saved.draft[name];
      }
      if (saved.result) {
        resultRef.current = saved.result; setResult(saved.result);
        resultInputRef.current = saved.resultInput || null; setResultInput(saved.resultInput || null);
        setResultDirty(!saved.resultInput || draftFields.some(field => saved.draft[field] !== String(saved.resultInput?.[field])));
      }
      retryTaskRef.current = saved.retryTask || null;
      taskRef.current = saved.task || null; setTask(saved.task || null);
    }
    setReady(true);
    const timer = setTimeout(() => { if (saved?.task && restore) void runTask(saved.task); }, 0);
    return () => { clearTimeout(timer); controller.current?.abort(); controller.current = null; };
    // 首次恢复读取 ref；不能随每次输入或结果更新重新提交任务。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (result) resultHeading.current?.focus({ preventScroll: true }); }, [result]);
  useEffect(() => {
    if (!loading) return;
    const start = Date.now(); setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading]);

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
      return writePlannerSession(window.sessionStorage, { version: 2, savedAt: Date.now(), draft: draft(), task: taskRef.current || undefined, retryTask: retryTaskRef.current || undefined, result: resultRef.current || undefined, resultInput: resultInputRef.current || undefined, history: historyRef.current });
    } catch { return false; }
  }

  async function readReply(response: Response, requestId: string): Promise<PlanResult | null> {
    let body;
    try { body = await response.json(); } catch { throw new TaskFailure("暂时无法读取服务器响应，本次任务编号已保留。"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new TaskFailure("服务器返回了无法识别的响应，本次任务编号已保留。");
    if (!response.ok) {
      if (body.generation && typeof body.generation.model === "string" && Number.isFinite(body.generation.elapsedMs)) setFailureStats({ model: body.generation.model, elapsedMs: body.generation.elapsedMs, ...([body.generation.usage?.promptTokens, body.generation.usage?.completionTokens, body.generation.usage?.totalTokens].every(Number.isInteger) ? { usage: body.generation.usage } : {}) });
      throw new TaskFailure(typeof body.message === "string" ? body.message : "服务器暂时不可用，请继续查看本次任务。", body.status === "failed" || [400, 403, 404, 409, 410, 422].includes(response.status), [403, 404].includes(response.status));
    }
    if (body.requestId !== requestId) throw new TaskFailure("响应与本次任务不一致，请继续查看，未创建新任务。");
    if (response.status === 202 && body.status === "pending") return null;
    if (body.status !== "completed" || !isPlanResult(body.result)) throw new TaskFailure("结果格式暂时无法显示，本次任务编号已保留，未重新生成。");
    return body.result;
  }

  async function runTask(saved: SavedTask, submit = false) {
    if (controller.current && !controller.current.signal.aborted) return;
    const active = new AbortController();
    controller.current = active;
    taskRef.current = saved; setTask(saved); setLoading(true); setError(""); setFailureStats(undefined);
    const timeout = setTimeout(() => active.abort(), 110000);
    try {
      // 恢复与“继续查看”只做 GET，不能把过去被拒绝、尚未创建的请求自动变成计费生成。
      const first = submit ? await fetch("/api/plan", { method: "POST", signal: active.signal, headers: { "Content-Type": "application/json", "Idempotency-Key": saved.requestId }, body: JSON.stringify(saved.input) }) : await fetch(`/api/plan?requestId=${encodeURIComponent(saved.requestId)}`, { signal: active.signal, cache: "no-store" });
      let completed = await readReply(first, saved.requestId);
      while (!completed) {
        await pause(1200, active.signal);
        completed = await readReply(await fetch(`/api/plan?requestId=${encodeURIComponent(saved.requestId)}`, { signal: active.signal, cache: "no-store" }), saved.requestId);
      }
      if (controller.current !== active || active.signal.aborted) return;
      resultRef.current = completed; setResult(completed);
      resultInputRef.current = saved.input; setResultInput(saved.input); setResultDirty(false); retryTaskRef.current = null;
      historyRef.current = [{ requestId: saved.requestId, input: saved.input, result: completed, completedAt: Date.now() }, ...historyRef.current.filter(version => version.requestId !== saved.requestId)].slice(0, 5);
      setHistory(historyRef.current);
      taskRef.current = null; setTask(null); persist();
    } catch (cause) {
      if (controller.current !== active) return;
      if (cause instanceof TaskFailure && cause.terminal) {
        retryTaskRef.current = cause.canResubmit ? saved : null;
        taskRef.current = null; setTask(null);
      }
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
    try { const values = draft(); beginTask(parsePlanRequest({ ...values, budget: Number(values.budget) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "请检查输入，尚未调用模型。"); }
  }

  function beginTask(input: PlanRequest) {
    if (controller.current || taskRef.current) return;
    try {
      const retry = retryTaskRef.current;
      const nextTask = retry && Date.now() - retry.startedAt < jobLifetimeMs && JSON.stringify(retry.input) === JSON.stringify(input) ? retry : { requestId: createRequestId(), input, startedAt: Date.now() };
      const previousResult = resultRef.current;
      const previousResultInput = resultInputRef.current;
      taskRef.current = nextTask; resultRef.current = null; resultInputRef.current = null;
      if (!persist()) {
        taskRef.current = null;
        resultRef.current = previousResult;
        resultInputRef.current = previousResultInput;
        throw new Error("浏览器无法保存任务，已阻止生成。请允许本站存储或更换浏览器后再试。");
      }
      setResult(null); setResultInput(null); setResultDirty(false); void runTask(nextTask, true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "请检查输入和浏览器兼容性，尚未调用模型。"); }
  }

  function showVersion(version: PlanVersion) {
    if (controller.current || taskRef.current) return;
    resultRef.current = version.result; resultInputRef.current = version.input;
    setResult(version.result); setResultInput(version.input); setResultDirty(false); setError(""); setFailureStats(undefined);
    for (const name of draftFields) {
      const field = formRef.current?.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) field.value = String(version.input[name]);
    }
    persist();
  }

  function revise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = resultInputRef.current; const id = resultRef.current?.requestId;
    if (!current || !id || controller.current || taskRef.current) return;
    const fields = new FormData(event.currentTarget);
    try {
      const input = parsePlanRequest({ ...current, interests: [current.interests, current.revision?.instruction].filter(Boolean).join("。"), duration: fields.get("revisionDuration"), budget: Number(fields.get("revisionBudget")), walking: fields.get("revisionWalking"), revision: { baseRequestId: id, instruction: fields.get("instruction") } });
      for (const name of draftFields) { const field = formRef.current?.elements.namedItem(name); if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) field.value = String(input[name]); }
      beginTask(input);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "修改要求无效，尚未调用模型。"); }
  }
  return <>
    <div className="card form-card"><p className="notice">从明孝陵、明城墙到秦淮街巷，围绕你的兴趣选择路线。还没想好？先<Link href="/explore">探索金陵的 31 处目的地 ↗</Link></p>
    {!ready && <p role="status">正在载入交互脚本，暂不能提交。如果一直未就绪，请检查浏览器是否允许本站运行 JavaScript。</p>}
    <noscript><p className="error-message">生成行程需要 JavaScript。请开启浏览器的本站脚本权限后重新打开，当前未调用模型。</p></noscript>
    <form ref={formRef} onSubmit={handleSubmit} onChange={() => { if (ready) { const values = draft(); setResultDirty(!!resultRef.current && (!resultInputRef.current || draftFields.some(field => values[field] !== String(resultInputRef.current?.[field])))); persist(); } }} method="post">
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
    <p role="status" aria-live="polite" className="result">{loading ? `正在结合你的偏好与现有地点资料生成建议，已等待 ${elapsed} 秒；请勿重复提交。` : ""}</p>
    {error && <p className="error-message" role="alert">{error} {task ? "请继续查看已有任务，无需重新生成。" : "输入已保留；点击生成才会主动创建新任务。"}</p>}
    <GenerationStats generation={failureStats} />
    {history.length > 0 && <nav className="version-history" aria-label="已保存的行程版本"><strong>最近的行程版本 · 切换不调用模型</strong>{history.map((version, index) => <button type="button" className="text-button" disabled={loading || !!task} key={version.requestId} onClick={() => showVersion(version)}>{index === 0 ? "最新版本" : `先前版本 ${history.length - index}`} · {version.result.title}</button>)}<small>当前标签页最多保留5个版本，24小时有效。</small></nav>}
    </div>
    {result && <section className="plan-result" aria-labelledby="plan-title">
      <span className="eyebrow">YOUR NANJING FIELD GUIDE</span><h2 id="plan-title" tabIndex={-1} ref={resultHeading}>{result.title}</h2><p className="plan-overview">{result.summary}</p>
      {resultInput ? <p className="notice result-input">这份攻略依据：{resultInput.date} · {resultInput.duration} · 兴趣“{resultInput.interests}”</p> : <p className="notice result-input">这是之前保存的结果，旧版本未记录它的生成条件。</p>}
      {resultDirty && <p className="notice" role="status">你已修改条件或正在查看旧结果。下面的攻略尚未按当前表单重新生成，不会自动调用模型。</p>}
      {resultInput?.revision && <p className="notice">这次调整：{resultInput.revision.instruction}</p>}
      <GenerationStats generation={result.generation} />
      <QualityReport quality={result.quality} />
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
      {result.requestId && resultInput && <form className="revision-form card" onSubmit={revise} key={result.requestId}><h3>在这份行程上继续调整</h3><p>保留未要求改变的安排，生成一个新版本；原版本可随时查看。修改会调用一次模型，不会自动重试。</p><fieldset disabled={loading || !!task}><label htmlFor="instruction">调整要求</label><textarea id="instruction" name="instruction" maxLength={300} required rows={3} placeholder="例如：去掉城墙，增加购物；其他安排尽量保留" /><label htmlFor="revisionDuration">新的游玩时长</label><select id="revisionDuration" name="revisionDuration" defaultValue={resultInput.duration}>{durations.map(value => <option key={value}>{value}</option>)}</select><label htmlFor="revisionBudget">新的每人预算（元）</label><input id="revisionBudget" name="revisionBudget" type="number" min="0" max="100000" step="1" required defaultValue={resultInput.budget} /><label htmlFor="revisionWalking">新的步行偏好</label><select id="revisionWalking" name="revisionWalking" defaultValue={resultInput.walking}>{walkingOptions.map(value => <option key={value}>{value}</option>)}</select><button className="button" type="submit">按要求修改（调用一次模型）</button></fieldset></form>}
    </section>}
  </>;
}
