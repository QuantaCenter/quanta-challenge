import { test } from '@playwright/test';
import { roamAndScreenshot } from '../helpers/roam';
import { E2E_PROBLEM_PID } from '../helpers/env';

/**
 * 公开页面漫游（做题链路）：无需登录即可访问的题目页与提交记录页。
 * 每步截图到 screenshots/public/，无自动断言。
 */
test.describe('公开页面漫游', () => {
   test('做题页', async ({ page }) => {
      await roamAndScreenshot(page, `/challenge/editor/${E2E_PROBLEM_PID}`, 'public');
   });

   test('提交记录页', async ({ page }) => {
      await roamAndScreenshot(page, `/challenge/record/${E2E_PROBLEM_PID}`, 'public');
   });
});
