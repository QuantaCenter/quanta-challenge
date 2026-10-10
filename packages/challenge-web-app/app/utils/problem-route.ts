/**
 * 做题页地址的解析规则（纯函数）。
 *
 * 两种地址：
 *   · `/challenge/editor/by-base/:baseId` —— 正文里按**题号**引用，链接也按题号写；
 *   · `/challenge/editor/:pid`            —— 直接给版本号的老写法。
 * 外加 `/challenge/record/:pid`（提交记录）。
 *
 * 为什么要抽成纯函数：分支顺序错过一次，后果是**所有**题目链接都被判成
 * "题号有误"——因为 `by-base` 这一段被 `Number()` 转出来是 NaN，
 * 如果先做"pid 必须是正整数"的校验，by-base 分支就永远进不去。
 * 这类顺序 bug 用测试钉死，比"再看一遍代码"可靠。
 */
export type ProblemRouteTarget =
   | { kind: 'record'; pid: number | null }
   | { kind: 'byBase'; baseId: number }
   | { kind: 'direct'; pid: number }
   | { kind: 'invalid' };

export const resolveProblemRoute = (
   path: readonly string[] | undefined,
): ProblemRouteTarget => {
   const segment = path?.[0];
   const second = path?.[1];

   if (segment !== 'editor') {
      return { kind: 'record', pid: toPositiveInt(second) };
   }
   if (second === 'by-base') {
      const baseId = toPositiveInt(path?.[2]);
      return baseId === null ? { kind: 'invalid' } : { kind: 'byBase', baseId };
   }
   const pid = toPositiveInt(second);
   return pid === null ? { kind: 'invalid' } : { kind: 'direct', pid };
};

const toPositiveInt = (value: string | undefined): number | null => {
   const parsed = Number(value);
   return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
