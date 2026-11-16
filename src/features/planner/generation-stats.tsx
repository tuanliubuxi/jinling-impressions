import type { PlanResult } from "@/lib/plan-contract";
export function GenerationStats({ generation }: { generation?: PlanResult["generation"] }) {
  if (!generation) return null;
  return <aside className="generation-stats" aria-label="本次模型用量"><strong>本次模型调用</strong><p>{generation.model} · 耗时 {(generation.elapsedMs / 1000).toFixed(1)} 秒</p>{generation.usage ? <p>输入 {generation.usage.promptTokens.toLocaleString()} tokens · 输出 {generation.usage.completionTokens.toLocaleString()} tokens · 合计 {generation.usage.totalTokens.toLocaleString()} tokens</p> : <p>平台未返回 token 用量，未作估算。</p>}<small>用量来自平台响应；实际费用以平台账单为准。查询、切换已保存版本不会再次调用模型；修改生成会调用一次。</small></aside>;
}
