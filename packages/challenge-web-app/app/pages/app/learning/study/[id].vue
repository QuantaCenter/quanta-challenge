<script setup lang="ts">
import { ArrowLeft, ArrowRight, BookOpen, Lock, CheckOne, MenuUnfold, MenuFold, LoadingFour, ListTwo } from '@icon-park/vue-next';
import ArticleBody from '~/components/learning/ArticleBody.vue';
import StudySection from '~/components/learning/StudySection.vue';
import CourseDirectory from '~/components/learning/CourseDirectory.vue';
import ChapterContents from '~/components/learning/ChapterContents.vue';
import { useMessage } from '~/components/st/Message/use-message';
import { useLearningSection } from '~/composables/use-learning-section';

const route = useRoute();
const { $trpc } = useNuxtApp();
const message = useMessage();
const sectionLoader = useLearningSection();
const switching = ref(false);
let selectionRequest = 0;
const id = computed(() => String(route.params.id));
const { data: course, pending, error, refresh } = await useAsyncData(
   () => `learning-study-${id.value}`,
   () => $trpc.protected.learning.study.query({ id: id.value }),
);
const directoryOpen = ref(false);
const directoryCollapsed = ref(false);
const desktop = useMediaQuery('(min-width: 768px)');
const chapters = computed(() => course.value?.chapters ?? []);
const allSections = computed(() => chapters.value.flatMap(chapter => chapter.sections));
const selectedSection = computed(() => allSections.value.find(section => section.id === route.query.section));
const sectionIndex = computed(() => allSections.value.findIndex(section => section.id === selectedSection.value?.id));
const previousSection = computed(() => sectionIndex.value > 0 ? allSections.value[sectionIndex.value - 1] : undefined);
const nextSection = computed(() => sectionIndex.value >= 0 ? allSections.value[sectionIndex.value + 1] : undefined);
const selectedChapter = computed(() => chapters.value.find(chapter =>
   selectedSection.value ? chapter.sections.some(section => section.id === selectedSection.value?.id) : chapter.id === route.query.chapter,
) ?? chapters.value.find(chapter => chapter.unlocked && !chapter.completed) ?? chapters.value[0]);
const locked = computed(() => selectedSection.value ? !selectedSection.value.unlocked : !selectedChapter.value?.unlocked);
const completedCount = computed(() => allSections.value.filter(section => section.completed).length);
const progressPercent = computed(() => allSections.value.length ? Math.round(completedCount.value / allSections.value.length * 100) : 0);
const finished = computed(() => allSections.value.length > 0 && allSections.value.every(section => section.completed));
const { html, update } = useMarkdown({ codeHeader: true });
watch(() => locked.value ? '' : selectedChapter.value?.introduction ?? '', content => update(content), { immediate: true });
const nextChapter = computed(() => {
   const next = nextSection.value;
   if (!next) return undefined;
   const owner = chapters.value.find(chapter => chapter.sections.some(section => section.id === next.id));
   // 下一节与当前小节同章时返回 undefined，按普通小节切换处理
   return owner && owner.id !== selectedChapter.value?.id ? owner : undefined;
});
useSeoMeta({ title: () => `${course.value?.title ?? '课程学习'} - Quanta Challenge` });

// 移动端目录抽屉只在小屏使用，切到桌面宽度时收起，避免以右侧抽屉形态残留
watch(desktop, (value) => {
   if (value) directoryOpen.value = false;
});

/** 打开目录抽屉时把当前项滚到可视区中部；只滚抽屉内部，不牵动背后页面 */
const directoryNav = useTemplateRef<HTMLElement>('directory-nav');
watch(directoryOpen, async (open) => {
   if (!open) return;
   await nextTick();
   requestAnimationFrame(() => {
      const nav = directoryNav.value;
      const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!nav || !current) return;
      // 用相对位置计算：抽屉此时仍在滑入，两者的位移会相互抵消
      const offset = current.getBoundingClientRect().top - nav.getBoundingClientRect().top;
      nav.scrollTop += offset - (nav.clientHeight - current.offsetHeight) / 2;
   });
});

/**
 * 关闭目录抽屉并等它回退自己压入的历史记录，再做路由跳转；
 * 否则 history.back() 与随后的 push 交错，可能把新地址又退回去。
 */
async function closeDirectory() {
   if (!directoryOpen.value || !import.meta.client) return;
   const popped = new Promise<void>((resolve) => {
      const done = () => {
         window.removeEventListener('popstate', done);
         resolve();
      };
      window.addEventListener('popstate', done);
   });
   directoryOpen.value = false;
   await popped;
}

const article = useTemplateRef<HTMLElement>('article');
/** 同一页面只改 query 时路由不会滚动：正文顶部已被滚出视口时，把它带回顶栏下方 */
function revealArticle() {
   const el = article.value;
   if (!el) return;
   const offset = desktop.value ? 112 : 128;
   const top = el.getBoundingClientRect().top;
   if (top < offset) window.scrollBy({ top: top - offset, behavior: 'instant' });
}

async function selectChapter(chapterId: string) {
   const request = ++selectionRequest;
   switching.value = false;
   await closeDirectory();
   if (request !== selectionRequest) return;
   await navigateTo({ path: route.path, query: { chapter: chapterId } });
   await nextTick();
   revealArticle();
}
async function selectSection(sectionId: string) {
   const request = ++selectionRequest;
   await closeDirectory();
   if (request !== selectionRequest) return;
   const courseId = id.value;
   const path = route.path;
   const source = route.fullPath;
   switching.value = true;
   try {
      const data = await sectionLoader.fetchSection(courseId, sectionId);
      if (request !== selectionRequest || id.value !== courseId || route.fullPath !== source) return;
      sectionLoader.prepare(courseId, sectionId, data);
      await navigateTo({ path, query: { section: sectionId } });
      await nextTick();
      revealArticle();
   } catch {
      if (request === selectionRequest) message.error('内容加载失败，请重试');
   } finally {
      if (request === selectionRequest) switching.value = false;
   }
}
function goNext() {
   // 下一节刚好是下一章的第一节：先进入该章的章节导读，而不是直接跳进小节
   if (nextChapter.value) return selectChapter(nextChapter.value.id);
   if (nextSection.value) return selectSection(nextSection.value.id);
}
async function syncProgress() {
   await refresh();
   void refreshNuxtData([`learning-course-${id.value}`, 'learning-courses']);
}
function beginChapter() {
   const chapter = selectedChapter.value;
   const section = chapter?.sections.find(item => item.unlocked && !item.completed)
      ?? chapter?.sections.find(item => item.unlocked);
   if (section) void selectSection(section.id);
}
</script>

<template>
   <div
      class="mx-auto my-6 w-full px-6 pb-24 md:pb-0 xl:-translate-x-10 transition-[max-width] duration-500 ease-in-out motion-reduce:transition-none max-md:my-4 max-md:px-4"
      :class="directoryCollapsed ? 'md:max-w-[63rem]' : 'md:max-w-[78.5rem]'">
      <!-- 移动端：吸顶的课程进度条，目录收进底部抽屉 -->
      <div
         v-if="course && !error"
         class="sticky top-14 z-30 -mx-4 mb-4 flex items-center gap-3 border-b border-accent-600 bg-background/85 px-4 py-2 backdrop-blur-xl md:hidden">
         <NuxtLink
            :to="`/app/learning/${id}`"
            aria-label="返回课程详情"
            class="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-accent-300 transition-colors active:bg-accent-500">
            <ArrowLeft aria-hidden="true" />
         </NuxtLink>
         <div class="min-w-0 flex-1">
            <p class="truncate text-sm leading-5 text-accent-100">{{ course.title }}</p>
            <div class="mt-1 flex items-center gap-2">
               <div
                  role="progressbar"
                  aria-label="课程完成进度"
                  :aria-valuenow="progressPercent"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  class="h-1 flex-1 overflow-hidden rounded-full bg-accent-600">
                  <div
                     class="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                     :style="{ width: `${progressPercent}%` }" />
               </div>
               <span class="shrink-0 font-family-manrope text-[0.6875rem] leading-none tabular-nums text-accent-300">
                  {{ completedCount }}/{{ allSections.length }}
               </span>
            </div>
         </div>
         <button
            type="button"
            aria-haspopup="dialog"
            :aria-expanded="directoryOpen"
            class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-accent-600 px-3 text-sm text-accent-200 transition-colors active:bg-accent-500"
            @click="directoryOpen = true">
            <ListTwo aria-hidden="true" />
            目录
         </button>
      </div>
      <div class="mb-6 flex items-center gap-3" :class="{ 'max-md:hidden': course && !error }">
         <NuxtLink
            :to="`/app/learning/${id}`"
            aria-label="返回课程详情"
            title="返回课程详情"
            class="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-accent-300 transition-colors hover:bg-accent-500 hover:text-white focus-visible:outline-2 focus-visible:outline-primary">
            <ArrowLeft aria-hidden="true" />
         </NuxtLink>
         <button
            v-if="course && !error"
            type="button"
            :aria-label="directoryCollapsed ? '展开目录' : '收起目录'"
            :aria-expanded="!directoryCollapsed"
            aria-controls="learning-directory-panel"
            :title="directoryCollapsed ? '展开目录' : '收起目录'"
            class="hidden size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-accent-600 text-accent-300 transition-colors hover:bg-accent-500 hover:text-white focus-visible:outline-2 focus-visible:outline-primary md:inline-flex"
            @click="directoryCollapsed = !directoryCollapsed">
            <MenuUnfold v-if="directoryCollapsed" />
            <MenuFold v-else />
         </button>
      </div>
      <StSpace v-if="pending && !course" center fill-x class="py-20 text-accent-300">
         正在加载课程…
      </StSpace>
      <StSpace v-else-if="error || !course" direction="vertical" gap="1rem" class="py-12">
         <p class="text-accent-300">无法进入课程，请确认已获取课程且课程仍在开放中。</p>
         <StButton size="sm" bordered @click="refresh()">重试</StButton>
      </StSpace>
      <div
         v-else
         class="grid grid-cols-1 items-start gap-6 transition-[grid-template-columns,gap] duration-500 ease-in-out motion-reduce:transition-none"
         :class="directoryCollapsed ? 'md:grid-cols-[0rem_minmax(0,1fr)] md:gap-0' : 'md:grid-cols-[22rem_minmax(0,1fr)]'">
         <div
            id="learning-directory-panel"
            :inert="directoryCollapsed && desktop"
            class="min-w-0 border-r border-accent-600 transition-opacity duration-500 ease-in-out motion-reduce:transition-none max-md:hidden md:sticky md:top-[6.5rem] md:overflow-hidden"
            :class="{ 'md:pointer-events-none md:opacity-0': directoryCollapsed }">
         <aside class="p-6 md:max-h-[calc(100vh-8rem)] md:w-[calc(22rem-1px)] md:overflow-auto md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden">
            <StSpace direction="vertical" gap="0.75rem" fill-x>
               <h2 class="text-xl">{{ course.title }}</h2>
               <span class="text-xs text-accent-300">已完成 {{ completedCount }}/{{ allSections.length }} 节</span>
               <nav aria-label="课程目录" class="w-full">
                  <CourseDirectory
                     :chapters="chapters"
                     interactive
                     :show-progress-percentage="false"
                     :show-branches="false"
                     :show-chapter-badge="false"
                     :edge-padding="16"
                     :active-chapter-id="selectedChapter?.id"
                     :active-section-id="selectedSection?.id"
                     @chapter="selectChapter"
                     @section="selectSection" />
               </nav>
            </StSpace>
         </aside>
         </div>
         <article
            ref="article"
            class="relative w-full min-w-0 justify-self-center transition-[max-width] duration-500 ease-in-out motion-reduce:transition-none"
            :class="directoryCollapsed ? 'max-w-[60rem]' : 'max-w-[52rem]'"
            :aria-busy="switching">
            <Transition
               enter-active-class="transition-opacity duration-150"
               leave-active-class="transition-opacity duration-150"
               enter-from-class="opacity-0"
               leave-to-class="opacity-0">
               <div
                  v-if="switching"
                  role="status"
                  aria-label="正在加载内容"
                  class="absolute inset-0 z-20 cursor-wait rounded-lg bg-background/60 backdrop-blur-[1px]">
                  <div class="sticky top-[40vh] flex justify-center py-8">
                     <LoadingFour class="animate-spin text-3xl text-primary" aria-hidden="true" />
                     <span class="sr-only">正在加载内容</span>
                  </div>
               </div>
            </Transition>
            <p v-if="!chapters.length" class="text-accent-300">课程暂无学习内容。</p>
            <StSpace v-else-if="locked" direction="vertical" gap="1rem">
               <Lock class="text-2xl text-accent-300" />
               <p class="text-accent-300">请先完成前面的章节和学习内容。</p>
            </StSpace>
            <template v-else>
               <div v-if="finished" class="mb-6 flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success max-md:mb-4 max-md:items-start" role="status">
                  <CheckOne class="shrink-0 max-md:mt-0.5" />
                  恭喜，已完成本课程！你可以继续回顾学习内容。
               </div>
               <StudySection
                  v-if="selectedSection"
                  :key="selectedSection.id"
                  :course-id="id"
                  :section-id="selectedSection.id"
                  :completed="selectedSection.completed"
                  @completed="syncProgress" />
               <StSpace v-else-if="selectedChapter" direction="vertical" gap="1.5rem" fill-x class="max-md:!gap-4">
                  <span class="inline-flex items-center gap-2 text-sm text-accent-300">
                     <BookOpen />
                     章节导读
                  </span>
                  <h1 class="text-2xl break-words max-md:-mt-1 max-md:text-xl">{{ selectedChapter.title }}</h1>
                  <ArticleBody v-if="selectedChapter.introduction" :html="html" class="w-full" />
                  <p v-else class="text-accent-300">
                     <span class="max-md:hidden">按左侧目录顺序开始本章学习。</span>
                     <span class="md:hidden">按目录顺序开始本章学习。</span>
                  </p>
                  <ChapterContents :chapter="selectedChapter" @select="selectSection" />
                  <div class="w-full border-t border-accent-500 pt-5 max-md:pt-4">
                     <StButton
                        size="sm"
                        bordered
                        class="w-full max-md:!py-2.5"
                        :disabled="!selectedChapter.sections.length"
                        @click="beginChapter">
                        {{ selectedChapter.completed ? '回顾本章' : '开始本章学习' }}
                     </StButton>
                  </div>
               </StSpace>
               <StSpace
                  v-if="selectedSection"
                  fill-x
                  align="center"
                  justify="between"
                  gap="1rem"
                  class="mt-6 border-t border-accent-500 pt-5 max-md:!gap-3 max-md:pt-4">
                  <StButton
                     size="sm"
                     bordered
                     class="max-md:flex-1 max-md:!py-2.5"
                     :disabled="!previousSection?.unlocked"
                     @click="previousSection && selectSection(previousSection.id)">
                     <ArrowLeft class="mr-2" />
                     上一节
                  </StButton>
                  <StButton
                     size="sm"
                     bordered
                     class="max-md:flex-1 max-md:!py-2.5"
                     :disabled="!nextSection?.unlocked"
                     @click="goNext">
                     下一节
                     <ArrowRight class="ml-2" />
                  </StButton>
               </StSpace>
            </template>
         </article>
      </div>

      <StDrawer v-if="course && !error" v-model:opened="directoryOpen" global fit width="24rem">
         <div class="flex max-h-[90dvh] flex-col pt-5">
            <div class="shrink-0 border-b border-accent-600 px-5 pb-3">
               <h2 class="line-clamp-2 text-lg leading-snug">{{ course.title }}</h2>
               <p class="mt-1 text-xs text-accent-300">已完成 {{ completedCount }}/{{ allSections.length }} 节</p>
            </div>
            <nav
               ref="directory-nav"
               aria-label="课程目录"
               class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
               <CourseDirectory
                  :chapters="chapters"
                  interactive
                  :show-progress-percentage="false"
                  :show-branches="false"
                  :show-chapter-badge="false"
                  :edge-padding="12"
                  :active-chapter-id="selectedChapter?.id"
                  :active-section-id="selectedSection?.id"
                  @chapter="selectChapter"
                  @section="selectSection" />
            </nav>
         </div>
      </StDrawer>
   </div>
</template>
