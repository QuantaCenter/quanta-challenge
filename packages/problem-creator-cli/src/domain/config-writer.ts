import { ConfigError } from '../core/errors';
import type { CoverPalette } from './cover-palette';

// 一次写回的内容：imageId 必有，配色只在 --random 时给。
export interface CoverWrite {
   imageId: string;
   colors?: CoverPalette;
}

// 把生成好的封面（id + 可选配色）写回题目配置。 为什么要改文件而不是让用户手抄：一条 imageId 抄错一个字符，报错要等到线上 审计（"图片不存在"），而这正是 CLI 存在的意义。写完由调用方重新加载配置 校验，对不上就回滚。只做最小的文本手术：不引 AST，不重排用户原有的格式。
export const applyCoverUpdate = (
   content: string,
   update: CoverWrite,
   file: string,
): string => {
   if (file.endsWith('.json')) {
      return applyToJson(content, update);
   }
   return applyToSource(content, update, file);
};

const applyToJson = (content: string, update: CoverWrite): string => {
   let parsed: unknown;
   try {
      parsed = JSON.parse(content);
   } catch (error) {
      throw new ConfigError('题目配置不是合法 JSON，无法写回封面', {
         cause: error,
         hint: '手动把 imageId 与配色填进 cover。',
      });
   }
   const root = parsed as { cover?: Record<string, unknown> };
   const cover = root.cover;
   if (cover?.mode !== 'custom') {
      throw new ConfigError(
         '配置里没有 cover: { mode: "custom" }，无法写回封面',
         { hint: '先按文档把封面改成自定义模式，再重跑。' },
      );
   }
   cover.imageId = update.imageId;
   if (update.colors) {
      const previous =
         cover.generate && typeof cover.generate === 'object'
            ? (cover.generate as Record<string, unknown>)
            : {};
      const generate: Record<string, unknown> = { ...previous };
      generate.bg = update.colors.bg;
      generate.accent = update.colors.accent;
      generate.text = update.colors.text;
      if (update.colors.bgTo === undefined) {
         delete generate.bgTo;
      } else {
         generate.bgTo = update.colors.bgTo;
      }
      cover.generate = generate;
   }
   return `${JSON.stringify(parsed, null, 3)}\n`;
};

const applyToSource = (
   content: string,
   update: CoverWrite,
   file: string,
): string => {
   const coverMatch = /cover\s*:\s*\{/.exec(content);
   if (!coverMatch) {
      throw new ConfigError(
         `在 ${file} 里找不到 cover: { ... }，无法写回封面`,
         { hint: '把 imageId 与配色手动填进 cover。' },
      );
   }
   const openBrace = content.indexOf('{', coverMatch.index);
   const closeBrace = findObjectEnd(content, openBrace);
   if (closeBrace < 0) {
      throw new ConfigError(`在 ${file} 里无法解析 cover 对象（括号不配对）`, {
         hint: '把 imageId 与配色手动填进 cover。',
      });
   }

   const before = content.slice(0, openBrace);
   const after = content.slice(closeBrace + 1);
   const coverLineStart = content.lastIndexOf('\n', coverMatch.index) + 1;
   const coverLinePrefix = content.slice(coverLineStart, coverMatch.index);
   const indent = /^[ \t]*$/.test(coverLinePrefix)
      ? `${coverLinePrefix}   `
      : `${/\n([ \t]+)\S/.exec(before)?.[1] ?? '   '}   `;

   let body = content.slice(openBrace, closeBrace + 1);
   if (update.colors) {
      body = writeColors(body, update.colors, indent, file);
   }
   body = writeImageId(body, update.imageId, file, indent);
   return `${before}${body}${after}`;
};

// 把平台题目 id 写回配置：填了 problemId 才会追加新版本，否则每次上传都新建一道题。
export const applyProblemIdUpdate = (
   content: string,
   problemId: number,
   file: string,
): string => {
   if (file.endsWith('.json')) {
      return applyProblemIdToJson(content, problemId, file);
   }
   return applyProblemIdToSource(content, problemId, file);
};

const applyProblemIdToJson = (
   content: string,
   problemId: number,
   file: string,
): string => {
   let parsed: unknown;
   try {
      parsed = JSON.parse(content);
   } catch (error) {
      throw new ConfigError('题目配置不是合法 JSON，无法写回 problemId', {
         cause: error,
         hint: `手动把 problemId: ${problemId} 填进配置。`,
      });
   }
   if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ConfigError(`${file} 的顶层不是一个对象，无法写回 problemId`, {
         hint: `手动把 problemId: ${problemId} 填进配置。`,
      });
   }
   (parsed as Record<string, unknown>).problemId = problemId;
   return `${JSON.stringify(parsed, null, 3)}\n`;
};

const applyProblemIdToSource = (
   content: string,
   problemId: number,
   file: string,
): string => {
   // 已经写过就只改值，位置与格式都不动。
   const existing = /\bproblemId\s*:\s*\d+/.exec(content);
   if (existing) return content.replace(existing[0], `problemId: ${problemId}`);

   const openBrace = findConfigObjectStart(content);
   if (openBrace < 0) {
      throw new ConfigError(
         `在 ${file} 里找不到题目配置对象，无法写回 problemId`,
         { hint: `手动把 problemId: ${problemId} 填进配置。` },
      );
   }

   const after = content.slice(openBrace + 1);
   const firstNewline = after.indexOf('\n');
   const sameLine = after.slice(0, firstNewline < 0 ? undefined : firstNewline);
   // 与左括号同一行还有内容 -> 紧凑写法，就地插入；否则按下一行缩进另起一行。
   const insertion = /^[ \t]*$/.test(sameLine)
      ? `\n${/\n([ \t]+)\S/.exec(after)?.[1] ?? '   '}problemId: ${problemId},`
      : ` problemId: ${problemId},`;
   return `${content.slice(0, openBrace + 1)}${insertion}${after}`;
};

// 把本题的标签写回配置：tagIds 是数组，已有就整段替换，没有就按模板位置补上。
export const applyTagIdsUpdate = (
   content: string,
   tagIds: number[],
   file: string,
): string => {
   if (file.endsWith('.json')) {
      return applyTagIdsToJson(content, tagIds, file);
   }
   return applyTagIdsToSource(content, tagIds, file);
};

const applyTagIdsToJson = (
   content: string,
   tagIds: number[],
   file: string,
): string => {
   let parsed: unknown;
   try {
      parsed = JSON.parse(content);
   } catch (error) {
      throw new ConfigError('题目配置不是合法 JSON，无法写回 tagIds', {
         cause: error,
         hint: `手动把 tagIds: [${tagIds.join(', ')}] 填进配置。`,
      });
   }
   if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ConfigError(`${file} 的顶层不是一个对象，无法写回 tagIds`, {
         hint: `手动把 tagIds: [${tagIds.join(', ')}] 填进配置。`,
      });
   }
   (parsed as Record<string, unknown>).tagIds = tagIds;
   return `${JSON.stringify(parsed, null, 3)}\n`;
};

const applyTagIdsToSource = (
   content: string,
   tagIds: number[],
   file: string,
): string => {
   const literal = `[${tagIds.join(', ')}]`;
   // 已经写过就只改数组，位置与格式不动。
   const existing = /\btagIds\s*:\s*\[[^\]]*\]/.exec(content);
   if (existing) return content.replace(existing[0], `tagIds: ${literal}`);

   // 优先插在 difficulty / title 的下一行，与 init 模板的字段顺序一致。
   for (const anchor of ['difficulty', 'title']) {
      const match = new RegExp(
         `\\b${anchor}\\s*:\\s*(['"\`])[^'"\`]*\\1,?`,
      ).exec(content);
      if (!match) continue;
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const prefix = content.slice(lineStart, match.index);
      const indent = /^([ \t]*)$/.exec(prefix)?.[1] ?? '   ';
      const sep = /,\s*$/.test(match[0]) ? '' : ',';
      const insertAt = match.index + match[0].length;
      const next = /^[ \t]*$/.test(prefix)
         ? `${sep}\n${indent}tagIds: ${literal},`
         : `${sep} tagIds: ${literal},`;
      return `${content.slice(0, insertAt)}${next}${content.slice(insertAt)}`;
   }

   const openBrace = findConfigObjectStart(content);
   if (openBrace < 0) {
      throw new ConfigError(
         `在 ${file} 里找不到题目配置对象，无法写回 tagIds`,
         { hint: `手动把 tagIds: ${literal} 填进配置。` },
      );
   }
   const after = content.slice(openBrace + 1);
   const firstNewline = after.indexOf('\n');
   const sameLine = after.slice(0, firstNewline < 0 ? undefined : firstNewline);
   const insertion = /^[ \t]*$/.test(sameLine)
      ? `\n${/\n([ \t]+)\S/.exec(after)?.[1] ?? '   '}tagIds: ${literal},`
      : ` tagIds: ${literal},`;
   return `${content.slice(0, openBrace + 1)}${insertion}${after}`;
};

// 把快照镜像写回配置：null 表示明确不用（追加版本时会解绑平台上的快照镜像），所以照样写出 null 而不是删掉字段。
export const applySnapshotImageIdUpdate = (
   content: string,
   snapshotImageId: string | null,
   file: string,
): string => {
   const literal = snapshotImageId === null ? 'null' : `'${snapshotImageId}'`;
   const hint = `手动把 snapshotImageId: ${literal} 填进配置。`;
   if (file.endsWith('.json')) {
      let parsed: unknown;
      try {
         parsed = JSON.parse(content);
      } catch (error) {
         throw new ConfigError(
            '题目配置不是合法 JSON，无法写回 snapshotImageId',
            {
               cause: error,
               hint,
            },
         );
      }
      if (
         typeof parsed !== 'object' ||
         parsed === null ||
         Array.isArray(parsed)
      ) {
         throw new ConfigError(
            `${file} 的顶层不是一个对象，无法写回 snapshotImageId`,
            { hint },
         );
      }
      (parsed as Record<string, unknown>).snapshotImageId = snapshotImageId;
      return `${JSON.stringify(parsed, null, 3)}\n`;
   }

   const existing = /\bsnapshotImageId\s*:\s*(?:(['"`])[^'"`]*\1|null)/.exec(
      content,
   );
   if (existing) {
      return content.replace(existing[0], `snapshotImageId: ${literal}`);
   }

   // 紧跟在 tagIds 后面：两者都是 `qpc` 从平台挑选后写回的字段。
   const anchor = /\btagIds\s*:\s*\[[^\]]*\],?/.exec(content);
   if (anchor) {
      const lineStart = content.lastIndexOf('\n', anchor.index) + 1;
      const prefix = content.slice(lineStart, anchor.index);
      const hasComma = /,$/.test(anchor[0]);
      const sep = hasComma ? '' : ',';
      const insertAt = anchor.index + anchor[0].length;
      const next = /^[ \t]*$/.test(prefix)
         ? `${sep}\n${prefix}snapshotImageId: ${literal},`
         : `${sep} snapshotImageId: ${literal}${hasComma ? ',' : ''}`;
      return `${content.slice(0, insertAt)}${next}${content.slice(insertAt)}`;
   }

   const openBrace = findConfigObjectStart(content);
   if (openBrace < 0) {
      throw new ConfigError(
         `在 ${file} 里找不到题目配置对象，无法写回 snapshotImageId`,
         { hint },
      );
   }
   const after = content.slice(openBrace + 1);
   const firstNewline = after.indexOf('\n');
   const sameLine = after.slice(0, firstNewline < 0 ? undefined : firstNewline);
   const insertion = /^[ \t]*$/.test(sameLine)
      ? `\n${/\n([ \t]+)\S/.exec(after)?.[1] ?? '   '}snapshotImageId: ${literal},`
      : ` snapshotImageId: ${literal},`;
   return `${content.slice(0, openBrace + 1)}${insertion}${after}`;
};

// 定位配置对象（defineProblemConfig({ ... })）的 {，兼容直接 export default { ... } 的写法。
const findConfigObjectStart = (content: string): number => {
   const wrapper = /defineProblemConfig\s*\(\s*\{/.exec(content);
   if (wrapper) return wrapper.index + wrapper[0].lastIndexOf('{');
   const fallback = /export\s+default\s*\{/.exec(content);
   if (fallback) return fallback.index + fallback[0].lastIndexOf('{');
   return content.indexOf('{');
};

// 找到 cover.generate，就地改颜色；没有 generate 就在 cover 里补一个。
const writeColors = (
   body: string,
   colors: CoverPalette,
   coverIndent: string,
   file: string,
): string => {
   const generateMatch = /generate\s*:\s*\{/.exec(body);
   if (!generateMatch) {
      return insertGenerate(body, colors, coverIndent, file);
   }
   const openBrace = body.indexOf('{', generateMatch.index);
   const closeBrace = findObjectEnd(body, openBrace);
   if (closeBrace < 0) {
      throw new ConfigError(
         `在 ${file} 里无法解析 cover.generate（括号不配对）`,
         {
            hint: '把配色手动填进 cover.generate。',
         },
      );
   }
   const generatePrefix = body.slice(openBrace, closeBrace + 1);
   const generateIndent = detectIndent(generatePrefix) ?? `${coverIndent}   `;
   let generateBody = generatePrefix;
   generateBody = upsertColor(generateBody, 'bg', colors.bg, generateIndent);
   generateBody = upsertColor(
      generateBody,
      'bgTo',
      colors.bgTo,
      generateIndent,
   );
   generateBody = upsertColor(
      generateBody,
      'accent',
      colors.accent,
      generateIndent,
   );
   generateBody = upsertColor(
      generateBody,
      'text',
      colors.text,
      generateIndent,
   );
   return body.slice(0, openBrace) + generateBody + body.slice(closeBrace + 1);
};

// 没有 generate 时补一个：插在 mode: 'custom' 之后，风格与 insertImageId 一致。
const insertGenerate = (
   body: string,
   colors: CoverPalette,
   indent: string,
   file: string,
): string => {
   const modeMatch = /mode\s*:\s*(['"`])custom\1,?/.exec(body);
   if (!modeMatch) {
      throw new ConfigError(
         `在 ${file} 的 cover 对象里找不到 mode: 'custom'，无法写入 generate`,
         { hint: '把配色手动填进 cover.generate。' },
      );
   }
   const literal = formatColors(colors);
   const matched = modeMatch[0];
   const hasComma = /,\s*$/.test(matched);
   const linePrefix = body.slice(
      body.lastIndexOf('\n', modeMatch.index) + 1,
      modeMatch.index,
   );
   const inline = !/^[ \t]*$/.test(linePrefix);
   const separator = hasComma ? ' ' : ', ';
   const replacement = inline
      ? `${matched}${separator}generate: { ${literal} },`
      : `${matched}${hasComma ? '' : ','}\n${indent}generate: { ${literal} },`;
   return body.replace(matched, replacement);
};

const formatColors = (colors: CoverPalette): string => {
   const parts = [
      `bg: '${colors.bg}'`,
      colors.bgTo === undefined ? undefined : `bgTo: '${colors.bgTo}'`,
      `accent: '${colors.accent}'`,
      `text: '${colors.text}'`,
   ].filter((part): part is string => part !== undefined);
   return parts.join(', ');
};

const writeImageId = (
   body: string,
   imageId: string,
   file: string,
   indent: string,
): string => {
   const existing = /imageId\s*:\s*(['"`])(?:[^'"`]*)\1/.exec(body);
   return existing
      ? body.replace(existing[0], `imageId: '${imageId}'`)
      : insertImageId(body, imageId, file, indent);
};

// 追加 imageId：插在 mode: 'custom' 之后。 分两种写法，目的是不重排用户原有格式： · cover 与 mode 同一行 -> 就地插在同一行 · mode 自己占一行 -> 换行后沿用同一缩进
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
         { hint: '把 imageId 手动填进 cover.imageId。' },
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

// key: 'value' 的正则片段，group 1 是引号，供 \1 配对使用。
const keyPattern = (key: string): string =>
   `\\b${key}\\s*:\\s*(['"\`])(?:[^'"\`]*)\\1`;

const detectIndent = (body: string): string | undefined =>
   /\n([ \t]+)\S/.exec(body)?.[1];

// 有则改写，值为 undefined 则删除，没有则插入。
const upsertColor = (
   body: string,
   key: string,
   value: string | undefined,
   indent: string,
): string => {
   const existing = new RegExp(keyPattern(key)).exec(body);
   if (value === undefined) {
      return existing ? removeKey(body, key) : body;
   }
   if (existing) {
      return body.replace(existing[0], `${key}: '${value}'`);
   }
   return insertKey(body, key, value, indent);
};

const insertKey = (
   body: string,
   key: string,
   value: string,
   indent: string,
): string => {
   const inner = body.slice(1, -1);
   if (inner.trim() === '') return `{ ${key}: '${value}' }`;
   if (!inner.includes('\n')) return body.replace('{', `{ ${key}: '${value}',`);
   const entryIndent = detectIndent(body) ?? indent;
   return body.replace('{', `{\n${entryIndent}${key}: '${value}',`);
};

// 删除一个键，连带处理逗号，避免留下 `{ , }` 这种坏字面量。
const removeKey = (body: string, key: string): string => {
   const pattern = keyPattern(key);
   const trailing = new RegExp(`${pattern}\\s*,\\s*`);
   if (trailing.test(body)) return body.replace(trailing, '');
   const leading = new RegExp(`\\s*,\\s*${pattern}`);
   if (leading.test(body)) return body.replace(leading, '');
   return body.replace(new RegExp(pattern), '');
};

// 从 `{` 出发找配对的 `}`，跳过字符串与模板串。 不处理正则字面量：配置文件里的 cover 对象几乎不可能出现正则，为此写一个 JS 词法分析器代价太大，而这里错了也只是抛错让用户手改。
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
