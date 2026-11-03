<script setup lang="ts">
import { BookOpen, Bookshelf, Time, Ghost } from '@icon-park/vue-next';

useSeoMeta({ title: '学习课程 - Quanta Challenge' });
const { $trpc } = useNuxtApp();
const { data, pending, error, refresh } = await useAsyncData('learning-courses', () =>
   $trpc.protected.learning.list.query({ limit: 12 }),
);
type Course = NonNullable<typeof data.value>['courses'][number];
const moreCourses = ref<Course[]>([]);
const nextCursor = ref<string | null>(null);
const loadingMore = ref(false);
const loadError = ref(false);
watch(data, (value) => {
   moreCourses.value = [];
   nextCursor.value = value?.nextCursor ?? null;
}, { immediate: true });
const courses = computed(() => [...(data.value?.courses ?? []), ...moreCourses.value]);

function formatStudyTime(minutes: number) {
   if (!minutes) return '待估算';
   const hours = Math.floor(minutes / 60);
   const remaining = minutes % 60;
   return `约 ${hours ? `${hours} 小时` : ''}${hours && remaining ? ' ' : ''}${remaining ? `${remaining} 分钟` : ''}`;
}

async function loadMore() {
   if (!nextCursor.value || loadingMore.value) return;
   loadingMore.value = true;
   loadError.value = false;
   try {
      const page = await $trpc.protected.learning.list.query({ cursor: nextCursor.value, limit: 12 });
      moreCourses.value.push(...page.courses);
      nextCursor.value = page.nextCursor;
   } catch {
      loadError.value = true;
   } finally {
      loadingMore.value = false;
   }
}
</script>

<template>
   <StSpace fill justify="center" class="overflow-auto">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full max-w-[61.75rem] px-4 pb-24 my-6 max-md:my-4">
         <h1 class="st-font-hero-bold max-md:text-[1.5rem] max-md:leading-[1.2]">
            学习课程
         </h1>

         <h2 class="text-xl font-bold max-md:text-lg">
            全部课程
         </h2>

         <StSkeleton :loading="pending" class="w-full">
            <template #loading>
               <div class="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
                  <StSkeletonItem
                     v-for="i in 3"
                     :key="i"
                     class="h-[7.5rem] w-full"
                     rounded="lg" />
               </div>
            </template>

            <StSpace
               v-if="error"
               direction="vertical"
               align="center"
               gap="1rem"
               class="w-full py-16 text-accent-300">
               <span>课程加载失败，请重试。</span>
               <StButton bordered size="sm" @click="refresh()">
                  重试
               </StButton>
            </StSpace>

            <StEmptyStatus
               v-else-if="!courses.length"
               content="暂无课程"
               class="min-h-[15rem]" />

            <div
               v-else
               class="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
               <NuxtLink
                  v-for="course in courses"
                  :key="course.id"
                  :to="`/app/learning/${course.id}`"
                  class="h-full rounded-xl focus-visible:outline-2 focus-visible:outline-secondary">
                  <StCard class="h-full !rounded-xl !p-3 transition-all hover:ring-secondary/50">
                     <template #header>
                        <span class="sr-only">{{ course.title }}</span>
                     </template>
                     <StSpace fill-x align="center" gap="1rem" class="min-w-0 flex-1">
                        <StImage
                           :src="course.coverImage ? `/api/static/${course.coverImage.name}` : ''"
                           :alt="`${course.title}封面`"
                           width="6rem"
                           height="6rem"
                           class="shrink-0 overflow-hidden rounded-lg">
                           <template #fallback="{ style }">
                              <StSpace
                                 fill
                                 center
                                 class="rounded-lg bg-accent-500 text-accent-300"
                                 :style="style">
                                 <BookOpen size="2rem" />
                              </StSpace>
                           </template>
                        </StImage>
                        <StSpace
                           direction="vertical"
                           justify="center"
                           gap="0.5rem"
                           class="min-w-0 flex-1">
                           <h3 class="line-clamp-2 font-bold">
                              {{ course.title }}
                           </h3>
                           <p class="st-font-caption h-10 w-full shrink-0 line-clamp-2 break-words leading-5 text-accent-300">
                              {{ course.summary || '暂无课程简介' }}
                           </p>
                           <StSpace
                              fill-x
                              align="center"
                              gap="1rem"
                              wrap
                              class="st-font-caption text-accent-300">
                              <StSpace align="center" gap="0.375rem">
                                 <Bookshelf aria-hidden="true" />
                                 <span>{{ course.chapters.length }} 章</span>
                              </StSpace>
                              <StSpace align="center" gap="0.375rem">
                                 <Time aria-hidden="true" />
                                 <span>{{ formatStudyTime(course.estimatedMinutes) }}</span>
                              </StSpace>
                              <StSpace
                                 align="center"
                                 gap="0.375rem"
                                 :class="{ 'text-success': course.enrolled }">
                                 <BookOpen aria-hidden="true" />
                                 <span>{{ course.enrolled ? '学习中' : '未开始' }}</span>
                              </StSpace>
                           </StSpace>
                        </StSpace>
                     </StSpace>
                  </StCard>
               </NuxtLink>
            </div>
         </StSkeleton>

         <StSpace v-if="nextCursor" direction="vertical" align="center" gap="0.5rem" fill-x>
            <span v-if="loadError" class="st-font-caption text-error">
               加载失败，请重试。
            </span>
            <StButton
               bordered
               :loading="loadingMore"
               @click="loadMore">
               加载更多
            </StButton>
         </StSpace>
         <div
            v-if="!pending && !error && courses.length > 0 && !nextCursor"
            class="flex h-[3.5rem] w-full shrink-0 items-center justify-center text-sm text-accent-400">
            <StSpace align="center" gap="0.4em">
               <Ghost theme="outline" size="1rem" />
               <span>暂时没有更多课程了～</span>
            </StSpace>
         </div>
      </StSpace>
   </StSpace>
</template>
