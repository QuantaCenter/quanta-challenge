import path from 'path';
import { findRepoRoot } from './repo-root.ts';

/** local_store 的统一解析器：调度器写、Web 应用读，相对路径会按各自 cwd 解析成两个目录（历史上导致封面 404），故强制收敛到规范目录 packages/challenge-web-app/local_store。 */

/** 唯一的规范存储目录（绝对路径）。 */
export const canonicalLocalStorePath = (): string => {
   const root = findRepoRoot();
   return path.join(root, 'packages', 'challenge-web-app', 'local_store');
};

let warned = false;

/** 返回 local_store 的绝对路径：LOCAL_STORE_PATH 为绝对路径则使用，否则一律用规范目录并告警（相对路径按 cwd 解析正是历史 bug 来源）。 */
export const resolveLocalStorePath = (): string => {
   const configured = process.env.LOCAL_STORE_PATH?.trim();

   if (configured && path.isAbsolute(configured)) return path.resolve(configured);

   const canonical = canonicalLocalStorePath();

   if (configured && !warned) {
      warned = true;
      const wouldBe = path.resolve(process.cwd(), configured);
      if (wouldBe !== canonical) {
         console.warn(
            `[local-store] LOCAL_STORE_PATH="${configured}" 是相对路径，` +
               `按 cwd 会解析到 ${wouldBe}，与 Web 应用的读取目录不一致，` +
               `将导致题目封面等图片 404。已强制改用规范目录：${canonical}。` +
               `如需自定义，请配置**绝对路径**。`,
         );
      }
   }

   return canonical;
};

/** 供调试用：把解析结果与其来源一并打印出来。 */
export const describeLocalStorePath = (): string => {
   const configured = process.env.LOCAL_STORE_PATH?.trim();
   const resolved = resolveLocalStorePath();
   const source = configured
      ? path.isAbsolute(configured)
         ? `LOCAL_STORE_PATH=${configured}（绝对路径）`
         : `LOCAL_STORE_PATH=${configured}（相对路径，已忽略，使用规范目录）`
      : '规范目录（未配置 LOCAL_STORE_PATH）';
   return `${resolved}  [${source}]`;
};
