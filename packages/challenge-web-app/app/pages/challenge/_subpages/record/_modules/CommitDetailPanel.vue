<script setup lang="tsx">
import {
   CheckSmall,
   CloseSmall,
   DocDetail,
   LoadingFour,
} from '@icon-park/vue-next';
import {
   type CommitDetailType,
   type CommitRecordType,
   type IRank,
} from '../_types/shared-types';
import dayjs from 'dayjs';
import { DataBlock, Divider, JudgeStatus } from '../_components/DetailItems';
import CommitDetailSkeleton from '../_skeletons/CommitDetailSkeleton.vue';
import JudgeResultSkeleton from '../_skeletons/JudgeResultSkeleton.vue';

const props = defineProps<{
   problemId: number;
}>();

const loading = ref(false);
const { $trpc } = useNuxtApp();
const detail = ref<CommitDetailType | null>(null);
const lastRecordId = ref<number | null>(null);
const recordCache = new Map<number, CommitDetailType>();
const aheadCache = new Map<number, string>();
const recordId = ref<number | null>(null);

const commitEmitter = useEventBus<number>('challenge-commit');
commitEmitter.on((id) => {
   // 提交后清空缓存
   recordCache.clear();
   aheadCache.clear();
   // 重新获取详情和排名
   recordId.value = id;
   getDetail();
   getRank();
});

const commitRecordSelectEmitter = useEventBus<CommitRecordType, boolean>(
   'commit-record-select'
);
commitRecordSelectEmitter.on((record, init) => {
   if (!record) return;
   recordId.value = record.id;
   if (!init) {
      getDetail();
      getRank();
   }
});

const getDetail = async () => {
   if (recordId.value === null) {
      detail.value = null;
      return;
   }
   if (recordId.value === lastRecordId.value) return;
   lastRecordId.value = recordId.value;

   if (recordCache.has(recordId.value)) {
      detail.value = recordCache.get(recordId.value)!;
      return;
   }

   loading.value = true;
   // @ts-ignore
   detail.value = await atLeastTime(
      500,
      $trpc.protected.problem.getCommitRecordDetail.query({
         judgeRecordId: recordId.value,
      })
   );
   loading.value = false;

   if (detail.value && detail.value.result !== 'pending') {
      recordCache.set(recordId.value, detail.value);
   } else if (detail.value?.result === 'pending') {
      // 轮询结果
      let waitTime = 1000;
      const polling = async () => {
         const data = await $trpc.protected.problem.getCommitRecordDetail.query(
            { judgeRecordId: recordId.value! }
         );
         // @ts-ignore
         detail.value = data;
         if (data.result === 'pending') {
            waitTime *= 1.5;
            setTimeout(polling, waitTime);
         } else {
            recordCache.set(recordId.value!, detail.value!);
            getRank();
         }
      };
      setTimeout(polling, waitTime);
   }
};

const rank = ref<IRank[]>([]);
const ahead = ref('--%');
const getRank = async () => {
   if (recordId.value === null || detail.value?.result !== 'success') {
      rank.value = [];
      return;
   }

   const getRank = $trpc.protected.rank.getProblemScoreIntervals.query({
      problemId: props.problemId,
   });

   const getAhead = aheadCache.get(recordId.value)
      ? Promise.resolve(aheadCache.get(recordId.value)!)
      : $trpc.protected.rank.getMyRankInProblem
           .query({ recordId: recordId.value })
           .then(({ aheadRate }) => {
              const res = (aheadRate * 100).toFixed(2) + '%';
              aheadCache.set(recordId.value!, res);
              return res;
           })
           .catch(() => '--%');

   [rank.value, ahead.value] = await Promise.all([getRank, getAhead]);
};

const fetchData = () => {
   getDetail();
   getRank();
};
onMounted(() => {
   const dispose = watchEffect(fetchData);
   onUnmounted(dispose);
});

const showChart = computed(() => {
   return detail.value?.result === 'success' && detail.value.score !== null;
});

const formattedDate = computed(() => {
   if (!detail.value) return '';
   return dayjs(detail.value.createdAt).format('YYYY/MM/DD HH:mm:ss');
});

const judgeResult = computed<any>(() => {
   // @ts-ignore
   return detail.value
      ? detail.value?.result === 'pending'
         ? null
         : Array.isArray(detail.value?.info)
         ? detail.value?.info
         : null
      : null;
});

/**
 * 判题失败时的原因。
 *
 * 判题异常时调度器写入的是对象 { errorMessage }，而不是检查点数组；
 * 原先只判断 Array.isArray，导致这种情况落到 null，判题详情区域渲染为空白——
 * 用户只看到"未通过"却没有任何原因，无法判断是自己代码的问题还是平台故障。
 */
const judgeErrorMessage = computed<string | null>(() => {
   if (!detail.value || detail.value.result === 'pending') return null;
   const info: any = detail.value?.info;
   if (Array.isArray(info)) return null;
   if (info && typeof info === 'object') {
      return info.errorMessage || info.message || '判题服务返回了未知错误';
   }
   // 既没有检查点数组、也没有可读错误对象：给出兜底文案，
   // 否则下方渲染分支会退回骨架屏，看起来像"永远在判题中"。
   return '判题未返回有效结果';
});

const StatusIcon = () => {
   if (detail.value?.result === 'success') {
      return <CheckSmall class='text-success' size='20' />;
   } else if (detail.value?.result === 'failed') {
      return <CloseSmall class='text-error' size='20' />;
   } else {
      return <LoadingFour class='animate-spin text-warning' size='20' />;
   }
};
</script>

<template>
   <StSpace
      direction="vertical"
      fill
      align="center"
      class="bg-[#1C1C1C] rounded-xl p-4">
      <div class="w-[38rem] h-full relative overflow-auto hide-scrollbar">
         <StSkeleton :loading="loading || !detail">
            <template #loading>
               <CommitDetailSkeleton />
            </template>
            <StSpace
               class="w-[38rem] min-h-full absolute top-0 left-0 mt-1"
               gap="1rem"
               direction="vertical">
               <StSpace
                  fill-x
                  justify="between"
                  align="end"
                  class="bg-accent-[#1C1C1C]">
                  <StSpace gap="0.5rem" align="end">
                     <span class="st-font-third-bold text-warning">
                        #{{ recordId }}
                     </span>
                     <span class="st-font-third-normal">
                        {{ detail?.problem.title }}
                     </span>
                  </StSpace>
                  <StatusIcon />
               </StSpace>
               <StSpace
                  fill-x
                  class="py-4 px-5 rounded-[0.375rem] border border-secondary relative z-10"
                  direction="vertical"
                  gap="1.5rem">
                  <StSpace fill-x gap="0.75rem" align="center">
                     <StAvatar size="2rem" />
                     <div>
                        <span class="st-font-body-bold">
                           {{ detail?.user.name }}
                        </span>
                        <span class="st-font-body-normal text-accent-300">
                           提交于
                        </span>
                        <span class="font-family-manrope">
                           {{ formattedDate }}
                        </span>
                     </div>
                  </StSpace>
                  <StSpace fill-x align="center">
                     <DataBlock title="提交状态">
                        <JudgeStatus :status="detail?.result!" />
                     </DataBlock>
                     <DataBlock title="最终得分">
                        {{ detail?.score ?? '---' }}
                     </DataBlock>
                     <DataBlock title="判题耗时">
                        {{ detail?.judgingTime ?? '---' }}ms
                     </DataBlock>
                     <DataBlock title="等待耗时">
                        {{ detail?.pendingTime ?? '---' }}ms
                     </DataBlock>
                  </StSpace>
                  <Divider />
                  <StSpace
                     v-if="showChart"
                     fill-x
                     direction="vertical"
                     class="h-[14rem] px-4"
                     gap="0.5rem">
                     <h2 class="st-font-body-bold text-white">
                        总得分
                        <span class="font-family-manrope text-secondary">
                           {{ detail?.score ?? '--' }}
                        </span>
                        ，超过
                        <span class="font-family-manrope text-primary">
                           {{ ahead }}
                        </span>
                        的提交者
                     </h2>
                     <StRankingChart
                        :rank="rank"
                        :current-score="detail?.score" />
                  </StSpace>
                  <Divider v-if="showChart" />
                  <StSpace fill-x direction="vertical" gap="1rem" class="st-selectable">
                     <StSpace align="center" gap="0.25rem">
                        <DocDetail />
                        <span class="st-font-body-bold">判题详情</span>
                     </StSpace>
                     <JudgeResultSkeleton v-if="detail?.result === 'pending'" />
                     <JudgeResultSkeleton v-else-if="!judgeResult && !judgeErrorMessage" />
                     <StJudgeResult v-else-if="judgeResult" :judge-result="judgeResult" />
                     <div
                        v-else
                        class="w-full rounded-[0.375rem] border border-error/40 bg-error/5 px-4 py-3">
                        <p class="st-font-body-bold text-error mb-1">
                           判题未能完成
                        </p>
                        <p class="st-font-caption text-accent-200 break-all">
                           {{ judgeErrorMessage }}
                        </p>
                        <p class="st-font-caption text-accent-400 mt-2">
                           如果是平台原因（如判题服务未就绪、超时），请稍后重试或联系管理员；
                           若是超时，请检查代码是否存在死循环或长时间未渲染的页面。
                        </p>
                     </div>
                  </StSpace>
               </StSpace>
            </StSpace>
         </StSkeleton>
      </div>
   </StSpace>
</template>

<style src="@/assets/css/utils.css" scoped />
