import { test } from '@playwright/test';
import { roamAndScreenshot } from '../helpers/roam';
import { E2E_ACHIEVEMENT_ID } from '../helpers/env';

/**
 * 登录后主界面漫游：依次访问普通用户页、管理端与发布端所有页面。
 * 使用 setup 产出的 storageState（SUPER_ADMIN 会话），每页全页截图到
 * screenshots/roam/，无自动断言，由人工确认截图显示效果。
 */

/** 普通用户页面 */
const USER_PAGES = [
   '/app/dashboard',
   '/app/problems',
   '/app/rankings',
   '/app/achievements',
   '/app/space',
   '/app/notifications',
   '/app/settings',
   '/app/settings/security',
   '/app/settings/advanced',
];

/** 管理端页面 */
const MANAGE_PAGES = [
   '/app/manage',
   '/app/manage/member',
   '/app/manage/submission',
   '/app/manage/appeal',
   '/app/manage/tag',
   '/app/manage/achievement',
   `/app/manage/achievement/detail/${E2E_ACHIEVEMENT_ID}`,
   '/app/manage/image',
   '/app/manage/cloud-function',
   '/app/manage/scheduled-task',
];

/** 发布端页面 */
const PUBLISH_PAGES = [
   '/app/publish',
   '/app/publish/problem',
   '/app/publish/achievement',
   '/app/publish/image',
   '/app/publish/notification',
   '/app/publish/create-tag',
   '/app/publish/cloud-function',
   '/app/publish/scheduled-task',
];

const ALL_PAGES = [...USER_PAGES, ...MANAGE_PAGES, ...PUBLISH_PAGES];

test.describe('主界面漫游', () => {
   for (const route of ALL_PAGES) {
      test(`漫游 ${route}`, async ({ page }) => {
         await roamAndScreenshot(page, route, 'roam');
      });
   }
});
