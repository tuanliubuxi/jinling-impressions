// 仅修复“完整内容缺少外层闭合符”这一窄范围格式错误；不补文字、字段或活动。
// 调用方必须先确认 finish_reason=stop，再做完整业务结构校验。
export function parseModelJSON(content: string): unknown {
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch {
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    let repaired = "";
    let daysArray = false;
    for (let index = 0; index < content.length; index++) {
      const char = content[index];
      // 完整 days 内容后误漏 ]，导致根字段落在数组里；仅补这个确定的闭合符。
      // 检查引号状态与根层级，绝不替换文本内容中的同名片段。
      if (!quoted && char === "," && daysArray && stack.length === 2 && stack[1] === "[" && /^,\s*"(?:budgetAdvice|tips)"\s*:/.test(content.slice(index))) {
        repaired += "]"; stack.pop();
      }
      repaired += char;
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") {
        if (char === "[" && stack.length === 1 && /"days"\s*:\s*$/.test(content.slice(0, index))) daysArray = true;
        stack.push(char);
      }
      else if (char === "}" || char === "]") {
        const opening = stack.pop();
        if (opening !== (char === "}" ? "{" : "[")) throw new Error("Mismatched JSON");
      }
    }
    if (quoted || stack.length > 3) throw new Error("Invalid JSON");
    parsed = JSON.parse(repaired + stack.reverse().map(char => char === "{" ? "}" : "]").join(""));
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
