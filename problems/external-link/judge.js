// 判题脚本。首行必须写成 defineTestHandler(...)，前面加导出关键字：
// 判题机内部会把行首那条导出语句替换成 const run = ... 后执行。
export default defineTestHandler(async ({ page, $ }) => {
   // 调度器只等判题机 30s；默认超时收到 3s，选择器写错能立刻变成一条可读的原因。
   page.setDefaultTimeout(3000);
   page.setDefaultNavigationTimeout(8000);

   /**
    * ⚠️ 判题脚本跑在 vm2 沙箱里，**没有 URL 构造函数**（`new URL` 直接抛
    * "URL is not defined"）。所以这里用字符串解析地址，不要依赖浏览器/Node 的全局对象。
    */
   const parseUrl = (value) => {
      const match = /^(https?):\/\/([^/?#]+)([^?#]*)/i.exec(String(value));
      if (!match) return null;
      return {
         scheme: match[1].toLowerCase(),
         host: match[2].toLowerCase(),
         path: (match[3] || '').replace(/\/+$/, ''),
      };
   };

   const text = async (selector) => {
      const element = await page.$(selector);
      if (!element) throw new Error('找不到元素 ' + selector);
      return (await element.textContent()).trim();
   };

   // 语义化的链接：<a> 自带 href 且非空。用 onclick 跳转的写法不算。
   const linkSelector = 'a[href]';

   const rawHref = async () => {
      const element = await page.$(linkSelector);
      if (!element) throw new Error('页面里没有 <a href> 链接');
      return String(await element.getAttribute('href'));
   };

   /** 页面里有没有链接：后面几条检查点在「没有」时要给可读原因，而不是 Playwright 的超时 */
   const hasLink = async () => (await page.$$(linkSelector)).length > 0;

   $.defineCheckPoint('页面里只有一个链接，文字是「去百度」', 10, async () => {
      const count = await page.$$eval(linkSelector, (items) => items.length);
      $.expect(
         count === 1,
         '页面里应该只有 1 个带 href 的链接，实际有 ' + count + ' 个',
      );

      const label = await text(linkSelector);
      $.expect(
         label === '去百度',
         '链接文字期望 "去百度"，实际为 "' + label + '"',
      );
      return 10;
   });

   $.defineCheckPoint('href 写的是带协议的绝对地址', 10, async () => {
      const raw = await rawHref();
      $.expect(
         /^https?:\/\//i.test(raw),
         'href 期望以协议开头（例如 https://www.baidu.com），实际为 "' + raw + '"',
      );

      const parsed = parseUrl(raw);
      $.expect(
         parsed !== null,
         'href 不是可解析的绝对地址："' + raw + '"',
      );
      $.expect(
         parsed.host === 'www.baidu.com',
         'href 期望指向 www.baidu.com，实际为 "' + parsed.host + '"（原始值 "' + raw + '"）',
      );
      return 10;
   });

   $.defineCheckPoint('解析后的地址是百度首页，而不是本地站点里的同名文件', 10, async () => {
      // getAttribute 拿的是源码里的值；这里要的是**浏览器解析后**的绝对地址
      const element = await page.$(linkSelector);
      if (!element) throw new Error('页面里没有 <a href> 链接');
      const resolved = String(await element.getAttribute('href'));
      const parsed = parseUrl(resolved);

      $.expect(
         parsed !== null,
         '解析后的地址不是 http(s) 绝对地址："' + resolved + '"',
      );
      $.expect(
         parsed.host === 'www.baidu.com',
         '解析后的 host 期望 www.baidu.com，实际为 "' +
            parsed.host +
            '"（完整地址 "' +
            resolved +
            '"）',
      );
      $.expect(
         parsed.path === '',
         '解析后的路径期望为空（站点根），实际为 "' +
            parsed.path +
            '"——href="www.baidu.com" 会被当成相对路径拼在当前站点后面',
      );
      return 10;
   });

   $.defineCheckPoint('点击后离开本地页面', 10, async () => {
      if (!(await hasLink())) {
         throw new Error('页面里没有 <a href> 链接，无法点击');
      }

      const before = page.url();
      const isLocal = (value) =>
         /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(value) ||
         /^https?:\/\/[^/]*:3000\//.test(value);

      await page.click(linkSelector, { timeout: 3000 }).catch(() => {
         // 外部站点不可达时 click 可能因导航失败抛错，是否跳转由下面判断
      });
      await page.waitForTimeout(1500);

      const after = page.url();
      if (after !== before && !isLocal(after)) {
         return 10;
      }

      // 位置没变：区分「跳转没发生」和「判题机没有外网」
      let reachable = true;
      try {
         const response = await page.request.get('https://www.baidu.com', {
            timeout: 8000,
         });
         reachable = response.status() < 500;
      } catch {
         reachable = false;
      }

      if (!reachable) {
         // 环境问题不该记在学生头上：这条只提示，不扣分
         console.log('判题机无法访问外网，跳过「点击后跳转」的判定');
         return 10;
      }

      $.expect(
         false,
         '点击链接后地址仍是 "' + after + '"，期望跳到 www.baidu.com',
      );
      return 10;
   });
});
