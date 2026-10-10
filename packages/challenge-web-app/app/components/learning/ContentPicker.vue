<script setup lang="ts">
import {
   BookOne,
   Check,
   Close,
   DocDetail,
   Search,
   Star,
   TableReport,
} from '@icon-park/vue-next';
import {
   articlesOfTopic,
   useLearningArticles,
   useLearningProblemBank,
   useAllTopics,
   type Difficulty,
} from '~/composables/use-learning';
import { useLearningContentStore } from '~/composables/use-learning-store';
import { useFavorites } from '~/composables/use-favorites';

/**
 * 内容选择器（浮窗）：在**题库 / 文章库**里搜索，或从**收藏**里挑。
 *
 * 「插入题目」「引用题目」「引用文章」三处共用这一个组件：
 * - 单选（`multiple` 为 false）：点一条就直接 emit `pick`；
 * - 多选：勾选后点「确定」emit `confirm`。
 */
const props = withDefaults(
   defineProps<{
      kind: 'problem' | 'article' | 'topic';
      multiple?: boolean;
      /** 多选时的已选项，用于回显 */
      selectedIds?: number[];
   }>(),
   { multiple: false, selectedIds: () => [] },
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

const favorites = useFavorites();
const content = useLearningContentStore();
const articles = useLearningArticles(content);
const topics = useAllTopics();
const problemBank = useLearningProblemBank();
const bankStatus = useLearningProblemBankStatus();

const tab = ref('library');
const keyword = ref('');
const draftIds = ref<number[]>([]);

const isProblem = computed(() => props.kind === 'problem');
const isTopic = computed(() => props.kind === 'topic');

const libraryLabel = computed(() =>
   isProblem.value ? '题库' : isTopic.value ? '专题库' : '文章库',
);

const libraryIcon = computed(() =>
   isProblem.value ? TableReport : isTopic.value ? BookOne : DocDetail,
);

// 收藏只有题目与文章两类，选专题时不显示这个页签
const tabs = computed(() => {
   const list = [
      { label: libraryLabel.value, value: 'library', icon: libraryIcon.value },
   ];
   if (!isTopic.value) list.push({ label: '收藏', value: 'favorite', icon: Star });
   return list;
});

const libraryItems = computed<PickerItem[]>(() => {
   if (isProblem.value) {
      return problemBank.map((problem) => ({
         id: problem.baseId,
         title: problem.title,
         summary: `base ${problem.baseId}`,
         difficulty: problem.difficulty,
         totalScore: problem.totalScore,
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
   }));
});

const favoriteItems = computed<PickerItem[]>(() =>
   isProblem.value
      ? favorites.problemFavorites.value.map((problem) => ({
           id: problem.baseId ?? problem.pid ?? 0,
           title: problem.title,
           summary: problem.baseId
              ? `base ${problem.baseId}`
              : '这道题没有可用题号',
           difficulty: problem.difficulty,
           totalScore: problem.totalScore,
           // 文章引用题目靠 baseId；只有版本号的题没法写进正文
           disabled: problem.baseId === undefined,
           disabledReason: '缺少题号，不能写进正文',
        }))
      : favorites.articleFavorites.value.map((article) => ({
           id: article.articleId,
           title: article.title,
           summary: article.summary,
        })),
);

const items = computed(() => {
   const source = tab.value === 'favorite' ? favoriteItems.value : libraryItems.value;
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

watch(opened, (value) => {
   if (!value) return;
   draftIds.value = [...props.selectedIds];
   keyword.value = '';
   tab.value = 'library';
   // 题库每次打开都重新拉：刚发布的题不用刷新页面就能搜到
   if (isProblem.value) void bankStatus.reload();
});
</script>

<template>
   <StModal v-model:opened="opened">
      <div
         class="w-[42rem] max-h-[34rem] flex flex-col rounded-[1rem] bg-accent-700 border border-accent-500 text-white overflow-hidden shadow-2xl">
         <StSpace
            align="center"
            justify="between"
            gap="1rem"
            fill-x
            class="px-5 py-4 border-b border-accent-500">
            <StSpace align="center" gap="0.5rem">
               <component
                  :is="libraryIcon"
                  class="text-secondary"
                  size="1.25rem"
                  :strokeWidth="3" />
               <span class="st-font-secondary-bold">
                  {{
                     isProblem ? '选择题目' : isTopic ? '选择专题' : '选择文章'
                  }}
               </span>
               <span class="st-font-tooltip text-accent-400">
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

         <StTabs
            v-if="tabs.length > 1"
            v-model="tab"
            :options="tabs"
            class="px-5 pt-4" />

         <div class="px-5 pt-4">
            <StInput
               v-model:value="keyword"
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

         <div class="flex-1 min-h-0 overflow-auto p-5 flex flex-col gap-2">
            <button
               v-for="item in items"
               :key="item.id"
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

               <StTag
                  v-if="tab === 'favorite'"
                  size="small"
                  color="#2b3a1a"
                  content="已收藏" />
            </button>

            <StEmptyStatus
               v-if="items.length === 0"
               :content="
                  tab === 'favorite'
                     ? isProblem
                        ? '还没有收藏题目'
                        : '还没有收藏文章'
                     : isProblem
                       ? bankStatus.loading.value
                          ? '正在加载题库…'
                          : bankStatus.failed.value
                            ? '题库加载失败，重新打开这个浮窗会再试一次'
                            : '题库里还没有已发布的题目'
                       : isTopic
                         ? '没有匹配的专题'
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
   </StModal>
</template>
