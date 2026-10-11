import { ConfigError } from '../core/errors';

/**
 * 把生成好的封面 id 写回题目配置。
 *
 * 为什么要改文件而不是只打印一行让用户手抄：一条 `imageId` 抄错一个字符，
 * 报错要等到线上审计（"图片不存在"），而这正是 CLI 存在的意义——把隐式约定
 * 变成一条命令。所以 `qpc cover --write` 直接改配置，并在写完后**重新加载
 * 配置校验一遍**（见 commands/cover.ts），对不上就回滚。
 *
 * 只做最小的文本手术：不引 AST，不重排用户原有的格式与注释。
 */
export const applyCoverImageId = (
   content: string,
   imageId: string,
   file: string,
): string => {
   if (file.endsWith('.json')) {
      return applyToJson(content, imageId);
   }
   return applyToSource(content, imageId, file);
};

const applyToJson = (content: string, imageId: string): string => {
   let parsed: unknown;
   try {
      parsed = JSON.parse(content);
   } catch (error) {
      throw new ConfigError('题目配置不是合法 JSON，无法写回 imageId', {
         cause: error,
         hint: '手动把 cover.imageId 改成上面的值。',
      });
   }
   const root = parsed as { cover?: Record<string, unknown> };
   const cover = root.cover;
   if (cover?.mode !== 'custom') {
      throw new ConfigError(
         '配置里没有 cover: { mode: "custom" }，无法写回 imageId',
         { hint: '先按文档把封面改成自定义模式，再重跑。' },
      );
   }
   cover.imageId = imageId;
   return `${JSON.stringify(parsed, null, 3)}\n`;
};

const applyToSource = (
   content: string,
   imageId: string,
   file: string,
): string => {
   const coverMatch = /cover\s*:\s*\{/.exec(content);
   if (!coverMatch) {
      throw new ConfigError(
         `在 ${file} 里找不到 cover: { ... }，无法写回 imageId`,
         {
            hint: '把上面的 imageId 手动填进 cover.imageId。',
         },
      );
   }
   const openBrace = content.indexOf('{', coverMatch.index);
   const closeBrace = findObjectEnd(content, openBrace);
   if (closeBrace < 0) {
      throw new ConfigError(`在 ${file} 里无法解析 cover 对象（括号不配对）`, {
         hint: '把上面的 imageId 手动填进 cover.imageId。',
      });
   }

   const before = content.slice(0, openBrace);
   const body = content.slice(openBrace, closeBrace + 1);
   const after = content.slice(closeBrace + 1);
   const coverLineStart = content.lastIndexOf('\n', coverMatch.index) + 1;
   const coverLinePrefix = content.slice(coverLineStart, coverMatch.index);
   const indent = /^[ \t]*$/.test(coverLinePrefix)
      ? `${coverLinePrefix}   `
      : `${/\n([ \t]+)\S/.exec(before)?.[1] ?? '   '}   `;

   const existing = /imageId\s*:\s*(['"`])(?:[^'"`]*)\1/.exec(body);
   const patched = existing
      ? body.replace(existing[0], `imageId: '${imageId}'`)
      : insertImageId(body, imageId, file, indent);

   return `${before}${patched}${after}`;
};

/**
 * 追加 imageId：插在 `mode: 'custom'` 之后。
 *
 * 分两种写法，目的是不重排用户原有的格式：
 *   · `cover: {` 与 `mode` 同一行 → 就地插在同一行
 *   · `mode` 自己占一行 → 换行后沿用同一缩进
 */
const insertImageId = (
   body: string,
   imageId: string,
   file: string,
   indent: string,
): string => {
   const modeMatch = /mode\s*:\s*(['"`])custom\1,?/.exec(body);
   if (!modeMatch) {
      throw new ConfigError(
         `在 ${file} 的 cover 对象里找不到 mode: 'custom'，无法写回 imageId`,
         { hint: '把上面的 imageId 手动填进 cover.imageId。' },
      );
   }
   const matched = modeMatch[0];
   const hasComma = /,\s*$/.test(matched);
   const linePrefix = body.slice(
      body.lastIndexOf('\n', modeMatch.index) + 1,
      modeMatch.index,
   );
   const inline = !/^[ \t]*$/.test(linePrefix);
   const separator = hasComma ? ' ' : ', ';
   const replacement = inline
      ? `${matched}${separator}imageId: '${imageId}',`
      : `${matched}${hasComma ? '' : ','}\n${indent}imageId: '${imageId}',`;
   return body.replace(matched, replacement);
};

/**
 * 从 `{` 出发找配对的 `}`，跳过字符串与模板串。
 *
 * 不处理正则字面量：配置文件里的 `cover` 对象几乎不可能出现正则，
 * 为此写一个 JS 词法分析器代价太大，而这里错了也只是抛错让用户手改。
 */
const findObjectEnd = (content: string, openBrace: number): number => {
   let depth = 0;
   let quote: string | null = null;
   for (let i = openBrace; i < content.length; i += 1) {
      const char = content[i]!;
      const previous = content[i - 1];
      if (quote) {
         if (char === quote && previous !== '\\') quote = null;
         continue;
      }
      if (char === "'" || char === '"' || char === '`') {
         quote = char;
         continue;
      }
      if (char === '{') depth += 1;
      if (char === '}') {
         depth -= 1;
         if (depth === 0) return i;
      }
   }
   return -1;
};
