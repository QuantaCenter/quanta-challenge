/**
 * 搜索结果高亮工具：将文本按关键词切分，命中部分标记为 hit
 */

export interface HighlightSegment {
   text: string;
   hit: boolean;
}

const escapeRegExp = (str: string) =>
   str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 按搜索关键词（大小写不敏感）切分文本，用于渲染 <mark> 高亮
 */
export function highlightSegments(
   text: string,
   query: string
): HighlightSegment[] {
   const trimmed = query.trim();
   if (!text || !trimmed) return [{ text, hit: false }];

   const parts = text.split(new RegExp(`(${escapeRegExp(trimmed)})`, 'gi'));

   return parts
      .map((part, index) => ({ text: part, hit: index % 2 === 1 }))
      .filter((segment) => segment.text.length > 0);
}
