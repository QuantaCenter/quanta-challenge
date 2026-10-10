<script setup lang="tsx">
import StSpace from '~/components/st/Space/index.vue';
import { CheckOne, CloseOne, LoadingFour } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import CommitRecordSkeleton from '../_skeletons/CommitRecordSkeleton.vue';
import type { CommitRecordType } from '../_types/shared-types';
import { useLearningVisits } from '~/composables/use-learning-visits';

const props = defineProps<{ id: number }>();

const { $trpc } = useNuxtApp();

const getRecords = async () => {
   if (!props.id || isNaN(props.id)) {
      throw new Error('Problem ID is required');
   }
   return await $trpc.protected.problem.getAllCommitRecords.query({
      problemId: props.id,
   });
};
const { data: records, refresh } = await useAsyncData(
   'commit-records',
   getRecords
);

// 有提交记录 = 这道题做过了：写下题号，文章里的题目块与「最近学习」据此显示完成
const visits = useLearningVisits();
watch(
   [records, () => props.id],
   async ([list, pid]) => {
      if (import.meta.server || !list?.length || !pid) return;
      try {
         const info = await $trpc.public.learning.problemByPid.query({ pid });
         if (info?.baseId) visits.markSolved(info.baseId);
      } catch {
         // 解析失败就当没记录，不影响页面
      }
   },
   { immediate: true },
);

const loading = computed(() => !records.value);

const hasPending = computed(
   () =>
      !records.value ||
      records.value.some((record) => record.result === 'pending')
);

const startPolling = async () => {
   let waitTime = 1000;
   const polling = async () => {
      await refresh();
      if (hasPending.value) {
         waitTime *= 1.5;
         setTimeout(polling, waitTime);
      }
   };
   if (hasPending.value) {
      setTimeout(polling, waitTime);
   }
};

onMounted(startPolling);

const commitEmitter = useEventBus<number>('challenge-commit');
commitEmitter.on((id) => {
   // 提交后重新获取记录
   refresh().then(() => {
      const record =
         records.value?.find((r) => r.id === id) ?? records.value![0]!;
      selectRecord(record);
      startPolling();
   });
});

const currentComponent = inject<Ref<'editor' | 'record'> | undefined>(
   'currentComponent',
   undefined
)!;
watch(currentComponent, async (newVal) => {
   const opened = newVal === 'record';
   if (opened && !loading.value) {
      records.value = await getRecords();
      selectedRecord.value = records.value[0] ?? null;
      recordSelectEmitter.emit(selectedRecord.value!, true);
   }
});

const CommitRecord = ({
   record,
   selected,
}: {
   record: CommitRecordType;
   selected?: boolean;
}) => {
   const Icon =
      record.result === 'pending'
         ? LoadingFour
         : record.result === 'failed'
         ? CloseOne
         : CheckOne;

   const text =
      record.result === 'pending'
         ? '评测中...'
         : record.result === 'failed'
         ? '评测未通过'
         : '评测通过';

   const colorClass =
      record.result === 'pending'
         ? 'text-warning'
         : record.result === 'failed'
         ? 'text-error'
         : 'text-success';

   const formattedDate = dayjs(record.createdAt).format('YYYY/MM/DD HH:mm:ss');

   return (
      <StSpace
         fill-x
         class={[
            'px-3 py-2 rounded-lg transition-colors duration-100 hover:bg-accent-600 cursor-pointer',
            selected ? 'bg-accent-600' : '',
         ]}
         gap='0.5rem'
         align='center'>
         <Icon
            size='1.25rem'
            class={[
               colorClass,
               { 'animate-spin': record.result === 'pending' },
            ]}
         />
         <StSpace direction='vertical' gap='0.1rem'>
            <div class={['st-font-caption !font-bold', colorClass]}>{text}</div>
            <div class='text-accent-200 text-sm !font-family-manrope font-light'>
               {formattedDate}
            </div>
         </StSpace>
      </StSpace>
   );
};

const recordSelectEmitter = useEventBus<CommitRecordType, boolean>(
   'commit-record-select'
);

const selectedRecord = ref<CommitRecordType | null>(records.value?.[0] ?? null);
recordSelectEmitter.emit(selectedRecord.value!, true);
const selectRecord = (record: CommitRecordType) => {
   selectedRecord.value = record;
};

watch(selectedRecord, (newRecord) => {
   if (newRecord) {
      recordSelectEmitter.emit(newRecord);
   }
});
</script>

<template>
   <StSpace
      direction="vertical"
      fill
      class="bg-[#1C1C1C] rounded-xl p-3"
      gap="1rem">
      <StSpace
         fill-x
         justify="between"
         align="center"
         class="text-accent-200"
         gap="0">
         <h2 class="st-font-body-normal overflow-ellipsis line-clamp-1">
            提交记录
         </h2>
      </StSpace>
      <StSpace fill class="relative overflow-auto hide-scrollbar">
         <StSpace
            direction="vertical"
            fill
            gap="0.5rem"
            class="absolute left-0 top-0">
            <StSkeleton :loading="loading">
               <template #loading>
                  <CommitRecordSkeleton />
               </template>
               <CommitRecord
                  v-for="record in records"
                  @click="selectRecord(record)"
                  :selected="selectedRecord?.id === record.id"
                  :key="record.createdAt"
                  :record="record" />
            </StSkeleton>
         </StSpace>
      </StSpace>
   </StSpace>
</template>

<style src="@/assets/css/utils.css" scoped />
