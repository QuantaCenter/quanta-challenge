import { router } from '../../trpc';
import { achievementRouter } from './achievement';
import { appealAdminRouter } from './appeal';
import { cloudFunctionAdminRouter } from './cloud-function';
import { courseAdminRouter } from './course';
import { imageBuildRouter } from './image-build';
import { imageRouter } from './image';
import { workshopTemplateAdminRouter } from './workshop-template';
import { workshopCategoryAdminRouter } from './workshop-category';
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
   imageBuild: imageBuildRouter,
   workshopTemplate: workshopTemplateAdminRouter,
   workshopCategory: workshopCategoryAdminRouter,
   achievement: achievementRouter,
   user: userRouter,
   cloudFunction: cloudFunctionAdminRouter,
   course: courseAdminRouter,
   notification: notificationAdminRouter,
   appeal: appealAdminRouter,
   scheduledTask: scheduledTaskAdminRouter,
});
