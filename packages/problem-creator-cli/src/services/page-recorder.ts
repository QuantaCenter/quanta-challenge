import { setTimeout as sleep } from 'node:timers/promises';

import type { Page } from 'playwright-core';

import { UsageError } from '../core/errors';
import type { TimedFrame } from '../domain/gif';

export type RecordAction =
   | { kind: 'wait'; ms: number; raw: string }
   | { kind: 'click' | 'hover'; selector: string; raw: string }
   | { kind: 'type'; text: string; raw: string }
   | { kind: 'press'; key: string; raw: string }
   | { kind: 'scroll'; by?: number; selector?: string; raw: string };

export const RECORD_ACTION_SYNTAX =
   'wait:<ms> | click:<选择器> | hover:<选择器> | type:<文本> | press:<按键> | scroll:<像素|选择器>';

const MAX_WAIT_MS = 10_000;
const ACTION_TIMEOUT_MS = 5_000;
const TYPE_DELAY_MS = 80;
const SMOOTH_SCROLL_MS = 600;

export const parseRecordActions = (tokens: string[]): RecordAction[] =>
   tokens.map((raw) => {
      const colon = raw.indexOf(':');
      const verb = colon === -1 ? raw : raw.slice(0, colon);
      const arg = colon === -1 ? '' : raw.slice(colon + 1);
      if (!arg) {
         throw new UsageError(`交互步骤缺少参数：${raw}`, {
            hint: `格式：${RECORD_ACTION_SYNTAX}`,
         });
      }
      switch (verb) {
         case 'wait': {
            const ms = Number(arg);
            if (!Number.isInteger(ms) || ms < 0 || ms > MAX_WAIT_MS) {
               throw new UsageError(
                  `wait 必须是 0~${MAX_WAIT_MS} 的整数毫秒：${raw}`,
               );
            }
            return { kind: 'wait', ms, raw };
         }
         case 'click':
         case 'hover':
            return { kind: verb, selector: arg, raw };
         case 'type':
            return { kind: 'type', text: arg, raw };
         case 'press':
            return { kind: 'press', key: arg, raw };
         case 'scroll':
            return /^-?\d+$/.test(arg)
               ? { kind: 'scroll', by: Number(arg), raw }
               : { kind: 'scroll', selector: arg, raw };
         default:
            throw new UsageError(`不认识的交互步骤：${raw}`, {
               hint: `格式：${RECORD_ACTION_SYNTAX}`,
            });
      }
   });

/**
 * 无头浏览器没有光标：注入一个跟随 mousemove 的箭头，按下时缩一下并出一圈涟漪。
 * 用捕获阶段监听，页面 stopPropagation 也挡不住；pointer-events: none 不影响命中。
 */
export const CURSOR_INIT_SCRIPT = `(() => {
   const install = () => {
      if (document.getElementById('__qpc_cursor')) return;
      const style = document.createElement('style');
      style.textContent = '#__qpc_cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;display:none;margin:-2px 0 0 -3px;transform-origin:3px 2px;transition:transform .1s}'
         + '#__qpc_cursor.down{transform:scale(.82)}'
         + '.__qpc_ripple{position:fixed;z-index:2147483646;pointer-events:none;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;background:rgba(59,130,246,.35);animation:__qpc_ripple .45s ease-out forwards}'
         + '@keyframes __qpc_ripple{from{transform:scale(.2);opacity:1}to{transform:scale(1.4);opacity:0}}';
      const cursor = document.createElement('div');
      cursor.id = '__qpc_cursor';
      cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2v16l4.5-4.2 3 6.7 2.7-1.2-2.9-6.5h6.2z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      document.documentElement.append(style, cursor);
      addEventListener('mousemove', (event) => {
         cursor.style.display = 'block';
         cursor.style.left = event.clientX + 'px';
         cursor.style.top = event.clientY + 'px';
      }, true);
      addEventListener('mousedown', (event) => {
         cursor.classList.add('down');
         const ripple = document.createElement('div');
         ripple.className = '__qpc_ripple';
         ripple.style.left = event.clientX + 'px';
         ripple.style.top = event.clientY + 'px';
         document.documentElement.append(ripple);
         setTimeout(() => ripple.remove(), 500);
      }, true);
      addEventListener('mouseup', () => cursor.classList.remove('down'), true);
   };
   if (document.documentElement) install();
   else addEventListener('DOMContentLoaded', install);
})();`;

export interface Region {
   left: number;
   top: number;
   width: number;
   height: number;
}

export interface RecordPageOptions {
   actions: RecordAction[];
   viewport: { width: number; height: number };
   /** 只截这块区域（CSS 像素），默认整个视口 */
   clip?: Region;
   /** 与页面 deviceScaleFactor 一致（CDP 的设备模拟按会话生效，新会话截图要自己指定） */
   scale: number;
   /** 总时长；不给时为「交互结束 + tailMs」 */
   durationMs?: number;
   tailMs: number;
   maxMs: number;
   /** 已通过 CURSOR_INIT_SCRIPT 注入假光标：鼠标改为平滑移动 */
   cursor: boolean;
}

export interface RecordPageResult {
   frames: TimedFrame[];
   durationMs: number;
   /** 交互步骤没跑完就到了时长上限 */
   truncated: boolean;
}

/**
 * 连续截图采集帧，同时按顺序执行交互步骤。
 * 不用 Page.startScreencast：无头模式下它忽略 deviceScaleFactor，帧尺寸也和视口对不上。
 */
export const recordPage = async (
   page: Page,
   options: RecordPageOptions,
): Promise<RecordPageResult> => {
   const pointer = {
      x: Math.round(options.viewport.width * 0.9),
      y: Math.round(options.viewport.height * 0.9),
   };
   if (options.cursor) await page.mouse.move(pointer.x, pointer.y);

   const cdp = await page.context().newCDPSession(page);
   const frames: TimedFrame[] = [];
   let recording = true;
   let captureError: unknown;
   const area = options.clip ?? {
      left: 0,
      top: 0,
      width: options.viewport.width,
      height: options.viewport.height,
   };
   const clip = {
      x: area.left,
      y: area.top,
      width: area.width,
      height: area.height,
      scale: options.scale,
   };
   const startedAt = Date.now();
   const capture = (async () => {
      while (recording) {
         const before = Date.now();
         const { data } = await cdp.send('Page.captureScreenshot', {
            format: 'png',
            optimizeForSpeed: true,
            clip,
         });
         frames.push({
            image: Buffer.from(data, 'base64'),
            at: (before + Date.now()) / 2 - startedAt,
         });
      }
   })().catch((error: unknown) => {
      captureError = error;
   });
   while (frames.length === 0 && captureError === undefined) await sleep(10);
   if (captureError !== undefined) throw captureError;

   const elapsed = () => Date.now() - startedAt;
   const limit = Math.min(options.durationMs ?? options.maxMs, options.maxMs);
   const timer = new AbortController();
   let actionError: unknown;
   let truncated = false;
   try {
      const actions = runActions(page, options, pointer).then(
         () => 'done' as const,
         (error: unknown) => {
            actionError = error;
            return 'failed' as const;
         },
      );
      const outcome = await Promise.race([
         actions,
         sleep(Math.max(0, limit - elapsed()), 'timeout' as const, {
            signal: timer.signal,
         }),
      ]);
      timer.abort();
      if (outcome === 'failed') throw actionError;
      if (outcome === 'timeout') {
         truncated = options.actions.length > 0;
      } else {
         const end =
            options.durationMs === undefined
               ? Math.min(elapsed() + options.tailMs, options.maxMs)
               : limit;
         await sleep(Math.max(0, end - elapsed()));
      }
   } finally {
      timer.abort();
      recording = false;
      await capture;
      await cdp.detach().catch(() => {});
   }
   if (captureError !== undefined) throw captureError;
   return { frames, durationMs: elapsed(), truncated };
};

const runActions = async (
   page: Page,
   options: RecordPageOptions,
   pointer: { x: number; y: number },
): Promise<void> => {
   for (const [index, action] of options.actions.entries()) {
      try {
         await runAction(page, action, options.cursor, pointer);
      } catch (error) {
         if (error instanceof UsageError) throw error;
         const message = error instanceof Error ? error.message : String(error);
         throw new UsageError(
            `第 ${index + 1} 步 \`${action.raw}\` 执行失败：${message.split('\n')[0]}`,
            {
               hint: '检查选择器能在参考解页面上找到且可见；可以先用 `wait:<ms>` 等页面就绪。',
            },
         );
      }
   }
};

const runAction = async (
   page: Page,
   action: RecordAction,
   cursor: boolean,
   pointer: { x: number; y: number },
): Promise<void> => {
   switch (action.kind) {
      case 'wait':
         await page.waitForTimeout(action.ms);
         return;
      case 'type':
         await page.keyboard.type(action.text, { delay: TYPE_DELAY_MS });
         return;
      case 'press':
         await page.keyboard.press(action.key);
         return;
      case 'scroll':
         if (action.selector) {
            await page
               .locator(action.selector)
               .first()
               .evaluate(
                  (element) =>
                     element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                     }),
                  undefined,
                  { timeout: ACTION_TIMEOUT_MS },
               );
         } else {
            await page.mouse.wheel(0, action.by ?? 0);
         }
         await page.waitForTimeout(SMOOTH_SCROLL_MS);
         return;
      case 'click':
      case 'hover': {
         const locator = page.locator(action.selector).first();
         if (!cursor) {
            if (action.kind === 'click') {
               await locator.click({ timeout: ACTION_TIMEOUT_MS });
            } else {
               await locator.hover({ timeout: ACTION_TIMEOUT_MS });
            }
            return;
         }
         await locator.scrollIntoViewIfNeeded({ timeout: ACTION_TIMEOUT_MS });
         const box = await locator.boundingBox({ timeout: ACTION_TIMEOUT_MS });
         if (!box) throw new UsageError(`元素不可见：${action.selector}`);
         await glide(page, pointer, {
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
         });
         if (action.kind === 'click') {
            await page.waitForTimeout(120);
            await page.mouse.down();
            await page.waitForTimeout(90);
            await page.mouse.up();
         }
         return;
      }
   }
};

/** 缓动地把鼠标移到目标点（page.mouse.move 的 steps 没有间隔，录不出移动过程）。 */
const glide = async (
   page: Page,
   pointer: { x: number; y: number },
   to: { x: number; y: number },
): Promise<void> => {
   const from = { ...pointer };
   const distance = Math.hypot(to.x - from.x, to.y - from.y);
   const durationMs = Math.min(700, Math.max(250, distance * 1.2));
   const steps = Math.max(1, Math.round(durationMs / 16));
   for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.mouse.move(
         from.x + (to.x - from.x) * eased,
         from.y + (to.y - from.y) * eased,
      );
      await page.waitForTimeout(16);
   }
   pointer.x = to.x;
   pointer.y = to.y;
};
