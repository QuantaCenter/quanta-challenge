import z from 'zod';
import prisma from '~~/lib/prisma';
import { publicProcedure, router } from '../../trpc';

// 获取标签：默认只返回题目标签（题目筛选、题目发布、题目标签管理）；实验室标签见 admin.tag.labList
const listAllTagsProcedure = publicProcedure
   .input(z.object({ scope: z.enum(['problem', 'lab']).default('problem') }).optional())
   .query(async ({ input }) => {
      const tags = await prisma.tags.findMany({
         where: { scope: input?.scope ?? 'problem' },
         include: {
            image: {
               select: {
                  name: true,
               },
            },
         },
      });
      return tags.map((tag) => ({
         ...tag,
         url: tag.image ? `/api/static/${tag.image.name}` : null,
      }));
   });

export const tagRouter = router({
   list: listAllTagsProcedure,
});
