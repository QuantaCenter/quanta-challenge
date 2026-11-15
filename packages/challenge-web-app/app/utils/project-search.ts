import ignore from 'ignore';

/** Project search operates on the live filesystem, including files not opened in Monaco. */
export interface ProjectSearchFs {
   readdir(path: string, options: { withFileTypes: true }): Promise<{
      name: string;
      isDirectory(): boolean;
      isFile(): boolean;
   }[]>;
   readFile(path: string): Promise<Uint8Array>;
}

export interface ProjectSearchPreferences {
   ignoreCase?: boolean;
   respectGitignore?: boolean;
   excludePatterns?: string;
}

export const listProjectFiles = async (
   fs: ProjectSearchFs,
   signal?: AbortSignal,
   options: ProjectSearchPreferences = {},
) => {
   const paths: string[] = [];
   signal?.throwIfAborted();
   const rootEntries = await fs.readdir('/project', { withFileTypes: true });
   signal?.throwIfAborted();
   const gitignore = ignore({ ignorecase: false });
   const additional = ignore({ ignorecase: false }).add(options.excludePatterns ?? '');
   if (options.respectGitignore !== false && rootEntries.some((entry) => entry.name === '.gitignore' && entry.isFile())) {
      const content = await readProjectText(fs, '/project/.gitignore');
      if (content !== null) gitignore.add(content);
   }
   const walk = async (directory: string) => {
      signal?.throwIfAborted();
      const entries = directory === '/project'
         ? rootEntries
         : await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
         signal?.throwIfAborted();
         const path = `${directory}/${entry.name}`;
         // Git metadata is never part of the searchable working tree.
         if (entry.name === '.git' && entry.isDirectory()) continue;
         const relative = path.slice('/project/'.length) + (entry.isDirectory() ? '/' : '');
         if (gitignore.ignores(relative) || additional.ignores(relative)) continue;
         if (entry.isDirectory()) {
            await walk(path);
         } else if (entry.isFile()) {
            paths.push(path);
         }
      }
   };
   await walk('/project');
   return paths.sort();
};

export const filterProjectFiles = (paths: string[], query: string) => {
   const needle = query.trim().toLowerCase().replaceAll('\\', '/');
   const score = (path: string) => {
      const relative = path.replace(/^\/project\//, '').toLowerCase();
      const basename = relative.split('/').at(-1)!;
      if (!needle) return 0;
      if (basename === needle) return 0;
      if (basename.startsWith(needle)) return 1;
      if (basename.includes(needle)) return 2;
      if (relative.includes(needle)) return 3;
      let index = 0;
      for (const character of relative) {
         if (character === needle[index]) index++;
      }
      return index === needle.length ? 4 : -1;
   };
   return paths.map((path) => ({ path, score: score(path) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
      .map((item) => item.path);
};

export interface ProjectMatch {
   line: number;
   column: number;
   length: number;
   before: string;
   match: string;
   after: string;
}

/** Literal search; columns are UTF-16 offsets, as used by Monaco. */
export const MAX_PROJECT_SEARCH_MATCHES = 100_000;

export const findProjectMatches = (
   content: string,
   query: string,
   limit = MAX_PROJECT_SEARCH_MATCHES,
   ignoreCase = true,
) => {
   const matches: ProjectMatch[] = [];
   if (!query || limit <= 0) return matches;
   const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ignoreCase ? 'gi' : 'g');
   const lines = content.split(/\r?\n/);
   for (let line = 0; line < lines.length && matches.length < limit; line++) {
      const text = lines[line];
      for (const hit of text.matchAll(expression)) {
         const start = hit.index!;
         const end = start + hit[0].length;
         matches.push({
            line: line + 1,
            column: start + 1,
            length: hit[0].length,
            before: `${start > 100 ? '…' : ''}${text.slice(Math.max(0, start - 100), start)}`,
            match: hit[0],
            after: `${text.slice(end, end + 150)}${text.length > end + 150 ? '…' : ''}`,
         });
         if (matches.length >= limit) break;
      }
   }
   return matches;
};

export const readProjectText = async (fs: ProjectSearchFs, path: string) => {
   const bytes = await fs.readFile(path);
   if (bytes.includes(0)) return null;
   try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
   } catch {
      return null;
   }
};

export interface ProjectSearchResult {
   groups: { path: string; matches: ProjectMatch[]; source?: string }[];
   truncated: boolean;
   unreadable: number;
}

export interface ProjectReplaceResult {
   matches: number;
   files: number;
   skipped: number;
   failed: number;
}

export interface ProjectSearchCursor {
   path: string;
   line: number;
   column: number;
}

/** Continue in result order, wrapping after the last match. */
export const findNextProjectSearchMatch = (
   result: ProjectSearchResult,
   cursor?: ProjectSearchCursor,
) => {
   for (const group of result.groups) {
      if (cursor && group.path < cursor.path) continue;
      const match = group.matches.find((match) => !cursor || group.path > cursor.path ||
         match.line > cursor.line || (match.line === cursor.line && match.column >= cursor.column));
      if (match) return { group, match };
   }
   const group = result.groups.find((group) => group.matches.length);
   return group ? { group, match: group.matches[0]! } : undefined;
};

/** Replace the displayed snapshot only; changed files must be searched again. */
export const replaceProjectSearchResults = async (
   result: ProjectSearchResult,
   replacement: string,
   io: {
      readFile: (path: string) => Promise<string | null>;
      writeFile: (path: string, content: string) => Promise<void>;
   },
): Promise<ProjectReplaceResult> => {
   if (result.truncated) throw new Error('请缩小搜索范围后再全部替换');
   const summary: ProjectReplaceResult = { matches: 0, files: 0, skipped: 0, failed: 0 };
   for (const group of result.groups) {
      try {
         const source = await io.readFile(group.path);
         if (source === null || group.source === undefined || source !== group.source) {
            summary.skipped++;
            continue;
         }
         const lineStarts = [0];
         for (const hit of source.matchAll(/\n/g)) lineStarts.push(hit.index! + 1);
         const edits = group.matches.map((match) => ({
            start: lineStarts[match.line - 1]! + match.column - 1,
            match,
         })).sort((a, b) => a.start - b.start);
         const chunks: string[] = [];
         let cursor = 0;
         for (const { start, match } of edits) {
            chunks.push(source.slice(cursor, start), replacement);
            cursor = start + match.length;
         }
         chunks.push(source.slice(cursor));
         const content = chunks.join('');
         if (content === source) continue;
         await io.writeFile(group.path, content);
         summary.matches += edits.length;
         summary.files++;
      } catch {
         summary.failed++;
      }
   }
   return summary;
};

export const searchProjectFiles = async (
   fs: ProjectSearchFs,
   query: string,
   options: ProjectSearchPreferences & {
      signal?: AbortSignal;
      getEditedContent?: (path: string) => string | undefined;
      limit?: number;
   } = {},
): Promise<ProjectSearchResult> => {
   const result: ProjectSearchResult = { groups: [], truncated: false, unreadable: 0 };
   if (!query) return result;
   const limit = options.limit ?? MAX_PROJECT_SEARCH_MATCHES;
   const paths = await listProjectFiles(fs, options.signal, options);
   let count = 0;
   for (let offset = 0; offset < paths.length; offset += 4) {
      options.signal?.throwIfAborted();
      const files = await Promise.all(paths.slice(offset, offset + 4).map(async (path) => {
         try {
            return { path, content: options.getEditedContent?.(path) ?? await readProjectText(fs, path) };
         } catch (error) {
            options.signal?.throwIfAborted();
            result.unreadable++;
            return { path, content: null };
         }
      }));
      options.signal?.throwIfAborted();
      for (const { path, content } of files) {
         if (content === null) continue;
         const matches = findProjectMatches(content, query, limit - count + 1, options.ignoreCase !== false);
         if (!matches.length) continue;
         if (count + matches.length > limit) {
            result.truncated = true;
            matches.length = limit - count;
         }
         if (matches.length) result.groups.push({ path, matches, source: content });
         count += matches.length;
         if (result.truncated) return result;
      }
      // Yield between batches so typing and cancellation stay responsive.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
   }
   return result;
};
