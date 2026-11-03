import { TRPCError } from '@trpc/server';
import prisma from '~~/lib/prisma';
import { buildLearningOutline } from '../../utils/learning-progress';

export async function loadLearningCourse(userId: string, courseId: string) {
   const enrollment = await prisma.courseEnrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: {
         id: true,
         enrolledAt: true,
         progress: { select: { sectionId: true, completedAt: true } },
         course: {
            select: {
               id: true, title: true, status: true,
               chapters: {
                  orderBy: { position: 'asc' },
                  select: {
                     id: true, title: true, introduction: true,
                     stages: {
                        orderBy: { position: 'asc' },
                        select: {
                           sections: {
                              orderBy: { position: 'asc' },
                              select: { id: true, title: true, type: true },
                           },
                        },
                     },
                  },
               },
            },
         },
      },
   });
   if (!enrollment) throw new TRPCError({ code: 'FORBIDDEN', message: '请先获取该课程' });
   if (enrollment.course.status !== 'published') {
      throw new TRPCError({ code: 'NOT_FOUND', message: '课程不存在或已下架' });
   }
   return {
      enrollmentId: enrollment.id,
      id: enrollment.course.id,
      title: enrollment.course.title,
      chapters: buildLearningOutline(enrollment.course.chapters, enrollment.progress, enrollment.enrolledAt),
   };
}

export async function requireLearningSection(userId: string, courseId: string, sectionId: string) {
   const course = await loadLearningCourse(userId, courseId);
   const section = course.chapters.flatMap(chapter => chapter.sections).find(item => item.id === sectionId);
   if (!section) throw new TRPCError({ code: 'NOT_FOUND', message: '该节不属于当前课程' });
   if (!section.unlocked) throw new TRPCError({ code: 'FORBIDDEN', message: '请先完成前面的学习内容' });
   return { course, section };
}
