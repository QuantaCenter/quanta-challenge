<script setup lang="ts">
import { ArrowLeft, BookOpen } from '@icon-park/vue-next';
import { useMessage } from '~/components/st/Message/use-message';
import ArticleBody from '~/components/learning/ArticleBody.vue';
import CourseDirectory from '~/components/learning/CourseDirectory.vue';
import { useMarkdown } from '~/composables/use-markdown';

const activeTab = ref('introduction');
const tabs = [
   { label: '导读', value: 'introduction' },
   { label: '目录', value: 'contents' },
];

const route = useRoute();
const { $trpc } = useNuxtApp();
const message = useMessage();
const enrolling = ref(false);
const id = computed(() => String(route.params.id));
watch(id, () => { activeTab.value = 'introduction'; });
const { data: course, pending, error, refresh } = await useAsyncData(
   () => `learning-course-${id.value}`,
   () => $trpc.protected.learning.get.query({ id: id.value }),
);
const { html: introductionHtml, update: renderIntroduction } = useMarkdown({ codeHeader: true });
watch(
   () => course.value?.description || course.value?.summary || '暂无课程导读。',
   (content) => renderIntroduction(content),
   { immediate: true },
);
useSeoMeta({ title: () => course.value ? `${course.value.title} - 学习课程 - Quanta Challenge` : '课程简介 - Quanta Challenge' });
const totalSections = computed(() => course.value?.chapters.reduce(
   (sum, chapter) => sum + chapter.stages.reduce((n, stage) => n + stage._count.sections, 0), 0,
) ?? 0);
const directoryChapters = computed(() => {
   const completed = new Set(course.value?.completedSectionIds ?? []);
   return (course.value?.chapters ?? []).map(chapter => ({
      id: chapter.id,
      title: chapter.title,
      sections: chapter.stages.flatMap(stage => stage.sections).map(section => ({
         ...section,
         completed: completed.has(section.id),
      })),
   }));
});
// 与课程列表采用相同估算：文章 5 分钟，实践题 30 分钟。
const estimatedMinutes = computed(() => course.value?.chapters.reduce(
   (total, chapter) => total + chapter.stages.reduce(
      (sum, stage) => sum + stage.sections.reduce(
         (minutes, section) => minutes + (section.type === 'article' ? 5 : 30), 0,
      ), 0,
   ), 0,
) ?? 0);

async function enroll() {
   if (!course.value || course.value.enrolled || enrolling.value) return;
   const courseId = course.value.id;
   enrolling.value = true;
   try {
      await $trpc.protected.learning.enroll.mutate({ id: courseId });
      if (course.value?.id === courseId) course.value.enrolled = true;
      void refreshNuxtData('learning-courses');
      message.success('已获取课程');
   } catch (error) {
      message.error('获取课程失败', error instanceof Error ? error.message : '请稍后重试');
   } finally {
      enrolling.value = false;
   }
}
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full max-w-[68rem] px-4 pb-24 my-6 max-md:my-4">
         <NuxtLink
            to="/app/learning"
            class="inline-flex w-fit items-center gap-2 text-accent-300 transition-colors hover:text-white">
            <ArrowLeft />
            <span>返回课程列表</span>
         </NuxtLink>

         <StSkeleton :loading="pending" class="w-full">
            <template #loading>
               <StSpace direction="vertical" gap="1rem" fill-x>
                  <StSkeletonItem class="h-[14rem] w-full" rounded="lg" />
                  <StSkeletonItem class="h-[12rem] w-full" rounded="lg" />
               </StSpace>
            </template>

            <StSpace
               v-if="error || !course"
               direction="vertical"
               align="center"
               gap="1rem"
               class="w-full py-16 text-accent-300">
               <span>无法加载课程，请重试。</span>
               <StButton bordered size="sm" @click="refresh()">
                  重试
               </StButton>
            </StSpace>

            <div v-else class="grid w-full grid-cols-[minmax(0,1fr)_20rem] items-start gap-6 max-lg:grid-cols-1">
               <StSpace direction="vertical" fill-x gap="2rem" class="min-w-0">
                  <StSpace
                     fill-x
                     align="center"
                     gap="1.5rem"
                     class="max-md:flex-col max-md:!items-start">
                     <div
                        data-testid="course-cover"
                        class="shrink-0 rounded-xl shadow-[0_4px_18px_rgba(229,229,229,0.22)] transition-all duration-500 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_8px_28px_rgba(229,229,229,0.34)] motion-reduce:translate-none motion-reduce:scale-none motion-reduce:transition-none">
                        <StImage
                           :src="course.coverImage ? `/api/static/${course.coverImage.name}` : ''"
                           :alt="`${course.title}封面`"
                           width="12rem"
                           height="12rem"
                           class="overflow-hidden rounded-xl">
                           <template #fallback="{ style }">
                              <StSpace
                                 fill
                                 center
                                 class="rounded-xl bg-accent-600 text-accent-300"
                                 :style="style">
                                 <BookOpen size="2rem" />
                              </StSpace>
                           </template>
                        </StImage>
                     </div>
                     <StSpace
                        direction="vertical"
                        gap="0.75rem"
                        class="min-h-[12rem] min-w-0 flex-1 max-md:min-h-0">
                        <h1 class="text-2xl font-medium leading-snug">
                           {{ course.title }}
                        </h1>
                        <p class="st-font-body-normal line-clamp-2 w-full break-words leading-relaxed text-accent-300">
                           {{ course.summary || '暂无课程简介' }}
                        </p>
                        <StButton
                           :loading="enrolling"
                           class="mt-auto !px-5 !py-1.5 max-md:mt-2"
                           @click="course.enrolled ? navigateTo(`/app/learning/study/${id}`) : enroll()">
                           {{ course.enrolled ? '开始学习' : '获取课程' }}
                        </StButton>
                     </StSpace>
                  </StSpace>

                  <StTabs v-model="activeTab" :options="tabs" />

                  <div
                     class="w-full rounded-xl bg-accent-600 p-6">
                     <section
                        v-if="activeTab === 'introduction'"
                        aria-label="课程导读"
                        class="min-h-[12rem]">
                        <ArticleBody :html="introductionHtml" />
                     </section>
                     <section
                        v-else
                        aria-label="课程目录"
                        class="min-h-[12rem]">
                        <CourseDirectory :chapters="directoryChapters" :show-progress-percentage="false" />
                     </section>
                  </div>
               </StSpace>
               <aside aria-label="课程信息与推荐" class="flex min-w-0 flex-col gap-6">
                  <div class="rounded-xl bg-accent-600 px-3 py-5">
                  <dl class="grid grid-cols-3 gap-3 text-center">
                     <div>
                        <dt class="text-xs text-accent-300">章节/子节</dt>
                        <dd class="mt-2 text-xl font-bold font-family-manrope tabular-nums">
                           {{ course.chapters.length }}/{{ totalSections }}
                        </dd>
                     </div>
                     <div>
                        <dt class="whitespace-nowrap text-xs text-accent-300">预期学习时间</dt>
                        <dd class="mt-2 text-xl font-bold font-family-manrope tabular-nums">
                           {{ estimatedMinutes }}
                           <span class="text-xs font-normal">分钟</span>
                        </dd>
                     </div>
                     <div>
                        <dt class="text-xs text-accent-300">学习状态</dt>
                        <dd class="mt-2 text-sm font-medium leading-7" :class="course.enrolled ? 'text-success' : 'text-accent-200'">
                           {{ course.enrolled ? '学习中' : '未开始' }}
                        </dd>
                     </div>
                  </dl>
                  </div>
                  <section aria-label="推荐课程">
                     <h2 class="mb-4 text-base font-medium">推荐课程</h2>
                     <StSpace
                        v-if="course.recommendations.length"
                        direction="vertical"
                        gap="1rem"
                        fill-x>
                        <NuxtLink
                           v-for="item in course.recommendations"
                           :key="item.id"
                           :to="`/app/learning/${item.id}`"
                           class="group flex w-full items-center gap-3 rounded-xl bg-accent-600 p-3 transition-colors hover:bg-accent-500 focus-visible:outline-2 focus-visible:outline-primary">
                           <StImage
                              :src="item.coverImage ? `/api/static/${item.coverImage.name}` : ''"
                              :alt="`${item.title}封面`"
                              width="5rem"
                              height="5rem"
                              class="shrink-0 overflow-hidden rounded-lg">
                              <template #fallback="{ style }">
                                 <StSpace center class="rounded-lg bg-accent-500 text-accent-300" :style="style">
                                    <BookOpen size="1.5rem" />
                                 </StSpace>
                              </template>
                           </StImage>
                           <StSpace direction="vertical" gap="0.25rem" class="min-w-0 flex-1">
                              <h3 class="line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary">
                                 {{ item.title }}
                              </h3>
                              <p class="line-clamp-2 text-xs leading-relaxed text-accent-300">
                                 {{ item.summary || '暂无课程简介' }}
                              </p>
                           </StSpace>
                        </NuxtLink>
                     </StSpace>
                     <p v-else class="st-font-caption text-accent-300">暂无其他课程</p>
                  </section>
               </aside>
            </div>
         </StSkeleton>
      </StSpace>
   </StSpace>
</template>
