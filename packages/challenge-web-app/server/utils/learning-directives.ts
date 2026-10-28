export interface LearningProblemDirective {
   baseId: number;
   sort: number;
}

export interface LearningPlaygroundDirective {
   id: string;
   sort: number;
}

export interface LearningArticleDirectives {
   problems: LearningProblemDirective[];
   playgrounds: LearningPlaygroundDirective[];
}

const directivePattern =
   /<Problem\s+baseId=\{\s*(\d+)\s*\}\s*\/>|<Playground\s+id=(["'])([^"']+)\2\s*\/>/g;

/**
 * 解析文章正文中的受控指令。解析器不访问数据库，并对同类重复引用保留第一次出现的位置。
 */
export function parseLearningArticleDirectives(
   source: string,
): LearningArticleDirectives {
   const problems: LearningProblemDirective[] = [];
   const playgrounds: LearningPlaygroundDirective[] = [];
   const seenProblems = new Set<number>();
   const seenPlaygrounds = new Set<string>();

   for (const match of source.matchAll(directivePattern)) {
      if (match[1] !== undefined) {
         const baseId = Number(match[1]);
         if (!seenProblems.has(baseId)) {
            seenProblems.add(baseId);
            problems.push({ baseId, sort: problems.length });
         }
         continue;
      }

      const id = match[3];
      if (id && !seenPlaygrounds.has(id)) {
         seenPlaygrounds.add(id);
         playgrounds.push({ id, sort: playgrounds.length });
      }
   }

   return { problems, playgrounds };
}

export function parseProblemDirectives(source: string) {
   return parseLearningArticleDirectives(source).problems;
}

export function parsePlaygroundDirectives(source: string) {
   return parseLearningArticleDirectives(source).playgrounds;
}
