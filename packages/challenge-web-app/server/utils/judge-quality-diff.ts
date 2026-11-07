import { createTwoFilesPatch } from 'diff';

/** Return a bounded unified diff, or no context if the comparison cannot be completed. */
export function createReviewDiff(previous: string, current: string): string | undefined {
   if (previous === current) return undefined;

   const patch = createTwoFilesPatch(
      'previous/script',
      'current/script',
      previous,
      current,
      undefined,
      undefined,
      { context: 3, timeout: 500 },
   );
   return patch && Buffer.byteLength(patch, 'utf8') <= 80_000 ? patch : undefined;
}
