import { router } from '../../trpc';
import { achievementRouter } from './achievement';
import { appealAdminRouter } from './appeal';
import { cloudFunctionAdminRouter } from './cloud-function';
import { imageBuildRouter } from './image-build';
import { imageRouter } from './image';
import { learningAdminRouter } from './learning';
import { notificationAdminRouter } from './notification';
import { problemRouter } from './problem';
import { scheduledTaskAdminRouter } from './scheduled-task';
import { submissionRouter } from './submission';
import { tagRouter } from './tag';
import { userRouter } from './user';

export const adminRouter = router({
  problem: problemRouter,
  submission: submissionRouter,
   tag: tagRouter,
   image: imageRouter,
   learning: learningAdminRouter,
   imageBuild: imageBuildRouter,
   achievement: achievementRouter,
   user: userRouter,
   cloudFunction: cloudFunctionAdminRouter,
   notification: notificationAdminRouter,
   appeal: appealAdminRouter,
   scheduledTask: scheduledTaskAdminRouter,
});
