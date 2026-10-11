/**
 * 判题脚本模板。
 *
 * 两个题型注入的运行时完全不同（前端 Playwright 的 page / 后端受约束的 http），
 * 所以模板必须跟着题型走，且两边不能混用。
 */
export type JudgeScriptProblemType = 'frontend' | 'backend_service';

const FRONTEND_TEMPLATE = `export default defineTestHandler(async ({ $, page }) => {
   $.defineCheckPoint('示例检查点', 10, async () => {
      // 用 page 操作页面元素，配合 $.expect 断言
      await $.expect(page.url().includes('/'), '当前应停留在题目站点内');
      return 10;
   });
});`;

const BACKEND_TEMPLATE = `export default defineTestHandler(async ({ $, http }) => {
   $.defineCheckPoint('GET /health 返回 ok', 10, async () => {
      // http 只能请求被测服务（同源），path 相对服务根路径
      const res = await http.get('/health');
      $.expect(res.status === 200, \`期望 200，实际 \${res.status}\`);
      $.expect(res.json?.ok === true, 'body.ok 应为 true');
      return 10;
   });
});`;

export const judgeScriptTemplateOf = (
   problemType?: JudgeScriptProblemType
): string =>
   problemType === 'backend_service' ? BACKEND_TEMPLATE : FRONTEND_TEMPLATE;

/** 是否还是模板（用来避免覆盖出题人自己写的脚本）。 */
export const isJudgeScriptTemplate = (script?: string): boolean =>
   !!script && (script === FRONTEND_TEMPLATE || script === BACKEND_TEMPLATE);
