<script setup lang="ts">
import { Delete, Edit, FileText, Plus, Topic } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import type { ITableColumn } from '~/components/st/Table/type';
import { dialog } from '~/composables/use-dialog';

useSeoMeta({ title: '学习内容管理 - Quanta Challenge' });

const { $trpc } = useNuxtApp();
const message = useMessage();
const loading = ref(true);
const articles = ref<Awaited<ReturnType<typeof $trpc.admin.learning.listArticles.query>>>([]);
const topics = ref<Awaited<ReturnType<typeof $trpc.admin.learning.listTopics.query>>>([]);

const load = async () => {
   loading.value = true;
   try {
      [articles.value, topics.value] = await Promise.all([
         $trpc.admin.learning.listArticles.query(),
         $trpc.admin.learning.listTopics.query(),
      ]);
   } catch (error) {
      message.error('学习内容加载失败', error instanceof Error ? error.message : String(error));
   } finally {
      loading.value = false;
   }
};

onMounted(load);

const removeArticle = async (id: string, title: string) => {
   const confirmed = await dialog.confirm({
      title: '删除文章',
      description: `确定删除文章“${title}”吗？此操作不可恢复。`,
      variant: 'danger',
      confirmText: '删除',
      cancelText: '取消',
   });
   if (!confirmed) return;
   try {
      await $trpc.admin.learning.deleteArticle.mutate({ id });
      articles.value = articles.value.filter((item) => item.id !== id);
      message.success('文章已删除');
   } catch (error) {
      message.error('删除失败', error instanceof Error ? error.message : String(error));
   }
};

const removeTopic = async (id: string, title: string) => {
   const confirmed = await dialog.confirm({
      title: '删除专题',
      description: `确定删除专题“${title}”吗？此操作不可恢复。`,
      variant: 'danger',
      confirmText: '删除',
      cancelText: '取消',
   });
   if (!confirmed) return;
   try {
      await $trpc.admin.learning.deleteTopic.mutate({ id });
      topics.value = topics.value.filter((item) => item.id !== id);
      message.success('专题已删除');
   } catch (error) {
      message.error('删除失败', error instanceof Error ? error.message : String(error));
   }
};

const formatDate = (value: string | Date) =>
   new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));

const activeTab = ref('article');
const tabs = [
   { label: '文章', value: 'article', icon: FileText },
   { label: '专题', value: 'topic', icon: Topic },
];
const columns: ITableColumn[] = [
   { key: 'title', title: '标题' },
   { key: 'status', title: '状态', width: '7rem' },
   { key: 'content', title: '内容', width: '13rem', class: 'max-md:hidden' },
   { key: 'updatedAt', title: '更新时间', width: '8rem', class: 'max-md:hidden' },
   { key: 'action', title: '操作', width: '7rem', align: 'center' },
];
interface LearningManageRow {
   id: string;
   title: string;
   description: string;
   status: string;
   content: string;
   updatedAt: string | Date;
   kind: 'article' | 'topic';
}
const rows = computed<LearningManageRow[]>(() =>
   activeTab.value === 'article'
      ? articles.value.map((article) => ({
           id: article.id,
           title: article.title,
           description: article.summary || '暂无简介',
           status: article.status,
           content: `${article._count.problems} 题 · ${article._count.playgrounds} Playground`,
           updatedAt: article.updatedAt,
           kind: 'article' as const,
        }))
      : topics.value.map((topic) => ({
           id: topic.id,
           title: topic.title,
           description: topic.description || '暂无描述',
           status: topic.status,
           content: `${topic._count.articles} 文章 · ${topic._count.problems} 题`,
           updatedAt: topic.updatedAt,
           kind: 'topic' as const,
        })),
);

const removeRow = (row: LearningManageRow) =>
   row.kind === 'article'
      ? removeArticle(row.id, row.title)
      : removeTopic(row.id, row.title);
</script>

<template>
   <StSpace fill direction="vertical" align="center" gap="0" class="overflow-auto">
      <StSpace fill-y direction="vertical" gap="0" class="mt-6 w-full max-w-[65rem] pb-24 max-md:px-4">
         <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
               <h1 class="text-[2.5rem] font-bold text-white max-md:text-[1.5rem] max-md:leading-[1.2]">学习内容管理</h1>
               <p class="mt-1 text-accent-300">管理学习文章与混排专题的草稿和发布状态。</p>
            </div>
            <div class="flex gap-2">
               <StButton size="sm" bordered @click="navigateTo('/app/publish/article/new')">
                  <Plus class="mr-1" />创建文章
               </StButton>
               <StButton size="sm" theme="secondary" @click="navigateTo('/app/publish/topic/new')">
                  <Plus class="mr-1" />创建专题
               </StButton>
            </div>
         </div>

         <StTabs v-model="activeTab" :options="tabs" class="mb-5" />
         <StTable
            :columns="columns"
            :rows="rows"
            :loading="loading"
            row-key="id"
            :empty-text="activeTab === 'article' ? '暂无文章' : '暂无专题'">
            <template #cell-title="{ row }">
               <NuxtLink
                  :to="`/app/publish/${row.kind}/${row.id}`"
                  class="block truncate st-font-body-bold text-white hover:text-primary">
                  {{ row.title }}
               </NuxtLink>
               <div class="mt-1 truncate st-font-caption text-accent-400">{{ row.description }}</div>
            </template>
            <template #cell-status="{ row }">
               <StTag
                  :content="row.status === 'PUBLISHED' ? '已发布' : '草稿'"
                  :color="row.status === 'PUBLISHED' ? '#25B38A' : '#575757'"
                  size="small" />
            </template>
            <template #cell-content="{ row }">
               <span class="st-font-caption text-accent-300">{{ row.content }}</span>
            </template>
            <template #cell-updatedAt="{ row }">
               <span class="st-font-caption text-accent-300">{{ formatDate(row.updatedAt) }}</span>
            </template>
            <template #cell-action="{ row }">
               <StSpace align="center" justify="center" gap="1.25rem">
                  <NuxtLink
                     :to="`/app/publish/${row.kind}/${row.id}`"
                     aria-label="编辑"
                     class="flex size-8 items-center justify-center rounded-md text-accent-300 transition-all hover:bg-accent-500 hover:text-secondary">
                     <Edit class="text-[1.25rem]" />
                  </NuxtLink>
                  <button
                     type="button"
                     aria-label="删除"
                     class="flex size-8 items-center justify-center rounded-md text-accent-300 transition-all hover:bg-accent-500 hover:text-error"
                     @click="removeRow(row)">
                     <Delete class="text-[1.25rem]" />
                  </button>
               </StSpace>
            </template>
         </StTable>
      </StSpace>
   </StSpace>
</template>
