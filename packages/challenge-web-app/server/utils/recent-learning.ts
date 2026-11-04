type RecentLearning = { id: string; finished: boolean; lastLearnedAt: Date };

export function selectRecentLearning<T extends RecentLearning>(items: T[]): T[] {
   return [...items].sort((a, b) =>
      Number(a.finished) - Number(b.finished)
      || b.lastLearnedAt.getTime() - a.lastLearnedAt.getTime()
      || a.id.localeCompare(b.id),
   ).slice(0, 5);
}
