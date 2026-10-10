// 判题脚本。首行必须写成 defineTestHandler(...)，前面加导出关键字：
// 判题机内部会把行首那条导出语句替换成 const run = ... 后执行。
export default defineTestHandler(async ({ page, $ }) => {
   // 判题机给页面的默认超时是 10s，而调度器只等判题机 30s：
   // 一旦某个选择器写错还等满 10s，就会以 "Judge Machine response timeout" 结束，
   // 学生只看到一片空白。这里统一收紧到 3s，让选错元素尽快变成一条可读的失败原因。
   page.setDefaultTimeout(3000);
   page.setDefaultNavigationTimeout(6000);

   const text = async (selector) => {
      const element = await page.$(selector);
      if (!element) throw new Error('找不到元素 ' + selector);
      return (await element.textContent()).trim();
   };

   // ⚠️ Playwright 的 CSS 引擎里 [name="x"] 中的引号是**字面量**：
   // 写成 input[name="keyboard"] 会永远匹配不到。这里一律不加引号。
   const inputSelector = (name) => 'input[name=' + name + ']';

   const setQty = async (name, value) => {
      await page.fill(inputSelector(name), String(value));
      await page.waitForTimeout(120);
   };

   const money = (value) => value.toFixed(2);

   // 初始数据：24.50 × 2 + 89.00 × 1 + 15.90 × 3 = 1484.70
   const INITIAL = {
      keyboard: { price: 24.5, qty: 2 },
      mouse: { price: 89, qty: 1 },
      cable: { price: 15.9, qty: 3 },
   };
   const initialTotal = Object.values(INITIAL).reduce(
      (sum, item) => sum + item.price * item.qty,
      0,
   );

   $.defineCheckPoint('初始小计与合计计算正确', 10, async () => {
      for (const [name, item] of Object.entries(INITIAL)) {
         const actual = await text('#subtotal-' + name);
         const expected = money(item.price * item.qty);
         $.expect(
            actual === expected,
            '#subtotal-' +
               name +
               ' 期望 "' +
               expected +
               '"，实际为 "' +
               actual +
               '"',
         );
      }

      const total = await text('#total');
      $.expect(
         total === money(initialTotal),
         '#total 期望 "' + money(initialTotal) + '"，实际为 "' + total + '"',
      );
      return 10;
   });

   $.defineCheckPoint('改数量后小计与合计同步更新', 10, async () => {
      await setQty('keyboard', 4);

      const subtotal = await text('#subtotal-keyboard');
      $.expect(
         subtotal === '98.00',
         '键盘数量改成 4 后 #subtotal-keyboard 期望 "98.00"，实际为 "' +
            subtotal +
            '"',
      );

      const expectedTotal = money(
         initialTotal -
            INITIAL.keyboard.price * INITIAL.keyboard.qty +
            INITIAL.keyboard.price * 4,
      );
      const total = await text('#total');
      $.expect(
         total === expectedTotal,
         '改数量后 #total 期望 "' + expectedTotal + '"，实际为 "' + total + '"',
      );

      // 还原成初始数量，后面的检查点依赖它
      await setQty('keyboard', 2);
      return 10;
   });

   $.defineCheckPoint('合计满 100 元时显示满减提示', 10, async () => {
      const tip = await text('#discount-tip');
      $.expect(
         tip === '已满 100 元，可享 9 折',
         '#discount-tip 期望 "已满 100 元，可享 9 折"，实际为 "' + tip + '"',
      );

      const total = await text('#total');
      $.expect(
         total === money(initialTotal),
         '这一步不该改动合计：#total 期望 "' +
            money(initialTotal) +
            '"，实际为 "' +
            total +
            '"',
      );
      return 10;
   });

   $.defineCheckPoint('结算按钮可用且点击后提示成功', 10, async () => {
      const enabled = await page.$eval(
         '#checkout',
         (element) => !element.disabled,
      );
      $.expect(enabled, '购物车里有商品时 #checkout 应可用，实际是禁用状态');

      await page.click('#checkout', { timeout: 3000 });

      const tip = await text('#checkout-tip');
      $.expect(
         tip === '结算成功',
         '点击 #checkout 后 #checkout-tip 期望 "结算成功"，实际为 "' + tip + '"',
      );

      return 10;
   });
});
