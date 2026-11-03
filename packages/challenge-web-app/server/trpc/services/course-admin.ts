import type { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';

type Tx = Prisma.TransactionClient;

export type CourseOutlineKind = 'chapter' | 'stage' | 'section';

interface IPositioned {
   id: string;
   parentId: string;
   position: number;
}

/** 三层结构的排序字段统一封装，父级外键名不同但操作方式一致。 */
const positionOps = (tx: Tx, kind: CourseOutlineKind) => {
   switch (kind) {
      case 'chapter':
         return {
            find: async (id: string): Promise<IPositioned | null> => {
               const row = await tx.courseChapter.findUnique({
                  where: { id },
                  select: { id: true, courseId: true, position: true },
               });
               return row && { id: row.id, parentId: row.courseId, position: row.position };
            },
            siblings: async (parentId: string) =>
               tx.courseChapter.findMany({
                  where: { courseId: parentId },
                  orderBy: { position: 'asc' },
                  select: { id: true, position: true },
               }),
            setPosition: (id: string, position: number) =>
               tx.courseChapter.update({ where: { id }, data: { position } }),
         };
      case 'stage':
         return {
            find: async (id: string): Promise<IPositioned | null> => {
               const row = await tx.learningStage.findUnique({
                  where: { id },
                  select: { id: true, chapterId: true, position: true },
               });
               return row && { id: row.id, parentId: row.chapterId, position: row.position };
            },
            siblings: async (parentId: string) =>
               tx.learningStage.findMany({
                  where: { chapterId: parentId },
                  orderBy: { position: 'asc' },
                  select: { id: true, position: true },
               }),
            setPosition: (id: string, position: number) =>
               tx.learningStage.update({ where: { id }, data: { position } }),
         };
      case 'section':
         return {
            find: async (id: string): Promise<IPositioned | null> => {
               const row = await tx.courseSection.findUnique({
                  where: { id },
                  select: { id: true, stageId: true, position: true },
               });
               return row && { id: row.id, parentId: row.stageId, position: row.position };
            },
            siblings: async (parentId: string) =>
               tx.courseSection.findMany({
                  where: { stageId: parentId },
                  orderBy: { position: 'asc' },
                  select: { id: true, position: true },
               }),
            setPosition: (id: string, position: number) =>
               tx.courseSection.update({ where: { id }, data: { position } }),
         };
   }
};

/**
 * 与相邻项交换位置。position 上有唯一约束，先把自己挪到临时位 -1 再交换。
 * 已在边界时返回 false。
 */
export async function swapWithNeighbor(
   tx: Tx,
   kind: CourseOutlineKind,
   id: string,
   direction: 'up' | 'down',
) {
   const ops = positionOps(tx, kind);
   const self = await ops.find(id);
   if (!self) throw new TRPCError({ code: 'NOT_FOUND', message: '要移动的内容不存在' });
   const siblings = await ops.siblings(self.parentId);
   const index = siblings.findIndex((item) => item.id === id);
   const neighbor = siblings[direction === 'up' ? index - 1 : index + 1];
   if (!neighbor) return false;
   await ops.setPosition(self.id, -1);
   await ops.setPosition(neighbor.id, self.position);
   await ops.setPosition(self.id, neighbor.position);
   return true;
}

/** 删除后把同级 position 重新压实为 1..n；升序逐个前移不会撞唯一约束。 */
export async function compactPositions(tx: Tx, kind: CourseOutlineKind, parentId: string) {
   const ops = positionOps(tx, kind);
   const siblings = await ops.siblings(parentId);
   for (const [index, item] of siblings.entries()) {
      if (item.position !== index + 1) await ops.setPosition(item.id, index + 1);
   }
}

export async function nextPosition(tx: Tx, kind: CourseOutlineKind, parentId: string) {
   const siblings = await positionOps(tx, kind).siblings(parentId);
   return (siblings.at(-1)?.position ?? 0) + 1;
}

/**
 * 删除一批小节及其学习记录与评论。外键均为 Restrict：
 * 评论有自引用，先断开父子关系再批量删除，避免同一语句内的 RESTRICT 冲突。
 */
export async function purgeSections(tx: Tx, where: Prisma.CourseSectionWhereInput) {
   await tx.sectionComment.updateMany({
      where: { section: where, parentId: { not: null } },
      data: { parentId: null },
   });
   await tx.sectionComment.deleteMany({ where: { section: where } });
   await tx.sectionProgress.deleteMany({ where: { section: where } });
   await tx.courseSection.deleteMany({ where });
}

export async function touchCourse(tx: Tx, courseId: string) {
   await tx.course.update({ where: { id: courseId }, data: { updatedAt: new Date() } });
}

/** 维护图片引用计数：新图 +1，旧图 -1（不减到负数）。 */
export async function swapImageRef(tx: Tx, previous: string | null | undefined, next: string | null | undefined) {
   if (previous === next) return;
   if (next) {
      await tx.image.update({ where: { id: next }, data: { refCount: { increment: 1 } } });
   }
   if (previous) {
      await tx.image.updateMany({
         where: { id: previous, refCount: { gt: 0 } },
         data: { refCount: { decrement: 1 } },
      });
   }
}

/** 管理端加载课程完整大纲时使用的字段。 */
export const adminCourseDetailSelect = {
   id: true,
   title: true,
   summary: true,
   description: true,
   status: true,
   createdAt: true,
   updatedAt: true,
   coverImageId: true,
   coverImage: { select: { name: true } },
   _count: { select: { enrollments: true } },
   chapters: {
      orderBy: { position: 'asc' },
      select: {
         id: true,
         title: true,
         introduction: true,
         position: true,
         stages: {
            orderBy: { position: 'asc' },
            select: {
               id: true,
               position: true,
               sections: {
                  orderBy: { position: 'asc' },
                  select: {
                     id: true,
                     title: true,
                     position: true,
                     type: true,
                     articleContent: true,
                     updatedAt: true,
                     baseProblem: {
                        select: {
                           CurrentProblem: {
                              select: { pid: true, title: true, status: true, difficulty: true },
                           },
                        },
                     },
                     _count: { select: { progress: true, comments: true } },
                  },
               },
            },
         },
      },
   },
} as const satisfies Prisma.CourseSelect;

export type AdminCourseDetail = Prisma.CourseGetPayload<{ select: typeof adminCourseDetailSelect }>;

export interface ICoursePublishIssue {
   message: string;
   /** 定位用：问题所在的章节 / 小节 id */
   chapterId?: string;
   sectionId?: string;
}

/**
 * 发布前检查。学员端解锁逻辑要求每个阶段至少有一节、空章节会卡住后续进度，
 * 文章节需要正文、题目节需要关联已发布的题目。
 */
export function collectPublishIssues(course: AdminCourseDetail): ICoursePublishIssue[] {
   const issues: ICoursePublishIssue[] = [];
   if (!course.title.trim()) issues.push({ message: '课程标题不能为空' });
   if (!course.chapters.length) issues.push({ message: '课程还没有任何章节' });

   course.chapters.forEach((chapter, chapterIndex) => {
      const chapterLabel = `第 ${chapterIndex + 1} 章「${chapter.title}」`;
      if (!chapter.stages.length) {
         issues.push({ message: `${chapterLabel}没有学习阶段`, chapterId: chapter.id });
      }
      chapter.stages.forEach((stage, stageIndex) => {
         if (!stage.sections.length) {
            issues.push({
               message: `${chapterLabel}的阶段 ${stageIndex + 1} 没有小节`,
               chapterId: chapter.id,
            });
         }
         for (const section of stage.sections) {
            const sectionLabel = `${chapterLabel}中的小节「${section.title}」`;
            if (section.type === 'article' && !section.articleContent?.trim()) {
               issues.push({ message: `${sectionLabel}正文为空`, chapterId: chapter.id, sectionId: section.id });
            }
            if (section.type === 'problem') {
               const problem = section.baseProblem?.CurrentProblem;
               if (!problem) {
                  issues.push({
                     message: `${sectionLabel}关联的题目暂无可用版本`,
                     chapterId: chapter.id,
                     sectionId: section.id,
                  });
               } else if (problem.status !== 'published') {
                  issues.push({
                     message: `${sectionLabel}关联的题目未发布`,
                     chapterId: chapter.id,
                     sectionId: section.id,
                  });
               }
            }
         }
      });
   });
   return issues;
}
