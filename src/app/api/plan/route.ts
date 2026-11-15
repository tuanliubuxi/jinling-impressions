// 预留真实规划入口；未实现时明确返回 501，避免把固定内容当作 AI 输出。
export function POST() {
  return Response.json({ code: "NOT_IMPLEMENTED", message: "AI 行程规划尚未接入。" }, { status: 501 });
}
