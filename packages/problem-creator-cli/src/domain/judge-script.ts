/**
 * 判题脚本的**静态分析**。
 *
 * 为什么要在本地做这件事：`docs/PROBLEM_AUTHORING.md` 记录的几个坑
 * （检查点忘记 return 分数、`page.click` 打到 disabled 按钮卡满 30 秒、
 * 断言消息没写"期望 vs 实际"）都能在不启动判题机的情况下静态发现。
 * 线上审计一轮要 20 秒且需要等调度器，本地静态检查是**毫秒级**的，
 * 因此能提前挡掉的错误绝不留给线上。
 *
 * 分析策略：先把注释、字符串、模板串、正则整体"打码"成等长空格，
 * 得到一个只剩代码结构的 mask，然后在 mask 上做括号配对与调用点查找，
 * 需要真实内容时再用相同下标回原串切片。
 * 这样不必写完整的 JS 解析器，也不会被字符串里的括号带偏。
 */

export interface Checkpoint {
   name: string;
   score: number;
   /** 1-based 行号 */
   line: number;
   /** 是否 return 了具体分数（return; / 无 return 都是 false） */
   returnsValue: boolean;
}

export interface Located<T> {
   line: number;
   value: T;
}

export interface JudgeScriptAnalysis {
   /** 是否写了 `export default ...`（判题机靠文本替换 `export default ` → `const run = `） */
   hasDefaultExport: boolean;
   hasDefineTestHandler: boolean;
   /** 除 default 之外的导出，会残留在沙箱模块里，属于可疑写法 */
   namedExports: string[];
   checkpoints: Checkpoint[];
   /** 各检查点分值之和（解析不到的一律计 0 并单独报告） */
   checkpointTotal: number;
   unparsedCheckpoints: Located<string>[];
   clickWithoutTimeout: Located<string>[];
   /** 断言消息缺少"期望 vs 实际"（学生看不懂失败原因） */
   vagueExpectations: Located<string>[];
   expectationCount: number;
   lineCount: number;
}

interface CallSite {
   /** mask 中的起止下标（end 为右括号之后） */
   start: number;
   end: number;
   /** 原始代码中的参数文本（保持原样，含换行） */
   args: string[];
}

const IDENT = /[A-Za-z0-9_$]/;

const isRegexStart = (code: string, index: number): boolean => {
   let i = index - 1;
   while (i >= 0 && /\s/.test(code[i] as string)) i -= 1;
   if (i < 0) return true;
   return /[([{,;:=!&|?+\-*%~^<>]/.test(code[i] as string);
};

const skipQuoted = (code: string, start: number, quote: string): number => {
   let i = start + 1;
   while (i < code.length) {
      const ch = code[i];
      if (ch === '\\') {
         i += 2;
         continue;
      }
      if (ch === quote) return i + 1;
      if (ch === '\n') return i; // 未闭合的引号：就此打住，别把整个文件吃掉
      i += 1;
   }
   return code.length;
};

/** 模板串里的 `${}` 允许再嵌字符串/模板，必须递归跳过 */
const skipTemplate = (code: string, start: number): number => {
   let i = start + 1;
   while (i < code.length) {
      const ch = code[i];
      if (ch === '\\') {
         i += 2;
         continue;
      }
      if (ch === '`') return i + 1;
      if (ch === '$' && code[i + 1] === '{') {
         i = skipBalanced(code, i + 1, '{', '}');
         continue;
      }
      i += 1;
   }
   return code.length;
};

const skipRegex = (code: string, start: number): number => {
   let i = start + 1;
   let inClass = false;
   while (i < code.length) {
      const ch = code[i];
      if (ch === '\\') {
         i += 2;
         continue;
      }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) return i + 1;
      else if (ch === '\n') return i;
      i += 1;
   }
   return code.length;
};

const skipBalanced = (
   code: string,
   openIndex: number,
   open: string,
   close: string,
): number => {
   let depth = 0;
   let i = openIndex;
   while (i < code.length) {
      const ch = code[i] as string;
      if (ch === '/' && code[i + 1] === '/') {
         const end = code.indexOf('\n', i);
         i = end === -1 ? code.length : end;
         continue;
      }
      if (ch === '/' && code[i + 1] === '*') {
         const end = code.indexOf('*/', i + 2);
         i = end === -1 ? code.length : end + 2;
         continue;
      }
      if (ch === '"' || ch === "'") {
         i = skipQuoted(code, i, ch);
         continue;
      }
      if (ch === '`') {
         i = skipTemplate(code, i);
         continue;
      }
      if (ch === '/' && isRegexStart(code, i)) {
         i = skipRegex(code, i);
         continue;
      }
      if (ch === open) depth += 1;
      else if (ch === close) {
         depth -= 1;
         if (depth === 0) return i + 1;
      }
      i += 1;
   }
   return code.length;
};

/** 把注释/字符串/模板串/正则替换成等长空格（保留换行，行号不变） */
export const maskNonCode = (code: string): string => {
   const chars = code.split('');
   const blank = (from: number, to: number) => {
      for (let i = from; i < to; i += 1) {
         if (chars[i] !== '\n') chars[i] = ' ';
      }
   };

   let i = 0;
   while (i < code.length) {
      const ch = code[i] as string;
      const next = code[i + 1];
      if (ch === '/' && next === '/') {
         const end = code.indexOf('\n', i);
         const to = end === -1 ? code.length : end;
         blank(i, to);
         i = to;
         continue;
      }
      if (ch === '/' && next === '*') {
         const end = code.indexOf('*/', i + 2);
         const to = end === -1 ? code.length : end + 2;
         blank(i, to);
         i = to;
         continue;
      }
      if (ch === '"' || ch === "'") {
         const to = skipQuoted(code, i, ch);
         blank(i, to);
         i = to;
         continue;
      }
      if (ch === '`') {
         const to = skipTemplate(code, i);
         blank(i, to);
         i = to;
         continue;
      }
      if (ch === '/' && isRegexStart(code, i)) {
         const to = skipRegex(code, i);
         blank(i, to);
         i = to;
         continue;
      }
      i += 1;
   }

   return chars.join('');
};

/** 在 mask 上按 top-level 逗号切分参数，再回原串取文本 */
const splitArgs = (
   code: string,
   mask: string,
   from: number,
   to: number,
): string[] => {
   const args: string[] = [];
   let depth = 0;
   let start = from;
   for (let i = from; i < to; i += 1) {
      const ch = mask[i] as string;
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
      else if (ch === ',' && depth === 0) {
         args.push(code.slice(start, i));
         start = i + 1;
      }
   }
   if (to > from) args.push(code.slice(start, to));
   return args.map((arg) => arg.trim()).filter((arg) => arg.length > 0);
};

/**
 * 查找 `callee(` 形式的调用点。`callee` 支持点号路径（如 `page.click`），
 * 也支持后缀匹配 `$.defineCheckPoint` 这类带美元前缀的写法。
 */
const findCalls = (code: string, mask: string, callee: string): CallSite[] => {
   const sites: CallSite[] = [];
   let i = 0;
   while (i < mask.length) {
      const index = mask.indexOf(callee, i);
      if (index === -1) break;
      const before = index === 0 ? '' : (mask[index - 1] as string);
      const afterIndex = index + callee.length;
      const after =
         afterIndex >= mask.length ? '' : (mask[afterIndex] as string);

      // 以标识符开头的 callee 才需要左侧边界检查；`.click` 这类以点开头的
      // callee 左侧必然是接收者（page / el），检查会把所有方法调用漏掉。
      if (IDENT.test(callee[0] as string) && before && IDENT.test(before)) {
         i = index + 1;
         continue;
      }
      if (after && IDENT.test(after)) {
         i = index + 1;
         continue;
      }

      let cursor = afterIndex;
      while (cursor < mask.length && /\s/.test(mask[cursor] as string))
         cursor += 1;
      if (mask[cursor] !== '(') {
         i = index + 1;
         continue;
      }

      const end = skipBalanced(mask, cursor, '(', ')');
      sites.push({
         start: index,
         end,
         args: splitArgs(code, mask, cursor + 1, end - 1),
      });
      i = end;
   }
   return sites;
};

const lineOf = (code: string, index: number): number => {
   let line = 1;
   for (let i = 0; i < index && i < code.length; i += 1) {
      if (code[i] === '\n') line += 1;
   }
   return line;
};

/** 解析字面量字符串（支持 ' " ` 与常见转义），非字面量返回 undefined */
export const parseStringLiteral = (text: string): string | undefined => {
   const trimmed = text.trim();
   const quote = trimmed[0];
   if (quote !== '"' && quote !== "'" && quote !== '`') return undefined;
   if (trimmed.length < 2 || trimmed[trimmed.length - 1] !== quote)
      return undefined;
   const body = trimmed.slice(1, -1);
   if (quote === '`' && body.includes('${')) return undefined;
   return body.replace(/\\(.)/g, (_, char: string) => {
      const escapes: Record<string, string> = {
         n: '\n',
         t: '\t',
         r: '\r',
         '\\': '\\',
         '"': '"',
         "'": "'",
         '`': '`',
      };
      return escapes[char] ?? char;
   });
};

export const analyzeJudgeScript = (code: string): JudgeScriptAnalysis => {
   const mask = maskNonCode(code);

   const handlerCalls = findCalls(code, mask, 'defineTestHandler');
   const checkpointCalls = findCalls(code, mask, 'defineCheckPoint');
   const expectCalls = findCalls(code, mask, 'expect');

   const checkpoints: Checkpoint[] = [];
   const unparsedCheckpoints: Located<string>[] = [];

   for (const call of checkpointCalls) {
      const [nameArg = '', scoreArg = '', handlerArg = ''] = call.args;
      const name =
         parseStringLiteral(nameArg) ?? nameArg.replace(/\s+/g, ' ').trim();
      const score = Number.parseFloat(scoreArg.trim());
      const line = lineOf(code, call.start);

      if (!Number.isFinite(score)) {
         unparsedCheckpoints.push({
            line,
            value: scoreArg.trim() || '<missing>',
         });
      }

      // 判分是否 return 是**最高频的坑**：handler 里没有带值的 return，
      // 即使断言全过也会记 0 分（defineTestHandler 里 score = successScore ?? 0）。
      const returnsValue = /\breturn\b\s*[^;\s}]/.test(maskNonCode(handlerArg));

      checkpoints.push({
         name: name || '<unnamed>',
         score: Number.isFinite(score) ? score : 0,
         line,
         returnsValue,
      });
   }

   const clickWithoutTimeout: Located<string>[] = [];
   for (const call of findCalls(code, mask, '.click')) {
      const snippet = code
         .slice(Math.max(0, call.start - 16), call.end)
         .replace(/\s+/g, ' ')
         .trim();
      if (/\btimeout\b/.test(mask.slice(call.start, call.end))) continue;
      clickWithoutTimeout.push({
         line: lineOf(code, call.start),
         value: snippet,
      });
   }

   const vagueExpectations: Located<string>[] = [];
   for (const call of expectCalls) {
      const message = call.args[1];
      if (message === undefined) continue;
      // 只要出现插值/拼接/"实际"字样就认为信息足够
      if (/\$\{|\+|实际|expected|Received/i.test(message)) continue;
      vagueExpectations.push({
         line: lineOf(code, call.start),
         value:
            parseStringLiteral(message) ?? message.replace(/\s+/g, ' ').trim(),
      });
   }

   const namedExports: string[] = [];
   const exportRe =
      /\bexport\s+(?!default\b)(?:const|let|var|function|class|async)\s+([A-Za-z0-9_$]+)/g;
   for (const match of mask.matchAll(exportRe)) {
      if (match[1]) namedExports.push(match[1]);
   }

   return {
      hasDefaultExport: /\bexport\s+default\b/.test(mask),
      hasDefineTestHandler: handlerCalls.length > 0,
      namedExports,
      checkpoints,
      checkpointTotal: checkpoints.reduce((sum, cp) => sum + cp.score, 0),
      unparsedCheckpoints,
      clickWithoutTimeout,
      vagueExpectations,
      expectationCount: expectCalls.length,
      lineCount: code.split('\n').length,
   };
};
