<script setup lang="ts">
import type { ProblemDesignDocument } from '@challenge/judge-machine-agent/schemas';
import { DraftingCompass, LoaderCircle } from 'lucide-vue-next';
import DesignWorkbench from '~/components/problem-design/DesignWorkbench.vue';

definePageMeta({ key: (route) => route.path });

const route = useRoute();
const problemId = computed(() => String(route.params.problemId));
const embedded = computed(() => route.query.embed === '1');
const designPath = computed(() => `/design/${encodeURIComponent(problemId.value)}`);
const { data, status, error, refresh } = useFetch<{
   document: ProblemDesignDocument;
   title: string;
   viewer: { name: string; avatarUrl?: string } | null;
}>(() => `/api/problem-design/${encodeURIComponent(problemId.value)}`, {
   server: false,
   deep: false,
});

const title = computed(() => data.value?.title ? `${data.value.title} · 设计稿` : '设计稿');
const unavailable = computed(() => [403, 404].includes(error.value?.statusCode ?? 0));
const signedOut = computed(() => error.value?.statusCode === 401);
const statusActionClass = 'rounded-md border border-white/15 px-3 py-1.5 transition-colors hover:cursor-pointer hover:border-white/25 hover:bg-white/15 hover:text-white active:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

useSeoMeta({ title });
</script>

<template>
   <main class="flex h-dvh min-w-0 flex-col bg-[#171717] text-accent-100">
      <header
         v-if="!embedded"
         class="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 px-3 [@media(min-width:721px)]:h-14 [@media(min-width:721px)]:gap-3 [@media(min-width:721px)]:px-5">
         <DraftingCompass class="size-4 shrink-0 text-primary [@media(min-width:721px)]:size-[19px]" />
         <h1 class="min-w-0 truncate text-sm font-semibold" :title="title">{{ title }}</h1>
         <div class="ml-auto flex shrink-0 items-center gap-2">
            <FeedbackButton variant="toolbar" />
            <StAvatar
               v-if="data?.viewer"
               :url="data.viewer.avatarUrl"
               :title="data.viewer.name"
               class="shrink-0 [--design-avatar-size:1.5rem] [@media(min-width:721px)]:[--design-avatar-size:1.75rem]"
               size="var(--design-avatar-size)" />
         </div>
      </header>

      <StMessageProvider v-if="data?.document">
         <DesignWorkbench :design="data.document" />
      </StMessageProvider>
      <div v-else class="grid min-h-0 flex-1 place-items-center px-5 text-center text-sm">
         <div v-if="status === 'error'" class="grid justify-items-center gap-3" role="status">
            <DraftingCompass :size="26" class="text-accent-300" />
            <p class="font-semibold">{{ signedOut ? '请登录后查看设计稿' : unavailable ? '暂无可查看的设计稿' : '设计稿加载失败' }}</p>
            <NuxtLink
               v-if="signedOut"
               :to="{ path: '/auth/login', query: { redirect: designPath } }"
               :target="embedded ? '_top' : undefined"
               :class="statusActionClass"
            >
               前往登录
            </NuxtLink>
            <button
               v-else-if="!unavailable"
               type="button"
               :class="statusActionClass"
               @click="refresh()"
            >
               重新加载
            </button>
         </div>
         <p v-else class="flex items-center gap-2 text-accent-300" role="status">
            <LoaderCircle :size="17" class="animate-spin" />
            正在加载设计稿
         </p>
      </div>
   </main>
</template>
