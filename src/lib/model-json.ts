// 仅修复“完整内容缺少外层闭合符”这一窄范围格式错误；不补文字、字段或活动。
// 调用方必须先确认 finish_reason=stop，再做完整业务结构校验。
export function parseModelJSON(content: string): unknown {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch {
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    for (const char of content) {
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") stack.push(char);
      else if (char === "}" || char === "]") {
        const opening = stack.pop();
        if (opening !== (char === "}" ? "{" : "[")) throw new Error("Mismatched JSON");
      }
    }
    if (quoted || !stack.length || stack.length > 3) throw new Error("Invalid JSON");
    parsed = JSON.parse(content + stack.reverse().map(char => char === "{" ? "}" : "]").join(""));
  }
  // 部分响应将全局建议挂在最后一天中；仅搬移已存在的完整数组，不生成默认值。
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const root = parsed as Record<string, unknown>;
    const days = root.days;
    const last = Array.isArray(days) ? days.at(-1) : null;
    if (last && typeof last === "object") {
      for (const field of ["budgetAdvice", "tips"]) {
        if (!(field in root) && Array.isArray(last[field])) root[field] = last[field];
      }
    }
  }
  return parsed;
}
