import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * 设备授权确认页的**组件 API 契约**测试。
 *
 * 为什么值得单独测：这页第一版把两个组件的用法都写错了，而且**类型检查与
 * 构建都不会报错**，只有真正打开页面才发现 —— 症状是"验证码和按钮文字都不显示"。
 *
 *   · StInput 用的是 `defineModel('value')`，所以 prop 名是 **value**；
 *     写成 `v-model:model-value` 不会报错（多余属性被透传到 <input>），
 *     但输入框拿不到初始值、也不回写。
 *   · StButton 渲染 `<button>`，`:value` 不会显示，文字必须走默认插槽；
 *     写 `text="继续"` 会得到一个**空按钮**（props 里确实有 text，
 *     所以 TS 不报错，但模板只把它绑到 input 的 value 上）。
 *
 * 这两条都属于"类型系统管不到、只有肉眼能发现"的约定，
 * 因此用测试把它钉住，避免下次改样式时又退回去。
 */
const pagePath = fileURLToPath(
   new URL('../../../app/pages/auth/device/index.vue', import.meta.url),
);
const source = readFileSync(pagePath, 'utf8');

/**
 * 去掉注释后再断言。
 *
 * 页面里大量注释在解释"为什么**不**这么做"（例如"特意不用 fetchUserInfo"），
 * 直接对全文断言 not.toContain 会被这些解释性注释误伤 ——
 * 测试应该约束**代码**，而不是文档措辞。
 */
const code = source
   .replace(/<!--[\s\S]*?-->/g, '')
   .replace(/\/\*[\s\S]*?\*\//g, '')
   .replace(/^\s*\/\/.*$/gm, '');

describe('设备授权确认页的组件用法', () => {
   it('验证码用 StOtpInput 分组输入，并与终端显示格式一致', () => {
      // 设备码是 base20×8、按 4 位分组（RFC 8628 §6.1）。
      // 用普通输入框时用户无法逐格与终端核对，因此这里要求使用 OTP 组件。
      const otp = code.match(/<StOtpInput[\s\S]*?\/>/);
      expect(otp, '应当使用 StOtpInput').not.toBeNull();
      const tag = otp![0];
      // 必须显式给出分组与字符集，否则会退化成"任意 8 位"而丢掉格式约束
      expect(tag).toContain(':group-size="4"');
      expect(tag).toContain(':group-count="2"');
      expect(tag).toContain('USER_CODE_ALPHABET');
   });

   it('不再使用普通 StInput 收验证码', () => {
      // 若回退成 StInput，就会丢掉分组展示与粘贴清洗，
      // 这类回归只在肉眼可见层面暴露，必须由测试拦住。
      expect(code).not.toMatch(/<StInput/);
   });

   it('StButton 的文字走插槽，不使用 text 属性', () => {
      const buttons = source.match(/<StButton[\s\S]*?>/g) ?? [];
      expect(buttons.length).toBeGreaterThan(0);
      for (const tag of buttons) {
         expect(tag, `StButton 不支持 text 属性：${tag}`).not.toMatch(/\stext=/);
      }
   });

   it('按钮标签内确实有可读文本（不是空按钮）', () => {
      // 抓 <StButton ...> 到 </StButton> 之间的插槽内容
      const bodies = [...source.matchAll(/<StButton[^>]*>([\s\S]*?)<\/StButton>/g)];
      expect(bodies.length).toBeGreaterThan(0);
      for (const [, body] of bodies) {
         const text = (body ?? '').replace(/<[^>]+>/g, '').trim();
         expect(text.length, `按钮必须有文字：${body}`).toBeGreaterThan(0);
      }
   });

   it('登录状态在 setup 顶层 await 解析（不是 onMounted）', () => {
      // auth-guard 只挂在 app/pages/app.vue 上，即只覆盖 /app/** 路由；
      // 本页在 /auth/** 下没有那个中间件，必须自行解析登录态。
      //
      // 关键在于**在 setup 顶层 await**（参照 challenge-layout.vue）：
      // onMounted 只在客户端执行，会导致 SSR 直出的 HTML 停在"检查中"分支
      // —— 已登录用户每次进页都会闪一下，且首屏 HTML 里连按钮都没有。
      expect(code).toContain('await resolveCurrentUser');
      expect(code).not.toContain('onMounted');
      // 不应再有"检查中"这个中间态
      expect(code).not.toContain('正在检查登录状态');
   });

   it('登录检查绕开 tRPC 插件的 401 全局重定向', () => {
      // tRPC 插件把任何 401 都当成"会话过期"并 302 到 /auth/login
      // （app/plugins/trpc.ts 的 redirectToLogin）。本页里"未登录"是合法的
      // 落地状态，用它会导致页面永远渲染不出来。
      // 因此这里必须直连端点，且**不能**调用 authStore.fetchUserInfo($trpc)。
      expect(code).not.toContain('fetchUserInfo');
      expect(code).toContain('/api/trpc/auth.login.getUser');
   });

   it('CSRF token 在客户端恢复（decision 请求需要）', () => {
      // token 存 localStorage，只在客户端存在；不恢复会导致
      // 点"同意"时缺 x-csrf-token 被服务端 403。
      expect(code).toContain('initToken');
      expect(code).toContain('import.meta.client');
   });

   it('验证码用同一份共享字符集归一化（与 CLI/服务端一致）', () => {
      expect(source).toContain('USER_CODE_ALPHABET');
      expect(source).toContain('formatUserCode');
      // 不应把字符集硬编码进来
      expect(source).not.toMatch(/BCDFGHJKLMNPQRSTVWXZ/);
   });
});
