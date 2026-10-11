// 判题脚本必须写成 `export default defineTestHandler(...)`：判题机会把 "export default " 替换成 "const run = " 再执行。
export default defineTestHandler(async ({ page, $ }) => {
   const text = async (selector) => {
      const element = await page.$(selector);
      if (!element) throw new Error('找不到元素 ' + selector);
      return (await element.textContent()).trim();
   };

   // 目标按钮可能 disabled：Playwright click 会重试到 30 秒超时，需要"即使禁用也点一下"时改用合成事件。
   const clickEvenIfDisabled = async (selector) => {
      await page.$eval(selector, (element) => {
         element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await page.waitForTimeout(150);
   };

   $.defineCheckPoint('初始计数为 0', 5, async () => {
      const actual = await text('#count');
      $.expect(actual === '0', '期望 #count 为 "0"，实际为 "' + actual + '"');
      return 5; // 必须 return 本检查点得分：不返回即使断言全过也记 0 分
   });

   $.defineCheckPoint('点击 3 次后计数为 3', 10, async () => {
      for (let i = 0; i < 3; i += 1) {
         // 这个按钮本就应该可用：用真实 click 并加短超时，失败时快速暴露
         await page.click('#inc', { timeout: 3000 });
      }
      const actual = await text('#count');
      $.expect(actual === '3', '期望 #count 为 "3"，实际为 "' + actual + '"');
      return 10;
   });

   $.defineCheckPoint('计数达到 3 后提示已达标', 5, async () => {
      const actual = await text('#tip');
      $.expect(actual === '已达标', '期望 #tip 为 "已达标"，实际为 "' + actual + '"');
      return 5;
   });

   // 需要验证"禁用状态下点击不生效"时用：await clickEvenIfDisabled('#reset');
   void clickEvenIfDisabled;
});
