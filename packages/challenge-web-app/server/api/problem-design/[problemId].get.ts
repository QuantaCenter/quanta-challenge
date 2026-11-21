import { createError, defineEventHandler, getRouterParam, setResponseHeader } from 'h3';
import type { ProblemDesignDocument } from '@challenge/judge-machine-agent/schemas';
import prisma from '~~/lib/prisma';
import { requireEventUser } from '../../utils/event-auth';

export default defineEventHandler(async (event) => {
   const { userId } = requireEventUser(event, { csrf: false });
   setResponseHeader(event, 'Cache-Control', 'private, no-store');

   const param = getRouterParam(event, 'problemId');
   const problemId = Number(param);
   if (!param || !/^\d+$/.test(param) || problemId < 1 || problemId > 2_147_483_647) {
      throw createError({ statusCode: 404, statusMessage: 'Design not found' });
   }

   const design = await prisma.problemDesign.findFirst({
      where: {
         problemId,
         status: 'ready',
         problem: {
            status: 'published',
            isDeprecated: false,
            BaseProblem: { OR: [{ currentPid: problemId }, { currentPid: null }] },
         },
      },
      select: { document: true, problem: { select: { title: true } } },
   });
   if (!design?.document) {
      throw createError({ statusCode: 404, statusMessage: 'Design not found' });
   }

   const viewer = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, displayName: true, avatar: { select: { name: true } } },
   });
   return {
      document: design.document as unknown as ProblemDesignDocument,
      title: design.problem.title,
      viewer: viewer && {
         name: viewer.displayName || viewer.name,
         avatarUrl: viewer.avatar ? `/api/static/${encodeURIComponent(viewer.avatar.name)}` : undefined,
      },
   };
});
