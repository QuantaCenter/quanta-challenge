<script setup lang="ts">
import { ArrowLeft, ArrowRight, BookOpen, Lock, CheckOne, MenuUnfold, MenuFold, LoadingFour } from '@icon-park/vue-next';
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

function selectChapter(chapterId: string) {
   selectionRequest++;
   switching.value = false;
   directoryOpen.value = false;
   return navigateTo({ path: route.path, query: { chapter: chapterId } });
}
async function selectSection(sectionId: string) {
   const request = ++selectionRequest;
   const courseId = id.value;
   const path = route.path;
   const source = route.fullPath;
   switching.value = true;
   try {
      const data = await sectionLoader.fetchSection(courseId, sectionId);
      if (request !== selectionRequest || id.value !== courseId || route.fullPath !== source) return;
      sectionLoader.prepare(courseId, sectionId, data);
      directoryOpen.value = false;
      await navigateTo({ path, query: { section: sectionId } });
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
      class="mx-auto my-6 w-full px-6 pb-24 xl:-translate-x-10 transition-[max-width] duration-500 ease-in-out motion-reduce:transition-none max-md:my-4 max-md:px-4"
      :class="directoryCollapsed ? 'md:max-w-[55rem]' : 'md:max-w-[78.5rem]'">
      <div class="mb-6 flex items-center gap-3">
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
            class="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-accent-300 transition-colors hover:bg-accent-500 hover:text-white focus-visible:outline-2 focus-visible:outline-primary md:inline-flex"
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
            class="min-w-0 transition-opacity duration-500 ease-in-out motion-reduce:transition-none md:sticky md:top-[6.5rem] md:overflow-hidden"
            :class="{ 'md:pointer-events-none md:opacity-0': directoryCollapsed }">
         <aside class="rounded-xl bg-accent-600 p-6 md:max-h-[calc(100vh-8rem)] md:w-[22rem] md:overflow-auto">
            <StSpace direction="vertical" gap="0.75rem" fill-x>
               <h2 class="text-xl">{{ course.title }}</h2>
               <StSpace fill-x align="center" justify="between" gap="0.5rem">
                  <span class="text-xs text-accent-300">已完成 {{ completedCount }}/{{ allSections.length }} 节</span>
                  <button
                     class="inline-flex items-center gap-1 text-xs text-accent-300 md:hidden"
                     :aria-expanded="directoryOpen"
                     aria-controls="study-directory"
                     @click="directoryOpen = !directoryOpen">
                     <MenuUnfold />
                     {{ directoryOpen ? '收起目录' : '展开目录' }}
                  </button>
               </StSpace>
               <nav id="study-directory" aria-label="课程目录" class="w-full" :class="{ 'max-md:hidden': !directoryOpen }">
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
         <article class="relative w-full min-w-0 max-w-[52rem] justify-self-center" :aria-busy="switching">
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
               <div v-if="finished" class="mb-6 flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success" role="status">
                  <CheckOne />
                  恭喜，已完成本课程！你可以继续回顾学习内容。
               </div>
               <StudySection
                  v-if="selectedSection"
                  :key="selectedSection.id"
                  :course-id="id"
                  :section-id="selectedSection.id"
                  :completed="selectedSection.completed"
                  @completed="syncProgress" />
               <StSpace v-else-if="selectedChapter" direction="vertical" gap="1.5rem" fill-x>
                  <span class="inline-flex items-center gap-2 text-sm text-accent-300">
                     <BookOpen />
                     章节导读
                  </span>
                  <h1 class="text-2xl">{{ selectedChapter.title }}</h1>
                  <ArticleBody v-if="selectedChapter.introduction" :html="html" class="w-full" />
                  <p v-else class="text-accent-300">按左侧目录顺序开始本章学习。</p>
                  <ChapterContents :chapter="selectedChapter" @select="selectSection" />
                  <div class="w-full border-t border-accent-500 pt-5">
                     <StButton
                        size="sm"
                        bordered
                        class="w-full"
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
                  class="mt-6 border-t border-accent-500 pt-5">
                  <StButton
                     size="sm"
                     bordered
                     :disabled="!previousSection?.unlocked"
                     @click="previousSection && selectSection(previousSection.id)">
                     <ArrowLeft class="mr-2" />
                     上一节
                  </StButton>
                  <StButton
                     size="sm"
                     bordered
                     :disabled="!nextSection?.unlocked"
                     @click="goNext">
                     下一节
                     <ArrowRight class="ml-2" />
                  </StButton>
               </StSpace>
            </template>
         </article>
      </div>
   </div>
</template>
