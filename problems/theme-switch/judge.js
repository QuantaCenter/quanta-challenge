// 判题脚本。首行必须写成 defineTestHandler(...)，前面加导出关键字：
// 判题机内部会把行首那条导出语句替换成 const run = ... 后执行。
export default defineTestHandler(async ({ page, $ }) => {
   // 调度器只等判题机 30s；把默认超时收到 3s，
   // 让"选择器写错"这件事快速变成一条可读的失败原因，而不是整体超时。
   page.setDefaultTimeout(3000);
   page.setDefaultNavigationTimeout(6000);

   const text = async (selector) => {
      const element = await page.$(selector);
      if (!element) throw new Error('找不到元素 ' + selector);
      return (await element.textContent()).trim();
   };

   const theme = async () =>
      await page.$eval('html', (element) => element.dataset.theme || '');

   const bodyBackground = async () =>
      await page.$eval(
         'body',
         (element) => getComputedStyle(element).backgroundColor,
      );

   const cardBackground = async () =>
      await page.$eval(
         '.card',
         (element) => getComputedStyle(element).backgroundColor,
      );

   const stored = async () =>
      await page.$eval('body', () => localStorage.getItem('theme') || '');

   $.defineCheckPoint('默认是浅色主题', 10, async () => {
      const actual = await theme();
      $.expect(
         actual === 'light',
         '页面初始 data-theme 期望 "light"，实际为 "' + actual + '"',
      );

      const background = await bodyBackground();
      $.expect(
         background === 'rgb(246, 247, 249)',
         '浅色主题下 body 背景期望 "rgb(246, 247, 249)"，实际为 "' +
            background +
            '"',
      );

      const label = await text('#theme-label');
      $.expect(
         label === '切到深色',
         '浅色主题下 #theme-label 期望 "切到深色"，实际为 "' + label + '"',
      );
      return 10;
   });

   $.defineCheckPoint('点击开关切到深色主题', 10, async () => {
      await page.click('#theme-toggle', { timeout: 3000 });
      await page.waitForTimeout(150);

      const actual = await theme();
      $.expect(
         actual === 'dark',
         '点击 #theme-toggle 后 data-theme 期望 "dark"，实际为 "' + actual + '"',
      );

      const background = await bodyBackground();
      $.expect(
         background === 'rgb(16, 21, 28)',
         '深色主题下 body 背景期望 "rgb(16, 21, 28)"，实际为 "' +
            background +
            '"',
      );

      // 变量变了，用变量的卡片背景也必须跟着变
      const card = await cardBackground();
      $.expect(
         card === 'rgb(22, 29, 38)',
         '深色主题下 .card 背景期望 "rgb(22, 29, 38)"，实际为 "' + card + '"',
      );

      const label = await text('#theme-label');
      $.expect(
         label === '切到浅色',
         '深色主题下 #theme-label 期望 "切到浅色"，实际为 "' + label + '"',
      );

      const saved = await stored();
      $.expect(
         saved === 'dark',
         'localStorage.theme 期望 "dark"，实际为 "' + saved + '"',
      );
      return 10;
   });

   $.defineCheckPoint('刷新后主题选择仍然生效', 10, async () => {
      await page.reload({ waitUntil: 'load', timeout: 6000 });
      await page.waitForTimeout(150);

      const actual = await theme();
      $.expect(
         actual === 'dark',
         '刷新后 data-theme 期望 "dark"，实际为 "' + actual + '"',
      );

      const background = await bodyBackground();
      $.expect(
         background === 'rgb(16, 21, 28)',
         '刷新后 body 背景期望 "rgb(16, 21, 28)"，实际为 "' + background + '"',
      );

      const label = await text('#theme-label');
      $.expect(
         label === '切到浅色',
         '刷新后 #theme-label 期望 "切到浅色"，实际为 "' + label + '"',
      );
      return 10;
   });

   $.defineCheckPoint('能再切回浅色并更新记录', 10, async () => {
      await page.click('#theme-toggle', { timeout: 3000 });
      await page.waitForTimeout(150);

      const actual = await theme();
      $.expect(
         actual === 'light',
         '第二次点击后 data-theme 期望 "light"，实际为 "' + actual + '"',
      );

      const label = await text('#theme-label');
      $.expect(
         label === '切到深色',
         '切回浅色后 #theme-label 期望 "切到深色"，实际为 "' + label + '"',
      );

      const saved = await stored();
      $.expect(
         saved === 'light',
         '切回浅色后 localStorage.theme 期望 "light"，实际为 "' + saved + '"',
      );
      return 10;
   });
});
