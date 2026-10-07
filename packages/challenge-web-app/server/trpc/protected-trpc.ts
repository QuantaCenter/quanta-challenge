import { injectInfo } from './middlewares/inject-info';
import { requireAuth } from './middlewares/require-auth';
import { requireRole } from './middlewares/require-role';
import { trackActive } from './middlewares/track-active';
import { publicProcedure } from './trpc';

export const protectedProcedure = publicProcedure
   .use(requireAuth)
   .use(trackActive)
   .use(injectInfo);

export const protectedAdminProcedure = publicProcedure
   .use(requireRole('ADMIN'))
   .use(trackActive)
   .use(injectInfo);

export const protectedSuperAdminProcedure = publicProcedure
   .use(requireRole('SUPER_ADMIN'))
   .use(trackActive)
   .use(injectInfo);
