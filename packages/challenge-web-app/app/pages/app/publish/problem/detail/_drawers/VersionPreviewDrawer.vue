<script setup lang="ts">
import VersionItem from './VersionItem.vue';

const props = defineProps<{
   problemId?: number;
}>();

const opened = defineModel<boolean>('opened');

export type VersionsType = Awaited<
   ReturnType<typeof $trpc.admin.problem.getVersions.query>
>;
const versions = ref<VersionsType['versions']>();
const currentPid = ref<number>();
const { $trpc } = useNuxtApp();
const fetchProblemVersions = async () => {
   if (!props.problemId) return;
   const data = await atLeastTime(
      200,
      $trpc.admin.problem.getVersions.query({
         problemId: props.problemId,
      })
   );
   versions.value = data.versions;
   currentPid.value = data.currentPid;
};

let hasFetched = false;
watch(opened, (newVal) => {
   if (!newVal || hasFetched) return;
   hasFetched = true;
   fetchProblemVersions().catch((err) => {
      console.error(err);
      hasFetched = false;
   });
});

const refresh = () => {
   if (!hasFetched) return;
   fetchProblemVersions().catch((err) => {
      console.error(err);
      hasFetched = false;
   });
};
defineExpose({ refresh });
</script>

<template>
   <StDrawer global v-model:opened="opened" width="34rem">
      <StSpace direction="vertical" gap="1.5rem" class="p-6 text-white" fill>
         <h1 class="st-font-secondary-bold max-md:text-[1.25rem]!">
            审核记录
         </h1>
         <StSkeleton :loading="!versions?.length">
            <template #loading>
               <StSpace direction="vertical" gap="0.75rem">
                  <StSkeletonItem
                     v-for="i in 4"
                     :key="i"
                     class="h-[4.5rem] w-full rounded-lg" />
               </StSpace>
            </template>
            <StScrollable scroll-y fill-x>
               <StSpace fill-x direction="vertical" gap="0.75rem">
                  <NuxtLink
                     v-for="version in versions"
                     :key="version.pid"
                     :to="`/app/publish/problem/detail/${version.pid}`"
                     class="w-full">
                     <VersionItem
                        :version="version"
                        :view-pid="props.problemId!"
                        :current-pid="currentPid!" />
                  </NuxtLink>
               </StSpace>
            </StScrollable>
         </StSkeleton>
      </StSpace>
   </StDrawer>
</template>
