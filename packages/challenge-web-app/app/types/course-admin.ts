import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~~/server/trpc/routes';

type RouterOutput = inferRouterOutputs<AppRouter>;

/** 课程管理列表中的一行。 */
export type AdminCourseRow = RouterOutput['admin']['course']['list'][number];

/** 课程编辑页加载的完整课程（含大纲与发布检查结果）。 */
export type AdminCourseDetail = RouterOutput['admin']['course']['get'];
export type AdminCourseChapter = AdminCourseDetail['chapters'][number];
export type AdminCourseStage = AdminCourseChapter['stages'][number];
export type AdminCourseSection = AdminCourseStage['sections'][number];

export type CourseStatus = AdminCourseRow['status'];
export type CourseOutlineKind = 'chapter' | 'stage' | 'section';

/** 课程基本信息表单（新建与编辑共用）。 */
export interface ICourseInfoForm {
   title: string;
   summary: string;
   description: string;
   coverImageId: string;
   coverImageUrl: string;
}

export const COURSE_STATUS_META: Record<
   CourseStatus,
   { label: string; badgeClass: string; dotClass: string }
> = {
   draft: {
      label: '草稿',
      badgeClass: 'bg-accent-600 text-accent-200 border-accent-500',
      dotClass: 'bg-accent-300',
   },
   published: {
      label: '已发布',
      badgeClass: 'bg-success/10 text-success border-success/40',
      dotClass: 'bg-success',
   },
   unpublished: {
      label: '已下架',
      badgeClass: 'bg-warning/10 text-warning border-warning/40',
      dotClass: 'bg-warning',
   },
};

/** 与学员端列表一致的估算：文章 5 分钟、题目 30 分钟。 */
export const estimateSectionMinutes = (type: 'article' | 'problem') =>
   type === 'article' ? 5 : 30;

export const formatStudyMinutes = (minutes: number) => {
   if (!minutes) return '—';
   const hours = Math.floor(minutes / 60);
   const remaining = minutes % 60;
   if (!hours) return `${remaining} 分钟`;
   return remaining ? `${hours} 小时 ${remaining} 分` : `${hours} 小时`;
};
