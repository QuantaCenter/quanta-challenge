import type { editor, languages } from 'monaco-editor';
import type { ProjectMatch, ProjectSearchResult } from './project-search';

export const SEARCH_RESULTS_LANGUAGE = 'quanta-search-results';

export interface SearchResultRow {
   path: string;
   sourceLine: number;
   hits: { match: ProjectMatch; column: number }[];
}

export interface SearchResultDocument {
   text: string;
   headers: Map<number, string>;
   matches: Map<number, { path: string; match: ProjectMatch }>;
   rows: Map<number, SearchResultRow>;
   folds: { start: number; end: number }[];
}

/** Keep source context around hits; merge overlapping and adjacent windows. */
export const buildSearchResultDocument = (groups: ProjectSearchResult['groups']): SearchResultDocument => {
   const lines: string[] = [];
   const document: SearchResultDocument = {
      text: '', headers: new Map(), matches: new Map(), rows: new Map(), folds: [],
   };
   for (const group of groups) {
      if (!group.matches.length) continue;
      const start = lines.length + 1;
      lines.push(`   ${group.path.replace(/^\/project\//, '')}  (${group.matches.length} 处匹配)`);
      document.headers.set(start, group.path);
      if (group.source !== undefined) {
         const source = group.source.split(/\r?\n/);
         const hits = new Map<number, ProjectMatch[]>();
         for (const match of group.matches) {
            if (!hits.has(match.line)) hits.set(match.line, []);
            hits.get(match.line)!.push(match);
         }
         let previous = 0;
         for (const line of [...hits.keys()].sort((a, b) => a - b)) {
            const from = Math.max(1, line - 2, previous + 1);
            const to = Math.min(source.length, line + 2);
            if (from > to) continue;
            if (previous && from > previous + 1) lines.push('⋯');
            for (let sourceLine = from; sourceLine <= to; sourceLine++) {
               lines.push(source[sourceLine - 1]);
               const matches = hits.get(sourceLine) ?? [];
               document.rows.set(lines.length, {
                  path: group.path,
                  sourceLine,
                  hits: matches.map((match) => ({ match, column: match.column })),
               });
               if (matches.length) document.matches.set(lines.length, { path: group.path, match: matches[0] });
            }
            previous = to;
         }
      } else {
         for (const match of group.matches) {
            lines.push(`${match.before}${match.match}${match.after}`);
            document.matches.set(lines.length, { path: group.path, match });
            document.rows.set(lines.length, {
               path: group.path, sourceLine: match.line,
               hits: [{ match, column: match.before.length + 1 }],
            });
         }
      }
      document.folds.push({ start, end: lines.length });
      lines.push('');
   }
   document.text = lines.join('\n');
   return document;
};

const documents = new WeakMap<editor.ITextModel, SearchResultDocument>();

class ResultTokenState implements languages.IState {
   readonly line: number;
   readonly revision: number;
   constructor(line: number, revision: number) { this.line = line; this.revision = revision; }
   clone() { return new ResultTokenState(this.line, this.revision); }
   equals(other: languages.IState) {
      return other instanceof ResultTokenState && other.line === this.line && other.revision === this.revision;
   }
}

/** Isolate token caches between result editors and projects. */
export const registerSearchResultFolding = (
   monaco: typeof import('monaco-editor'),
   languageId: string,
   getTokens: (line: number) => languages.IToken[],
) => {
   monaco.languages.register({ id: languageId });
   const folding = monaco.languages.registerFoldingRangeProvider(languageId, {
      provideFoldingRanges: (model) => documents.get(model)?.folds ?? [],
   });
   let revision = 0;
   let tokens: ReturnType<typeof monaco.languages.setTokensProvider> | undefined;
   const refreshTokens = () => {
      tokens?.dispose();
      revision++;
      tokens = monaco.languages.setTokensProvider(languageId, {
         getInitialState: () => new ResultTokenState(1, revision),
         tokenize: (_text, state) => {
            const current = state as ResultTokenState;
            return { tokens: getTokens(current.line), endState: new ResultTokenState(current.line + 1, revision) };
         },
      });
   };
   refreshTokens();
   return { refreshTokens, dispose: () => { tokens?.dispose(); folding.dispose(); } };
};

export const getSearchSourceLanguage = (monaco: typeof import('monaco-editor'), path: string) => {
   const name = path.split('/').at(-1)!;
   const registered = monaco.languages.getLanguages();
   const fallback: Record<string, string> = { '.vue': 'vue', '.sass': 'sass', '.styl': 'stylus', '.pcss': 'postcss' };
   const exact = registered.find((language) => language.filenames?.includes(name));
   if (exact) return exact.id;
   const extension = Object.keys(fallback).find((suffix) => name.endsWith(suffix));
   if (extension && registered.some((language) => language.id === fallback[extension])) return fallback[extension];
   return registered.flatMap((language) => (language.extensions ?? []).map((suffix) => ({ suffix, id: language.id })))
      .filter(({ suffix }) => name.endsWith(suffix))
      .sort((a, b) => b.suffix.length - a.suffix.length)[0]?.id ?? 'plaintext';
};

export const setSearchResultDocument = (model: editor.ITextModel, document: SearchResultDocument) => {
   documents.set(model, document);
};
