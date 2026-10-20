import {
   completeOnboarding,
   getLoginContext,
   startAuthorization,
} from '../../../services/quanta-oauth/actions';
import {
   assertSameOrigin,
   guardedRpc,
   setOAuthHeaders,
} from '../../../services/quanta-oauth/http';
import { onboardingInputSchema } from '../../../services/quanta-oauth/inputs';
import { bootstrap } from '../../../services/quanta-oauth/session';
import { publicProcedure, router } from '../../trpc';

// These procedures intentionally work before Challenge authentication exists.
// Each action validates its own browser-bound OAuth proof instead of ctx.user.
const quantaProcedure = publicProcedure.use(async ({ ctx, next }) => {
   setOAuthHeaders(ctx.event);
   return next();
});

export const quantaRouter = router({
   start: quantaProcedure.mutation(({ ctx }) =>
      guardedRpc(ctx.event, () => startAuthorization(ctx.event)),
   ),

   context: quantaProcedure.query(({ ctx }) =>
      guardedRpc(ctx.event, () => getLoginContext(ctx.event)),
   ),

   onboarding: quantaProcedure
      .input(onboardingInputSchema)
      .mutation(({ ctx, input }) =>
         guardedRpc(ctx.event, () => completeOnboarding(ctx.event, input)),
      ),

   // This consumes a one-time handoff, so it is a mutation rather than a query.
   session: quantaProcedure.mutation(({ ctx }) =>
      guardedRpc(ctx.event, () => {
         assertSameOrigin(ctx.event);
         return bootstrap(ctx.event);
      }),
   ),
});
