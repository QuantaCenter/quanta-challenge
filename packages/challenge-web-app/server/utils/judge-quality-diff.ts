import { createTwoFilesPatch } from 'diff';

export type ReviewContent = {
   title: string;
   detail: string;
   script: string;
};

/** Return a bounded unified diff, or no context if the comparison cannot be completed. */
export function createReviewDiff(previous: ReviewContent, current: ReviewContent): string | undefined {
   const sections: string[] = [];

   for (const field of ['title', 'detail', 'script'] as const) {
      if (previous[field] === current[field]) continue;
      const patch = createTwoFilesPatch(
         `previous/${field}`,
         `current/${field}`,
         previous[field],
         current[field],
         undefined,
         undefined,
         { context: 3, timeout: 500 },
      );
      if (!patch) return undefined;
      sections.push(patch);
   }

   const result = sections.join('\n');
   return result && Buffer.byteLength(result, 'utf8') <= 80_000 ? result : undefined;
}
