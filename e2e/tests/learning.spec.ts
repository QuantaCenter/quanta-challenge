import { expect, test } from '@playwright/test';
import {
   E2E_LEARNING_ARTICLE_ID,
   E2E_LEARNING_TOPIC_ID,
} from '../helpers/env';

test.describe('学习模块', () => {
   test('阅读文章、操作 Playground 并更新 Dashboard 进度', async ({ page }) => {
      test.skip(
         !E2E_LEARNING_TOPIC_ID || !E2E_LEARNING_ARTICLE_ID,
         '缺少学习模块 seed id',
      );

      await page.goto(`/app/learning/${E2E_LEARNING_TOPIC_ID}`);
      await expect(page.getByRole('heading', { name: 'E2E - 前端基础专题' })).toBeVisible();
      await expect(page.getByText('50%').first()).toBeVisible();

      await page.getByRole('link', { name: /E2E - HTML 入门文章/ }).click();
      await expect(page).toHaveURL(
         new RegExp(`/app/articles/${E2E_LEARNING_ARTICLE_ID}$`),
      );
      await page.getByLabel('HTML 代码').fill('<h1>实时修改成功</h1>');
      await expect(page.locator('iframe[title="Playground 实时预览"]')).toBeVisible();

      const markRead = page.getByRole('button', { name: '标记为已读' });
      await markRead.scrollIntoViewIfNeeded();
      await expect(markRead).toBeEnabled();
      await markRead.click();
      await expect(page.getByText('文章已读')).toBeVisible();
      await expect(page.getByText('100%').first()).toBeVisible();

      await page.goto('/app/dashboard');
      const recentLearning = page.getByText('E2E - 前端基础专题');
      await expect(recentLearning).toBeVisible();
      await expect(recentLearning.locator('..').locator('..').getByText('100%')).toBeVisible();
   });

   test('管理员可进入学习内容管理与创建入口', async ({ page }) => {
      await page.goto('/app/manage/learning');
      await expect(page.getByRole('heading', { name: '学习内容管理' })).toBeVisible();
      await expect(page.getByText('E2E - HTML 入门文章')).toBeVisible();

      await page.goto('/app/publish/article/new');
      await expect(page.getByRole('heading', { name: '创建学习文章' })).toBeVisible();
      await page.goto('/app/publish/topic/new');
      await expect(page.getByRole('heading', { name: '创建学习专题' })).toBeVisible();
   });
});
