import { router } from '../../trpc';
import { achievementRouter } from './achievement';
import { cloudFunctionAdminRouter } from './cloud-function';
import { imageRouter } from './image';
import { problemRouter } from './problem';
import { submissionRouter } from './submission';
import { tagRouter } from './tag';
import { userRouter } from './user';

export const adminRouter = router({
  problem: problemRouter,
  submission: submissionRouter,
   tag: tagRouter,
   image: imageRouter,
   achievement: achievementRouter,
   user: userRouter,
   cloudFunction: cloudFunctionAdminRouter,
});
