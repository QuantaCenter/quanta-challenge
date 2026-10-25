<script setup lang="tsx">
import {
   AuditFail,
   AuditPending,
   AuditSuccess,
} from './_components/AuditStatus';
import DataItem from './_components/DataItem.vue';
import FixedButton from './_components/FixedButton.vue';
import dayjs from 'dayjs';
import { NotPassed, Published, Unpublished } from './_components/PublishStatus';
import VersionPreviewDrawer from './_drawers/VersionPreviewDrawer.vue';
import SidePopper from './_components/SidePopper.vue';
import {
   Edit,
   Flag,
   HamburgerButton,
   Lock,
   Return,
   Unlock,
} from '@icon-park/vue-next';

const route = useRoute();
const id = route.params.id as string;
if (!id) {
   navigateTo('/app/publish/problem');
}

useSeoMeta({ title: computed(() => `发布详情 #${id} - Quanta Challenge`) });

const { $trpc } = useNuxtApp();
type DataType = Awaited<
   ReturnType<typeof $trpc.admin.problem.getAuditDetail.query>
>;
const detail = ref<DataType | null>(null);

const fetchPublishDetails = async () => {
   try {
      const data = await $trpc.admin.problem.getAuditDetail.query({
         problemId: Number(id),
      });
      detail.value = data;
   } catch (e: any) {
      navigateTo('/app/publish/problem');
   }
   // 轮询
   if (detail.value?.status === 'draft') {
      setTimeout(() => {
         fetchPublishDetails();
      }, 1000);
   }
};
onMounted(fetchPublishDetails);

const judgeCode = computed(() => {
   return detail.value?.JudgeFile[0]?.judgeScript ?? '';
});
const publishDate = computed(() => {
   const date = detail.value?.createdAt ?? '';
   return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
});
const failedReason = computed<string>(() => {
   if (detail.value?.status !== 'invalid') return '';
   const judgeRecord = detail.value?.TemplateJudgeRecord[0]?.judgeRecord;

   const isSomeJudgeFailed =
      Array.isArray(judgeRecord?.info) &&
      judgeRecord.info.some((i) => i.status !== 'pass');

   if (judgeRecord?.info.errorMessage) {
      // @ts-ignore
      return judgeRecord.info.errorMessage;
   } else if (isSomeJudgeFailed) {
      return `使用标准答案未能通过所有测试点，判题脚本可能有误。`;
   } else if (detail.value.totalScore !== judgeRecord?.score) {
      return `使用标准答案进行判题无法得到满分，总分应该为 ${detail.value.totalScore}，实际上为 ${judgeRecord?.score}。`;
   } else {
      return '';
   }
});
const judgeResult = computed(() => {
   const judgeRecord = detail.value?.TemplateJudgeRecord[0]?.judgeRecord;
   // @ts-ignore
   return judgeRecord
      ? judgeRecord?.result === 'pending'
         ? null
         : Array.isArray(judgeRecord?.info)
         ? judgeRecord?.info
         : null
      : null;
});
const AuditStatus = () => {
   if (detail.value?.status === 'draft') {
      return <AuditPending />;
   } else if (detail.value?.status === 'invalid') {
      return <AuditFail />;
   } else {
      return <AuditSuccess />;
   }
};
const PublishStatus = () => {
   if (detail.value?.status === 'published') {
      return <Published />;
   } else if (detail.value?.status === 'ready') {
      return <Unpublished />;
   } else {
      return <NotPassed />;
   }
};
const Difficulty = () => {
   if (detail.value?.difficulty === 'easy') {
      return <span class='text-success'>简单</span>;
   } else if (detail.value?.difficulty === 'medium') {
      return <span class='text-warning'>中等</span>;
   } else if (detail.value?.difficulty === 'hard') {
      return <span class='text-primary'>困难</span>;
   } else if (detail.value?.difficulty === 'very_hard') {
      return <span class='text-error'> 非常困难</span>;
   } else {
      return <span>未知</span>;
   }
};

const onSwitchPublishStatus = ref(false);
const handleSwitchPublishStatus = async () => {
   onSwitchPublishStatus.value = true;
   try {
      const switchStatus = $trpc.admin.problem.setStatus.mutate({
         problemId: Number(id),
         publish: detail.value?.status === 'published' ? false : true,
      });
      await atLeastTime(500, switchStatus);
      await fetchPublishDetails();
   } catch (e) {
      console.error(e);
   } finally {
      onSwitchPublishStatus.value = false;
   }
};

const onSetCurrentProblem = ref(false);
const versionPreviewDrawer = useTemplateRef('drawer');
const handleSetCurrentProblem = async () => {
   if (!detail.value) return;
   onSetCurrentProblem.value = true;
   try {
      const setProblem = $trpc.admin.problem.setCurrentProblem.mutate({
         problemId: detail.value.pid,
      });
      await atLeastTime(500, setProblem);
      await fetchPublishDetails();
      versionPreviewDrawer.value?.refresh();
   } catch (e) {
      console.error(e);
   } finally {
      onSetCurrentProblem.value = false;
   }
};

const switchButtonIcon = computed(() => {
   return detail.value?.status === 'published' ? Lock : Unlock;
});
const showSetCurrentButton = computed(() => {
   return Number(id) !== detail.value?.BaseProblem.currentPid;
});
const showSwitchButton = computed(() => {
   if (showSetCurrentButton.value) {
      return false;
   }
   const status = detail.value?.status;
   return status === 'published' || status === 'ready';
});

const handleEdit = () => {
   navigateTo(`/app/publish/problem?fromId=${id}`);
};

const handleReturn = () => {
   navigateTo('/app/publish/problem/mine');
};

const drawerOpener = ref(false);
const handlerViewVersion = () => {
   drawerOpener.value = true;
};
</script>

<template>
   <StSpace full justify="center" class="overflow-auto">
      <VersionPreviewDrawer
         ref="drawer"
         v-model:opened="drawerOpener"
         :problem-id="detail?.pid" />
      <StFixed right="1.82rem" bottom="1.82rem" class="max-md:hidden">
         <StSpace direction="vertical" gap="1.2rem" align="center">
            <SidePopper content="审核记录">
               <FixedButton
                  @click="handlerViewVersion"
                  :icon="HamburgerButton" />
            </SidePopper>
            <SidePopper v-if="showSetCurrentButton" content="设为当前版本">
               <FixedButton
                  @click="handleSetCurrentProblem"
                  :loading="onSetCurrentProblem"
                  :icon="Flag" />
            </SidePopper>
            <SidePopper
               v-if="showSwitchButton"
               :content="detail?.status === 'published' ? '取消发布' : '发布'">
               <FixedButton
                  @click="handleSwitchPublishStatus"
                  :loading="onSwitchPublishStatus"
                  :icon="switchButtonIcon" />
            </SidePopper>
            <SidePopper content="编辑">
               <FixedButton @click="handleEdit" :icon="Edit" />
            </SidePopper>
            <SidePopper content="返回">
               <FixedButton @click="handleReturn" :icon="Return" />
            </SidePopper>
         </StSpace>
      </StFixed>
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full max-w-[48rem] pb-[10rem] my-6 max-md:pb-6! max-md:my-4 max-md:px-4 max-md:gap-4!">
         <StSpace
            fill-x
            justify="between"
            align="center"
            class="flex-wrap gap-3!">
            <h1
               class="st-font-hero-bold max-md:text-[1.5rem] max-md:leading-[1.2]">
               发布详情
            </h1>
            <StSpace gap="1rem" align="center" class="md:hidden max-md:gap-2!">
               <SidePopper content="审核记录" placement="bottom">
                  <FixedButton
                     @click="handlerViewVersion"
                     :icon="HamburgerButton" />
               </SidePopper>
               <SidePopper
                  v-if="showSetCurrentButton"
                  content="设为当前版本"
                  placement="bottom">
                  <FixedButton
                     @click="handleSetCurrentProblem"
                     :loading="onSetCurrentProblem"
                     :icon="Flag" />
               </SidePopper>
               <SidePopper
                  v-if="showSwitchButton"
                  placement="bottom"
                  :content="detail?.status === 'published' ? '取消发布' : '发布'">
                  <FixedButton
                     @click="handleSwitchPublishStatus"
                     :loading="onSwitchPublishStatus"
                     :icon="switchButtonIcon" />
               </SidePopper>
               <SidePopper content="编辑" placement="bottom">
                  <FixedButton @click="handleEdit" :icon="Edit" />
               </SidePopper>
               <SidePopper content="返回" placement="bottom">
                  <FixedButton @click="handleReturn" :icon="Return" />
               </SidePopper>
            </StSpace>
         </StSpace>
         <StSpace
            direction="vertical"
            gap="2rem"
            fill-x
            class="p-4 rounded-lg border border-secondary">
            <!-- Raw 0 -->
            <StSpace
               fill-x
               justify="between"
               class="max-md:flex-col max-md:items-stretch max-md:gap-4!">
               <DataItem title="题目 ID">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSkeletonItem class="w-32 h-6" />
                     </template>
                     <span class="font-family-manrope">
                        {{ detail?.pid }}
                     </span>
                  </StSkeleton>
               </DataItem>
               <DataItem title="提交时间">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSkeletonItem class="w-32 h-6" />
                     </template>
                     <span class="font-family-manrope">
                        {{ publishDate }}
                     </span>
                  </StSkeleton>
               </DataItem>
            </StSpace>
            <!-- Raw 1 -->
            <StSpace
               fill-x
               justify="between"
               class="max-md:flex-col max-md:items-stretch max-md:gap-4!">
               <DataItem title="题目标题">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSkeletonItem class="w-32 h-6" />
                     </template>
                     {{ detail?.title }}
                  </StSkeleton>
               </DataItem>
               <DataItem title="题目总分">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSkeletonItem class="w-32 h-6" />
                     </template>
                     <span class="font-family-manrope">
                        {{ detail?.totalScore }}
                     </span>
                  </StSkeleton>
               </DataItem>
            </StSpace>
            <!-- Raw 2 -->
            <StSpace
               fill-x
               justify="between"
               class="max-md:flex-col max-md:items-stretch max-md:gap-4!">
               <DataItem title="发布状态">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSkeletonItem class="w-32 h-6" />
                     </template>
                     <PublishStatus />
                  </StSkeleton>
               </DataItem>
               <DataItem title="审核状态">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSkeletonItem class="w-32 h-6" />
                     </template>
                     <AuditStatus />
                  </StSkeleton>
               </DataItem>
            </StSpace>
            <!-- Raw 3 -->
            <StSpace
               fill-x
               justify="between"
               class="max-md:flex-col max-md:items-stretch max-md:gap-4!">
               <DataItem title="题目难度">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSkeletonItem class="w-32 h-6" />
                     </template>
                     <Difficulty />
                  </StSkeleton>
               </DataItem>
               <DataItem title="题目标签">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSpace gap="0.625rem">
                           <StSkeletonItem class="w-12 h-6" />
                           <StSkeletonItem class="w-12 h-6" />
                        </StSpace>
                     </template>
                     <StSpace class="font-light" gap="0.625rem">
                        <StTag
                           v-for="(item, idx) in detail?.tags ?? []"
                           :key="idx"
                           :content="item.name"
                           :color="item.color ?? undefined"
                           size="small" />
                     </StSpace>
                  </StSkeleton>
               </DataItem>
            </StSpace>
            <!-- Raw 4 -->
            <StSpace v-if="failedReason" fill-x justify="between">
               <DataItem title="失败原因" class="w-full">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSkeletonItem class="w-full h-64" />
                     </template>
                     <div
                        class="p-4 rounded-sm bg-accent-600 w-full font-normal font-family-fira-code">
                        <span class="text-error">{{ failedReason }}</span>
                     </div>
                  </StSkeleton>
               </DataItem>
            </StSpace>
            <!-- Raw 5 -->
            <StSpace
               fill-x
               justify="between"
               class="max-md:flex-col max-md:items-stretch max-md:gap-4!">
               <DataItem title="判题脚本" class="w-full">
                  <StSkeleton :loading="!detail">
                     <template #loading>
                        <StSkeletonItem class="w-full h-64" />
                     </template>
                     <div
                        class="p-4 rounded-sm bg-accent-600 w-full font-normal overflow-auto">
                        <StCodePreview :code="judgeCode" />
                     </div>
                  </StSkeleton>
               </DataItem>
            </StSpace>
            <!-- Raw 6 -->
            <StSpace fill-x justify="between" v-if="judgeResult">
               <DataItem title="审核详情" class="w-full font-normal">
                  <StJudgeResult :judge-result="judgeResult" />
               </DataItem>
            </StSpace>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
