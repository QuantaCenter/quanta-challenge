import type { StForm } from '#components';
import type { IRule } from '~/components/st/Form/type';
import type { ArticleCoverPreset } from '~/composables/use-learning';

export interface IArticleDraft {
   title: string;
   slug: string;
   summary: string;
   /** 正文源码：Markdown，插入题目处写 <Problem baseId={...} />（见设计文档 §13.3） */
   body: string;
   /** 封面：预设渐变，或上传一张自定义图片 */
   coverMode: 'preset' | 'custom';
   coverPreset: ArticleCoverPreset;
   coverUrl: string;
   coverImageId: string;
}

export const TITLE_MAX = 40;
export const SUMMARY_MAX = 80;

export const createEmptyArticleDraft = (): IArticleDraft => ({
   title: '',
   slug: '',
   summary: '',
   body: '',
   coverMode: 'preset',
   coverPreset: 'slate',
   coverUrl: '',
   coverImageId: '',
});

/**
 * 发布 / 编辑文章的表单状态。
 *
 * 传 `storageName` 时草稿落在 localStorage（「已经自动保存」就不是一句空话）；
 * 不传时只用内存（编辑已有文章走这条：内容来自文章本身，不该被上一次的半成品覆盖）。
 */
export const useArticlePublicationForm = (storageName?: string) => {
   const draft = storageName
      ? useLocalStorage<IArticleDraft>(storageName, createEmptyArticleDraft())
      : ref<IArticleDraft>(createEmptyArticleDraft());

   const formKey = 'articleForm';
   const form = useTemplateRef<InstanceType<typeof StForm>>(formKey);

   const rules = ref<IRule[]>([
      {
         field: 'title',
         required: true,
         validator: (value) => {
            const title = String(value ?? '').trim();
            return title.length > 0 && title.length <= TITLE_MAX;
         },
      },
      {
         field: 'summary',
         required: true,
         validator: (value) => {
            const summary = String(value ?? '').trim();
            return summary.length > 0 && summary.length <= SUMMARY_MAX;
         },
      },
      {
         field: 'body',
         required: true,
         validator: (value) => String(value ?? '').trim().length > 0,
      },
   ]);

   // 先给出「为什么还不能提交」，而不是等点了才报错（设计文档 §15.2）
   const blockedReason = computed(() => {
      if (!draft.value.title.trim()) return '先给文章起个标题';
      if (draft.value.title.trim().length > TITLE_MAX) {
         return `标题不超过 ${TITLE_MAX} 个字`;
      }
      if (!draft.value.summary.trim()) return '再写一句摘要，它出现在文章列表里';
      if (draft.value.summary.trim().length > SUMMARY_MAX) {
         return `摘要不超过 ${SUMMARY_MAX} 个字`;
      }
      if (!draft.value.body.trim()) return '正文还是空的';
      return '';
   });

   const canSubmit = computed(() => blockedReason.value === '');

   /**
    * 清空表单。
    *
    * 注意 `useLocalStorage` 是**自动持久化**的：只把 `draft.value` 换回空对象
    * 也会把空的草稿写回 localStorage（下一次进来就是干净的）。
    * 这里再显式删一次键，防止个别实现只改内存不落盘。
    */
   const reset = () => {
      draft.value = createEmptyArticleDraft();
      if (storageName && import.meta.client) {
         try {
            localStorage.removeItem(storageName);
         } catch {
            // 隐私模式写不进去：内存里已经清空了
         }
      }
   };

   return { draft, formKey, form, rules, blockedReason, canSubmit, reset };
};
