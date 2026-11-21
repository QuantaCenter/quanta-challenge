import type { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';

export const assertProblemCloudFunctionAvailable = async (
   db: Pick<Prisma.TransactionClient, 'cloudFunction'>,
   name: string | null | undefined,
): Promise<void> => {
   if (!name) return;

   const fn = await db.cloudFunction.findUnique({
      where: { name },
      select: { enabled: true, activeVersionId: true },
   });
   if (!fn?.enabled || !fn.activeVersionId) {
      throw new TRPCError({
         code: 'PRECONDITION_FAILED',
         message: `云函数「${name}」不可用，请确认函数已发布并启用`,
      });
   }
};
