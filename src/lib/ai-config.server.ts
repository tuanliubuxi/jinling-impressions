// 仅由服务端路由导入，不得在客户端组件中引用。
export function getAIConfig() {
  const apiKey = process.env.AI_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();
  const baseURL = new URL(process.env.AI_BASE_URL?.trim() || "https://api.deepseek.com");
  if (!apiKey || !model || model.length > 100 || baseURL.origin !== "https://api.deepseek.com" || baseURL.username || baseURL.password || baseURL.search || baseURL.hash || !["/", "/v1", "/v1/"].includes(baseURL.pathname)) {
    throw new Error("AI_NOT_CONFIGURED");
  }
  return { apiKey, model, endpoint: `${baseURL.href.replace(/\/$/, "")}/chat/completions` };
}

export function isAIConfigured() {
  try { getAIConfig(); return true; } catch { return false; }
}
