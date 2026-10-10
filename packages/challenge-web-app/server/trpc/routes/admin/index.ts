import { router } from '../../trpc';
import { achievementRouter } from './achievement';
import { cloudFunctionAdminRouter } from './cloud-function';
import { imageRouter } from './image';
import { learningAdminRouter } from './learning';
import { problemRouter } from './problem';
import { tagRouter } from './tag';
import { userRouter } from './user';

export const adminRouter = router({
   problem: problemRouter,
   tag: tagRouter,
   image: imageRouter,
   achievement: achievementRouter,
   user: userRouter,
   cloudFunction: cloudFunctionAdminRouter,
   learning: learningAdminRouter,
});
