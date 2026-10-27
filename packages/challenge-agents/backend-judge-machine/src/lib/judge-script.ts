/** 判题脚本预处理：只把代码里真正的 `export default ` 改写成 `const run = `；跳过注释/字符串/模板串/正则。 */

const IDENT = /[A-Za-z0-9_$]/;

const skipQuoted = (code: string, start: number, quote: string): number => {
   let i = start + 1;
   while (i < code.length) {
      const ch = code[i];
      if (ch === '\\') {
         i += 2;
         continue;
      }
      if (ch === quote) return i + 1;
      if (ch === '\n') return i; // 未闭合的引号：就此打住
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

/** 只有出现在表达式位置的 `/` 才是正则开头，`a / b` 这种是除法。 */
const isRegexStart = (code: string, index: number): boolean => {
   let i = index - 1;
   while (i >= 0 && /\s/.test(code[i] as string)) i -= 1;
   if (i < 0) return true;
   return /[([{,;:=!&|?+\-*%~^<>]/.test(code[i] as string);
};

/** 跳过 `${ ... }` 里的表达式（允许嵌套字符串/模板/大括号）。 */
const skipBraces = (code: string, start: number): number => {
   let depth = 1;
   let i = start;
   while (i < code.length && depth > 0) {
      const ch = code[i] as string;
      const next = code[i + 1];
      if (ch === '/' && next === '/') {
         const end = code.indexOf('\n', i);
         i = end === -1 ? code.length : end;
         continue;
      }
      if (ch === '/' && next === '*') {
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
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
   }
   return i;
};

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
         i = skipBraces(code, i + 2);
         continue;
      }
      i += 1;
   }
   return code.length;
};

const DEFAULT_EXPORT = /^export\s+default\s+/;

/** 把代码里真正的 `export default ` 改写成 `const run = `；找不到则原样返回。 */
export const replaceDefaultExport = (script: string): string => {
   let i = 0;
   while (i < script.length) {
      const ch = script[i] as string;
      const next = script[i + 1];

      if (ch === '/' && next === '/') {
         const end = script.indexOf('\n', i);
         i = end === -1 ? script.length : end;
         continue;
      }
      if (ch === '/' && next === '*') {
         const end = script.indexOf('*/', i + 2);
         i = end === -1 ? script.length : end + 2;
         continue;
      }
      if (ch === '"' || ch === "'") {
         i = skipQuoted(script, i, ch);
         continue;
      }
      if (ch === '`') {
         i = skipTemplate(script, i);
         continue;
      }
      if (ch === '/' && isRegexStart(script, i)) {
         i = skipRegex(script, i);
         continue;
      }

      // 只在标识符边界处匹配，避免命中 `myexport default` 之类的子串。
      if (
         ch === 'e' &&
         (i === 0 || !IDENT.test(script[i - 1] as string))
      ) {
         const match = DEFAULT_EXPORT.exec(script.slice(i));
         if (match) {
            return (
               script.slice(0, i) +
               'const run = ' +
               script.slice(i + match[0].length)
            );
         }
      }

      i += 1;
   }
   return script;
};
