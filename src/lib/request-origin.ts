// Next.js 的 request.url 可使用服务内部主机名；浏览器实际访问的 authority 来自 Host。
// 不读取任意 X-Forwarded-Host，也不使用 * 放行跨站来源。
export function isSameSiteRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const from = new URL(origin);
    if (!["http:", "https:"].includes(from.protocol) || from.username || from.password || from.pathname !== "/" || from.search || from.hash) return false;
    // HTTPS 穿透代理可能把内部 Host 改为 localhost。只允许显式配置的完整公开来源。
    const configured = (process.env.PUBLIC_APP_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
    if (configured.includes(from.origin)) return true;
    const target = new URL(request.url);
    const authority = request.headers.get("host") || target.host;
    if (!authority || /[\s,@/\\?#]/.test(authority)) return false;
    const publicURL = new URL(`${target.protocol}//${authority}`);
    return from.origin === publicURL.origin;
  } catch { return false; }
}
