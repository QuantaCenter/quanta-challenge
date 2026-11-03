import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import { logger } from '~~/lib/logger';
import {
   estimateSectionMinutes,
   formatStudyMinutes,
   type AdminCourseChapter,
   type AdminCourseSection,
   type AdminCourseStage,
   type CourseOutlineKind,
   type ICourseInfoForm,
} from '~/types/course-admin';

const errorMessage = (err: unknown, fallback = '请稍后重试') =>
   (err as Error)?.message || fallback;

/**
 * 课程编辑页的数据与操作：
 * 加载完整大纲、保存基本信息、发布 / 下架、删除，以及章节 / 阶段 / 小节的增删与排序。
 * 大纲操作都是即时保存，成功后统一刷新。
 */
export const useCourseEditor = (courseId: Ref<string>) => {
   const { $trpc } = useNuxtApp();
   const message = useMessage();

   const { data, pending, error, refresh } = useAsyncData(
      () => `admin-course-${courseId.value}`,
      () => $trpc.admin.course.get.query({ id: courseId.value }),
   );

   watch(
      error,
      (value) => {
         if (!value) return;
         logger.error(value, '加载课程失败');
         message.error('课程加载失败', '课程可能已被删除');
      },
      { immediate: true },
   );

   // ── 基本信息 ──────────────────────────────────────────────────────────
   const info = reactive<ICourseInfoForm>({
      title: '',
      summary: '',
      description: '',
      coverImageId: '',
      coverImageUrl: '',
   });
   const savedInfo = ref('');
   const snapshot = () =>
      JSON.stringify([info.title, info.summary, info.description, info.coverImageId]);

   // 大纲操作也会刷新数据；同一门课存在未保存的修改时不回填，避免覆盖正在编辑的内容
   let loadedId = '';
   watch(
      data,
      (course) => {
         if (!course) return;
         if (course.id === loadedId && snapshot() !== savedInfo.value) return;
         loadedId = course.id;
         info.title = course.title;
         info.summary = course.summary;
         info.description = course.description;
         info.coverImageId = course.coverImageId ?? '';
         info.coverImageUrl = course.coverImage ? `/api/static/${course.coverImage.name}` : '';
         savedInfo.value = snapshot();
      },
      { immediate: true },
   );

   const infoDirty = computed(() => !!data.value && snapshot() !== savedInfo.value);

   const savingInfo = ref(false);
   const saveInfo = async () => {
      if (!info.title.trim()) {
         message.error('保存失败', '课程标题不能为空');
         return false;
      }
      savingInfo.value = true;
      try {
         await $trpc.admin.course.update.mutate({
            id: courseId.value,
            title: info.title,
            summary: info.summary,
            description: info.description,
            coverImageId: info.coverImageId || null,
         });
         savedInfo.value = snapshot();
         message.success('基本信息已保存');
         await refresh();
         return true;
      } catch (err) {
         message.error('保存失败', errorMessage(err));
         return false;
      } finally {
         savingInfo.value = false;
      }
   };

   // ── 统计与发布检查 ────────────────────────────────────────────────────
   const allSections = computed(() =>
      (data.value?.chapters ?? []).flatMap((chapter) =>
         chapter.stages.flatMap((stage) => stage.sections),
      ),
   );

   const stats = computed(() => {
      const sections = allSections.value;
      const minutes = sections.reduce((total, section) => total + estimateSectionMinutes(section.type), 0);
      return [
         { label: '章节', value: data.value?.chapters.length ?? 0, color: 'text-white' },
         { label: '小节', value: sections.length, color: 'text-white' },
         { label: '学员', value: data.value?._count.enrollments ?? 0, color: 'text-secondary' },
         { label: '预计学时', value: formatStudyMinutes(minutes), color: 'text-accent-100' },
      ];
   });

   const issues = computed(() => data.value?.issues ?? []);
   const issueSectionIds = computed(
      () => new Set(issues.value.map((issue) => issue.sectionId).filter(Boolean) as string[]),
   );
   const issueChapterIds = computed(
      () => new Set(issues.value.map((issue) => issue.chapterId).filter(Boolean) as string[]),
   );

   // ── 发布 / 下架 ───────────────────────────────────────────────────────
   const switchingStatus = ref(false);
   const togglePublish = async () => {
      const course = data.value;
      if (!course) return;
      const publish = course.status !== 'published';

      if (publish && infoDirty.value) {
         const saved = await saveInfo();
         if (!saved) return;
      }

      const confirmed = await dialog.confirm(
         publish
            ? {
                 title: '发布课程',
                 description: `发布后「${course.title}」将出现在学习课程列表中，所有成员都可以获取并学习。`,
                 confirmText: '发布',
                 cancelText: '取消',
              }
            : {
                 title: '下架课程',
                 description: `下架后学员将无法继续学习「${course.title}」，学习记录会保留，重新发布后可继续。`,
                 variant: 'danger',
                 confirmText: '下架',
                 cancelText: '取消',
              },
      );
      if (!confirmed) return;

      switchingStatus.value = true;
      try {
         await $trpc.admin.course.setStatus.mutate({ id: course.id, publish });
         message.success(publish ? '课程已发布' : '课程已下架');
      } catch (err) {
         message.error(publish ? '发布失败' : '下架失败', errorMessage(err));
      } finally {
         switchingStatus.value = false;
         await refresh();
      }
   };

   // ── 删除课程 ─────────────────────────────────────────────────────────
   const removeCourse = async () => {
      const course = data.value;
      if (!course) return;
      const learners = course._count.enrollments;
      const confirmed = await dialog.confirm({
         title: '删除课程',
         description: learners
            ? `「${course.title}」已有 ${learners} 名学员，删除后其学习进度、评分与评论将一并清除，且不可撤销。若只是暂停学习，建议改为下架。`
            : `确定要删除「${course.title}」吗？课程的全部章节与小节将一并删除，此操作不可撤销。`,
         variant: 'danger',
         confirmText: '删除',
         cancelText: '取消',
      });
      if (!confirmed) return;
      try {
         await $trpc.admin.course.remove.mutate({ id: course.id });
         message.success('课程已删除');
         await navigateTo('/app/manage/course');
      } catch (err) {
         message.error('删除失败', errorMessage(err));
      }
   };

   // ── 大纲操作 ─────────────────────────────────────────────────────────
   /** 当前正在处理的条目，用于给对应按钮加 loading / 禁用，避免重复点击 */
   const busyId = ref<string | null>(null);

   const runOutline = async (id: string, task: () => Promise<unknown>, failTitle: string) => {
      if (busyId.value) return;
      busyId.value = id;
      try {
         await task();
         await refresh();
      } catch (err) {
         message.error(failTitle, errorMessage(err));
      } finally {
         busyId.value = null;
      }
   };

   const move = (kind: CourseOutlineKind, id: string, direction: 'up' | 'down') =>
      runOutline(
         id,
         () => $trpc.admin.course.move.mutate({ kind, id, direction, courseId: courseId.value }),
         '调整顺序失败',
      );

   const addStage = (chapter: AdminCourseChapter) =>
      runOutline(chapter.id, () => $trpc.admin.course.createStage.mutate({ chapterId: chapter.id }), '添加阶段失败');

   const learnerImpact = (sections: AdminCourseSection[]) => {
      const progress = sections.reduce((total, section) => total + section._count.progress, 0);
      const comments = sections.reduce((total, section) => total + section._count.comments, 0);
      if (!progress && !comments) return '';
      const parts = [progress && `${progress} 条学习记录`, comments && `${comments} 条评论`].filter(Boolean);
      return `其中包含 ${parts.join('、')}，将一并删除。`;
   };

   const removeChapter = async (chapter: AdminCourseChapter) => {
      const sections = chapter.stages.flatMap((stage) => stage.sections);
      const confirmed = await dialog.confirm({
         title: '删除章节',
         description: `确定删除「${chapter.title}」及其 ${chapter.stages.length} 个阶段、${sections.length} 个小节吗？${learnerImpact(sections)}此操作不可撤销。`,
         variant: 'danger',
         confirmText: '删除',
         cancelText: '取消',
      });
      if (!confirmed) return;
      await runOutline(chapter.id, () => $trpc.admin.course.removeChapter.mutate({ id: chapter.id }), '删除章节失败');
   };

   const removeStage = async (stage: AdminCourseStage, label: string) => {
      if (stage.sections.length) {
         const confirmed = await dialog.confirm({
            title: '删除阶段',
            description: `确定删除${label}及其中的 ${stage.sections.length} 个小节吗？${learnerImpact(stage.sections)}此操作不可撤销。`,
            variant: 'danger',
            confirmText: '删除',
            cancelText: '取消',
         });
         if (!confirmed) return;
      }
      await runOutline(stage.id, () => $trpc.admin.course.removeStage.mutate({ id: stage.id }), '删除阶段失败');
   };

   const removeSection = async (section: AdminCourseSection) => {
      const confirmed = await dialog.confirm({
         title: '删除小节',
         description: `确定删除「${section.title}」吗？${learnerImpact([section])}此操作不可撤销。`,
         variant: 'danger',
         confirmText: '删除',
         cancelText: '取消',
      });
      if (!confirmed) return;
      await runOutline(section.id, () => $trpc.admin.course.removeSection.mutate({ id: section.id }), '删除小节失败');
   };

   // ── 编辑抽屉 ─────────────────────────────────────────────────────────
   const chapterDrawer = reactive({
      opened: false,
      chapter: null as AdminCourseChapter | null,
   });
   const openChapterDrawer = (chapter: AdminCourseChapter | null = null) => {
      chapterDrawer.chapter = chapter;
      chapterDrawer.opened = true;
   };

   const sectionDrawer = reactive({
      opened: false,
      stageId: '',
      location: '',
      section: null as AdminCourseSection | null,
   });
   const openSectionDrawer = (stageId: string, location: string, section: AdminCourseSection | null = null) => {
      sectionDrawer.stageId = stageId;
      sectionDrawer.location = location;
      sectionDrawer.section = section;
      sectionDrawer.opened = true;
   };

   const handleDrawerSaved = async (text: string) => {
      message.success(text);
      await refresh();
   };

   return {
      data,
      pending,
      refresh,
      info,
      infoDirty,
      savingInfo,
      saveInfo,
      stats,
      issues,
      issueSectionIds,
      issueChapterIds,
      switchingStatus,
      togglePublish,
      removeCourse,
      busyId,
      move,
      addStage,
      removeChapter,
      removeStage,
      removeSection,
      chapterDrawer,
      openChapterDrawer,
      sectionDrawer,
      openSectionDrawer,
      handleDrawerSaved,
   };
};
