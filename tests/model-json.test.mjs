import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/lib/model-json.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseModelJSON } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("允许完整字段缺少外层闭合符，但不补全断句和缺失字段", () => {
  assert.deepEqual(parseModelJSON('{"days":[{"day":1,"stops":[],"budgetAdvice":["a","b"],"tips":[]}'), {
    days: [{ day: 1, stops: [], budgetAdvice: ["a", "b"], tips: [] }], budgetAdvice: ["a", "b"], tips: [],
  });
  assert.throws(() => parseModelJSON('{"summary":"没有说完'));
  assert.throws(() => parseModelJSON('{broken'));
  assert.throws(() => parseModelJSON('{"days":[}'));
  assert.deepEqual(parseModelJSON('{"title":"[]不是闭合符"}'), { title: "[]不是闭合符" });
  assert.equal(parseModelJSON('{"title":"完整标题"').days, undefined);
});
