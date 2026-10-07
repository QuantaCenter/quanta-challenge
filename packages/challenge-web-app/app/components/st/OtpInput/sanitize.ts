/**
 * OTP 输入的清洗逻辑。
 *
 * 抽成独立模块而不是写在组件里，有两个原因：
 *   1. 这是**唯一**需要单元测试的部分（键盘事件、粘贴、光标这些 DOM 行为
 *      靠组件测试去覆盖，成本远高于收益），纯函数可以直接测；
 *   2. 与设备码的归一化规则（@challenge/shared/oauth 的 normalizeUserCode）
 *      是两层不同的关注点：这里负责"把用户输入变成干净字符串"，
 *      共享层负责"这个码在协议上是什么意思"。混在一起会让人以为
 *      改了组件就等于改了协议。
 */
export interface SanitizeOtpOptions {
   /** 允许的字符集；不传则放开为 A-Z0-9 */
   alphabet?: string;
   /** 最大长度（通常 = 分组数 × 每组位数） */
   maxLength: number;
}

export const sanitizeOtpInput = (
   raw: string,
   options: SanitizeOtpOptions,
): string => {
   const upper = raw.toUpperCase();
   const allowed = options.alphabet;
   const chars = allowed
      ? [...upper].filter((char) => allowed.includes(char))
      : [...upper].filter((char) => /[A-Z0-9]/.test(char));
   // 超长必须截断：否则第 9 个字符会留在 DOM 里但模型值没有，
   // 表现为"看得见但提交不上"。
   return chars.slice(0, options.maxLength).join('');
};
