export interface LearningProgress {
   percent: number;
   completed: boolean;
   completedCount: number;
   totalCount: number;
}

export const calculateLearningProgress = (
   completedCount: number,
   totalCount: number,
): LearningProgress => {
   const safeTotal = Math.max(0, totalCount);
   const safeCompleted = Math.min(Math.max(0, completedCount), safeTotal);
   return {
      percent:
         safeTotal === 0 ? 0 : Math.round((safeCompleted / safeTotal) * 100),
      completed: safeTotal > 0 && safeCompleted === safeTotal,
      completedCount: safeCompleted,
      totalCount: safeTotal,
   };
};

export const uniqueLearningProblemIds = (...groups: Iterable<number>[]) =>
   new Set(groups.flatMap((group) => [...group]));
