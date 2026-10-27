<script setup lang="ts">
import {
   BookOne,
   Check,
   Close,
   DocDetail,
   Search,
   TableReport,
} from '@icon-park/vue-next';
import {
   articlesOfTopic,
   useLearningArticles,
   useLearningProblemBank,
   useAllTopics,
   type Difficulty,
   type LearningArticle,
   type LearningProblemRef,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import DrawerWrapper from '../st/Drawer/index.vue';

/**
 * 内容选择器：在题库 / 文章库 / 专题里搜索，支持单选与多选。
 */
const props = withDefaults(
   defineProps<{
      kind: 'problem' | 'article' | 'topic';
      multiple?: boolean;
      /** 多选时的已选项，用于回显 */
      selectedIds?: number[];
      /** 抽屉宽度，二级抽屉传更窄的值 */
      width?: string;
   }>(),
   { multiple: false, selectedIds: () => [], width: '35rem' },
);

const opened = defineModel<boolean>('opened', { default: false });

const emit = defineEmits<{
   pick: [id: number];
   confirm: [ids: number[]];
}>();

interface PickerItem {
   id: number;
   title: string;
   summary?: string;
   difficulty?: Difficulty;
   totalScore?: number;
   disabled?: boolean;
   disabledReason?: string;
   /** 题目类型时携带完整题目信息，用文章内同款的题目块渲染 */
   problem?: LearningProblemRef;
   /** 文章类型时携带完整文章，用学习页同款的文章条目渲染 */
   article?: LearningArticle;
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
   easy: '简单',
   medium: '中等',
   hard: '困难',
   very_hard: '极难',
};

const DIFFICULTY_COLOR: Record<Difficulty, string> = {
   easy: '#14e87e',
   medium: '#ffbe31',
   hard: '#fa2f32',
   very_hard: '#fa2f32',
};

const content = useLearningContentStore();
const articles = useLearningArticles(content);
const topics = useAllTopics();
const problemBank = useLearningProblemBank();
const bankStatus = useLearningProblemBankStatus();

const tab = ref('library');
const keyword = ref('');
const keywordInput = ref('');
const draftIds = ref<number[]>([]);

// 搜索防抖 300ms
const PAGE_SIZE = 20;
const page = ref(1);
const applyKeyword = useDebounceFn(() => {
   keyword.value = keywordInput.value;
   page.value = 1;
}, 300);
watch(keywordInput, () => applyKeyword());

const isProblem = computed(() => props.kind === 'problem');
const isTopic = computed(() => props.kind === 'topic');
const isArticle = computed(() => props.kind === 'article');

const libraryLabel = computed(() =>
   isProblem.value ? '题库' : isTopic.value ? '专题库' : '文章库',
);

const libraryIcon = computed(() =>
   isProblem.value ? TableReport : isTopic.value ? BookOne : DocDetail,
);

// 专题保留图标，题目与文章的页签纯文字
const tabs = computed(() => [
   {
      label: libraryLabel.value,
      value: 'library',
      icon: isTopic.value ? libraryIcon.value : undefined,
   },
]);

const libraryItems = computed<PickerItem[]>(() => {
   if (isProblem.value) {
      return problemBank.map((problem) => ({
         id: problem.baseId,
         title: problem.title,
         summary: `base ${problem.baseId}`,
         difficulty: problem.difficulty,
         totalScore: problem.totalScore,
         problem,
      }));
   }

   if (isTopic.value) {
      return topics.map((topic) => ({
         id: topic.id,
         title: topic.name,
         summary: `${articlesOfTopic(topic, content).length} 篇文章 · ${topic.description}`,
      }));
   }

   return articles.map((article) => ({
      id: article.id,
      title: article.title,
      summary: `${article.problems.length} 道题 · ${article.summary}`,
      article,
   }));
});

const items = computed(() => {
   const source = libraryItems.value;
   const text = keyword.value.trim().toLowerCase();
   return text
      ? source.filter(
           (item) =>
              item.title.toLowerCase().includes(text) ||
              (item.summary ?? '').toLowerCase().includes(text) ||
              String(item.id).includes(text),
        )
      : source;
});

// 题目 / 文章列表分页加载：滚到列表底部自动加载下一页（专题一次性全出）
const paginated = computed(() => isProblem.value || isArticle.value);
const visibleItems = computed(() =>
   paginated.value ? items.value.slice(0, page.value * PAGE_SIZE) : items.value,
);
const hasMore = computed(
   () => paginated.value && visibleItems.value.length < items.value.length,
);
const onListScroll = (event: Event) => {
   const el = event.target as HTMLElement;
   if (el.scrollTop + el.clientHeight < el.scrollHeight - 40) return;
   if (hasMore.value) page.value += 1;
};

const isSelected = (id: number) => draftIds.value.includes(id);

const choose = (item: PickerItem) => {
   if (item.disabled) return;

   if (!props.multiple) {
      emit('pick', item.id);
      opened.value = false;
      return;
   }

   const idx = draftIds.value.indexOf(item.id);
   if (idx === -1) draftIds.value.push(item.id);
   else draftIds.value.splice(idx, 1);
};

const confirm = () => {
   emit('confirm', [...draftIds.value]);
   opened.value = false;
};

// 切页签回到第一页
watch(tab, () => {
   page.value = 1;
});

// 文章库打开时重拉，刚发布的文章立即可搜
const articlesLoading = ref(false);
const articlesFailed = ref(false);
const reloadArticles = async () => {
   articlesLoading.value = true;
   articlesFailed.value = false;
   articlesFailed.value = (await content.refresh()) === null;
   articlesLoading.value = false;
};

watch(opened, (value) => {
   if (!value) return;
   draftIds.value = [...props.selectedIds];
   keyword.value = '';
   keywordInput.value = '';
   tab.value = 'library';
   // 题库每次打开都重新拉
   if (isProblem.value) void bankStatus.reload();
   if (isArticle.value) void reloadArticles();
});
</script>

<template>
   <DrawerWrapper v-model:opened="opened" global :width="props.width">
      <div class="flex flex-col h-full bg-accent-700 text-white overflow-hidden">
         <StSpace
            align="center"
            justify="between"
            gap="1rem"
            fill-x
            class="px-5 py-4"
            :class="isProblem ? 'border-b border-accent-500' : ''">
            <StSpace align="center" gap="0.5rem">
               <component
                  :is="libraryIcon"
                  v-if="isProblem"
                  class="text-secondary"
                  size="1.25rem"
                  :strokeWidth="3" />
               <span class="st-font-secondary-bold">
                  {{
                     isProblem ? '选择题目' : isTopic ? '选择专题' : '选择文章'
                  }}
               </span>
               <span
                  v-if="isProblem"
                  class="st-font-tooltip text-accent-400">
                  {{ multiple ? '可多选' : '点一条即选中' }}
               </span>
            </StSpace>

            <button
               type="button"
               title="关闭"
               aria-label="关闭"
               class="flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-white transition-colors cursor-pointer"
               @click="opened = false">
               <Close size="1rem" :strokeWidth="3" />
            </button>
         </StSpace>

         <!-- padding 放外层：下划线绝对定位在 StTabs 根上，根上挂 px 会让下划线整体偏移 -->
         <div class="px-5 pt-4">
            <StTabs
               v-if="tabs.length > 1"
               v-model="tab"
               :options="tabs"
               centered />
         </div>

         <div class="px-5 pt-4">
            <StInput
               v-model:value="keywordInput"
               :placeholder="
                  isProblem
                     ? '按标题或题号搜索题库'
                     : isTopic
                       ? '按名称或简介搜索专题库'
                       : '按标题或摘要搜索文章库'
               "
               outer-class="border !py-3 !px-4 !rounded-[0.5rem] w-full focus-within:!border-primary">
               <template #prefix>
                  <Search class="shrink-0 text-accent-300" size="1rem" />
               </template>
            </StInput>
         </div>

         <div
            class="flex-1 min-h-0 overflow-auto p-5 flex flex-col gap-2"
            @scroll="onListScroll">
            <template v-for="item in visibleItems" :key="item.id">
               <!-- 题目：文章内同款的题目块，选中时加高亮描边 -->
               <div
                  v-if="isProblem"
                  class="cursor-pointer rounded-[0.75rem] [&>*]:!my-0"
                  :class="isSelected(item.id) ? 'ring-2 ring-secondary' : ''"
                  @click.prevent="choose(item)">
                  <LearningProblemBlock :problem="item.problem!" />
               </div>

               <!-- 文章：学习页同款的文章条目，选中时加高亮描边；
                    收藏按钮自己吃掉点击，不会误触发选中。
                    清掉 ArticleRow 自带的 py-4，让容器上下留白与左右一致 -->
               <div
                  v-else-if="isArticle"
                  class="cursor-pointer rounded-[0.75rem] p-2 [&>div]:!py-0"
                  :class="isSelected(item.id) ? 'ring-2 ring-secondary' : ''"
                  @click="choose(item)">
                  <LearningArticleRow :article="item.article" />
               </div>

               <button
                  v-else
                  type="button"
                  :disabled="item.disabled"
                  class="w-full p-3 rounded-[0.5rem] border text-left transition-colors flex items-center gap-3"
                  :class="[
                     item.disabled
                        ? 'border-accent-500 bg-accent-600/30 cursor-not-allowed opacity-60'
                        : isSelected(item.id)
                          ? 'border-secondary bg-accent-600 cursor-pointer'
                          : 'border-accent-400 bg-accent-600/40 hover:border-secondary/60 cursor-pointer',
                  ]"
                  @click="choose(item)">
                  <div
                     class="shrink-0 size-5 rounded-full border-2 flex items-center justify-center"
                     :class="
                        isSelected(item.id)
                           ? 'border-secondary text-secondary'
                           : 'border-accent-400'
                     ">
                     <Check
                        v-if="isSelected(item.id)"
                        size="0.75rem"
                        :strokeWidth="4" />
                  </div>

                  <StSpace direction="vertical" gap="0.25rem" class="min-w-0 flex-1">
                     <span class="st-font-body-bold text-accent-100 truncate">
                        {{ item.title }}
                     </span>
                     <StSpace align="center" gap="0.5rem">
                        <StTag
                           v-if="item.difficulty"
                           size="small"
                           :color="DIFFICULTY_COLOR[item.difficulty]"
                           :content="DIFFICULTY_LABEL[item.difficulty]" />
                        <span
                           v-if="item.totalScore"
                           class="st-font-tooltip text-accent-400 font-family-manrope">
                           {{ item.totalScore }} 分
                        </span>
                        <span class="st-font-tooltip text-accent-400 truncate">
                           {{ item.disabled ? item.disabledReason : item.summary }}
                        </span>
                     </StSpace>
                  </StSpace>
               </button>
            </template>

            <StEmptyStatus
               v-if="items.length === 0"
               :content="
                  isProblem
                     ? bankStatus.loading.value
                        ? '正在加载题库…'
                        : bankStatus.failed.value
                          ? '题库加载失败，重新打开会再试一次'
                          : '题库里还没有已发布的题目'
                     : isTopic
                     ? '没有匹配的专题'
                     : articlesLoading
                       ? '正在加载文章…'
                       : articlesFailed
                         ? '文章加载失败，重新打开会再试一次'
                         : '没有匹配的文章'
               "
               class="py-10" />
         </div>

         <StSpace
            v-if="multiple"
            align="center"
            justify="between"
            fill-x
            class="px-5 py-4 border-t border-accent-500">
            <span class="st-font-tooltip text-accent-300">
               已选 {{ draftIds.length }} 项
            </span>
            <StSpace gap="1rem" align="center">
               <StButton bordered @click="opened = false">
                  <span>取消</span>
               </StButton>
               <StButton @click="confirm">
                  <span>确定</span>
               </StButton>
            </StSpace>
         </StSpace>
      </div>
   </DrawerWrapper>
</template>
