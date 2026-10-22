import { router } from '../../trpc';
import { achievementRouter } from './achievement';
import { cloudFunctionAdminRouter } from './cloud-function';
import { imageBuildRouter } from './image-build';
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
   imageBuild: imageBuildRouter,
   achievement: achievementRouter,
   user: userRouter,
   cloudFunction: cloudFunctionAdminRouter,
});
