"use client";

import { useState, type FormEvent } from "react";

export function PlannerForm() {
  const [summary, setSummary] = useState("");
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSummary(`需求已在本页整理：${form.get("duration")}，每人预算 ${form.get("budget")} 元，兴趣为“${String(form.get("interests")).trim()}”。真实 AI 规划尚未接入，数据没有发送到服务器。`);
  }
  return <div className="card form-card"><p className="notice">开发阶段：此表单仅预览需求收集流程，不会调用模型或生成行程。刷新后清空。</p><form onSubmit={handleSubmit}>
    <label htmlFor="duration">游玩时长</label><select name="duration" id="duration" defaultValue="一日游"><option>半日游</option><option>一日游</option><option>两日游</option></select>
    <label htmlFor="budget">每人预算（元）</label><input name="budget" id="budget" type="number" min="0" max="100000" step="1" defaultValue="300" required />
    <label htmlFor="interests">兴趣与其他要求</label><textarea name="interests" id="interests" rows={4} maxLength={500} placeholder="例如：历史文化、少走路、想看秦淮夜景" required />
    <button className="button" type="submit">整理我的需求</button>
  </form><p role="status" aria-live="polite" className="result">{summary}</p></div>;
}
