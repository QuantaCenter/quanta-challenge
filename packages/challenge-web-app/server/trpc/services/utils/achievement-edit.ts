import z from 'zod';

export const UpdateAchievementSchema = z.object({
   id: z.number().int().positive(),
   name: z.string().trim().min(1).max(50),
   description: z.string().trim().min(1).max(255),
   imageId: z.uuid(),
   preAchievements: z.array(z.number().int().positive()).refine(
      (ids) => new Set(ids).size === ids.length,
      '前置成就不能重复',
   ),
}).strict();

export const canEditAchievement = (
   user: { userId: string; role: string },
   authorId: string | null,
) => user.role === 'SUPER_ADMIN' || (user.role === 'ADMIN' && authorId === user.userId);

export const hasAchievementCycle = (
   id: number,
   prerequisites: number[],
   edges: { achievementId: number; preAchievementId: number }[],
) => {
   const graph = new Map<number, number[]>();
   for (const edge of edges) {
      if (edge.achievementId === id) continue;
      const deps = graph.get(edge.achievementId) ?? [];
      deps.push(edge.preAchievementId);
      graph.set(edge.achievementId, deps);
   }
   const pending = [...prerequisites];
   const visited = new Set<number>();
   while (pending.length) {
      const current = pending.pop()!;
      if (current === id) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(graph.get(current) ?? []));
   }
   return false;
};
