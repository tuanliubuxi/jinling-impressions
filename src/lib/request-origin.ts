// Next.js 的 request.url 可使用服务内部主机名；浏览器实际访问的 authority 来自 Host。
// 不读取任意 X-Forwarded-Host；通配符只匹配明确配置域名的完整子域标签。
function matchesOrigin(pattern: string, from: URL): boolean {
  if (pattern === from.origin) return true;
  const wildcard = pattern.match(/^(https?):\/\/(\*\*|\*)\.([a-z0-9.-]+)(:\d+)?$/i);
  if (!wildcard) return false;
  try {
    const expected = new URL(`${wildcard[1]}://${wildcard[3]}${wildcard[4] || ""}`);
    const suffix = `.${expected.hostname}`;
    if (from.protocol !== expected.protocol || from.port !== expected.port || !from.hostname.endsWith(suffix)) return false;
    const subdomain = from.hostname.slice(0, -suffix.length);
    return !!subdomain && (wildcard[2] === "**" || !subdomain.includes("."));
  } catch { return false; }
}

export function isSameSiteRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const from = new URL(origin);
    if (!["http:", "https:"].includes(from.protocol) || from.hostname.includes("*") || from.username || from.password || from.pathname !== "/" || from.search || from.hash) return false;
    // HTTPS 穿透代理可能改写内部Host；按配置的协议、端口与域名边界匹配公开来源。
    const configured = (process.env.PUBLIC_APP_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
    if (configured.some(pattern => matchesOrigin(pattern, from))) return true;
    const target = new URL(request.url);
    const authority = request.headers.get("host") || target.host;
    if (!authority || /[\s,@/\\?#]/.test(authority)) return false;
    const publicURL = new URL(`${target.protocol}//${authority}`);
    return from.origin === publicURL.origin;
  } catch { return false; }
}
