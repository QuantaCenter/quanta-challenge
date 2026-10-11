import { describe, expect, test } from 'vitest';
import {
   isJudgeScriptTemplate,
   judgeScriptTemplateOf,
} from './judge-script-template';

describe('判题脚本模板', () => {
   test('模板跟着题型走，两边的运行时不能混用', () => {
      const frontend = judgeScriptTemplateOf('frontend');
      const backend = judgeScriptTemplateOf('backend_service');

      expect(frontend).toContain('page');
      expect(frontend).not.toContain('http.');

      expect(backend).toContain('http.get');
      expect(backend).not.toContain('page.');

      // 缺省（题型未选）= 前端
      expect(judgeScriptTemplateOf(undefined)).toBe(frontend);
   });

   test('能识别出「还是模板」，避免覆盖出题人自己写的脚本', () => {
      expect(isJudgeScriptTemplate('')).toBe(false);
      expect(isJudgeScriptTemplate(undefined)).toBe(false);
      expect(isJudgeScriptTemplate(judgeScriptTemplateOf('frontend'))).toBe(
         true
      );
      expect(
         isJudgeScriptTemplate(judgeScriptTemplateOf('backend_service'))
      ).toBe(true);

      const authored = `export default defineTestHandler(async ({ $, page }) => {
   $.defineCheckPoint('自己写的', 5, async () => 5);
});`;
      expect(isJudgeScriptTemplate(authored)).toBe(false);
   });
});
