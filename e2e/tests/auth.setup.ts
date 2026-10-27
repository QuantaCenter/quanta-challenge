import { test as setup } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from '../helpers/env';
import { SCREENSHOT_DIR, AUTH_FILE } from '../helpers/paths';

const LOGIN_DIR = path.join(SCREENSHOT_DIR, 'login');

setup('登录并保存会话', async ({ page }) => {
   fs.mkdirSync(LOGIN_DIR, { recursive: true });
   const shot = (name: string) =>
      page.screenshot({ path: path.join(LOGIN_DIR, `${name}.png`), fullPage: true });

   // 1. 未登录首页
   await page.goto('/', { waitUntil: 'domcontentloaded' });
   await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
   await shot('01-首页-未登录');

   // 2. 打开登录页
   await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
   await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
   await shot('02-登录页');

   // 3. 填写表单
   await page.locator('input[placeholder="请输入邮箱"]').fill(E2E_ADMIN_EMAIL);
   await page.locator('input[type="password"]').fill(E2E_ADMIN_PASSWORD);
   await shot('03-登录表单-已填写');

   // 4. 提交并等待跳转主界面
   await page.getByRole('button', { name: '登录', exact: true }).click();
   const loggedIn = await page
      .waitForURL('**/app/dashboard', { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
   await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
   await shot(loggedIn ? '04-登录成功-主界面' : '04-登录失败-截图留证');

   if (!loggedIn) {
      console.warn(
         '⚠️ 登录未跳转到 /app/dashboard，后续漫游截图可能全是登录页，请人工查看 screenshots/login/04-*.png 确认原因。',
      );
   }

   // 5. 保存会话（即使失败也保存，后续页面截图能暴露未登录状态）
   await page.context().storageState({ path: AUTH_FILE });
});
