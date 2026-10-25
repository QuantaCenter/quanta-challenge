<script setup lang="tsx">
import {
  CheckSmall,
  CloseSmall,
  DocDetail,
  LoadingFour,
} from '@icon-park/vue-next';
import type { $Enums } from '@prisma/client';
import type { JsonValue } from '@prisma/client/runtime/library';
import dayjs from 'dayjs';
import { DataBlock, Divider, JudgeStatus } from '~/pages/challenge/_subpages/record/_components/DetailItems';
import CommitDetailSkeleton from '~/pages/challenge/_subpages/record/_skeletons/CommitDetailSkeleton.vue';
import JudgeResultSkeleton from '~/pages/challenge/_subpages/record/_skeletons/JudgeResultSkeleton.vue';
import { logger } from '~~/lib/logger';
import { useMessage } from '~/components/st/Message/use-message';

/** 管理端提交详情抽屉：界面与「判题详情」一致，但不展示排名 / 超越率。 */

const opened = defineModel<boolean>('opened', { required: true });

const props = defineProps<{
  /** 要查看的判题记录 ID，null 表示未选中 */
  recordId: number | null;
}>();

const { $trpc } = useNuxtApp();
const message = useMessage();
const runtimeConfig = useRuntimeConfig();
const appBaseUrl = runtimeConfig.public.appBaseUrl;

type SubmissionDetailType = {
  id: number;
  result: $Enums.JudgeResult;
  info: JsonValue;
  score: number;
  pendingTime: number;
  judgingTime: number;
  createdAt: string;
  problem: { pid: number; title: string };
  user: {
    name: string | null;
    displayName: string | null;
    avatar: { name: string } | null;
  };
};

const detail = ref<SubmissionDetailType | null>(null);
const loading = ref(false);
const lastRecordId = ref<number | null>(null);
const recordCache = new Map<number, SubmissionDetailType>();

const avatarUrl = computed(() => {
  const name = detail.value?.user.avatar?.name;
  return name ? `${appBaseUrl}/api/static/${name}` : undefined;
});

const formattedDate = computed(() => {
  if (!detail.value) return '';
  return dayjs(detail.value.createdAt).format('YYYY/MM/DD HH:mm:ss');
});

const judgeResult = computed<any>(() => {
  return detail.value
    ? detail.value.result === 'pending'
      ? null
      : Array.isArray(detail.value.info)
        ? detail.value.info
        : null
    : null;
});

/**
 * 判题失败时的原因（判题异常时调度器写入的是 { errorMessage } 对象，不是检查点数组）。
 */
const judgeErrorMessage = computed<string | null>(() => {
  if (!detail.value || detail.value.result === 'pending') return null;
  const info: any = detail.value.info;
  if (Array.isArray(info)) return null;
  if (info && typeof info === 'object') {
    return info.errorMessage || info.message || '判题服务返回了未知错误';
  }
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

const stopPolling = () => {
  if (pollingTimer !== null) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
};

let pollingTimer: ReturnType<typeof setTimeout> | null = null;

/** 显式标注返回类型，避免 tRPC 链路类型实例化过深（TS2589）。 */
const fetchDetail = (judgeRecordId: number): Promise<SubmissionDetailType> => {
  // @ts-ignore
  return $trpc.admin.submission.getSubmissionDetail.query({ judgeRecordId });
};

const getDetail = async () => {
  if (props.recordId === null) {
    stopPolling();
    detail.value = null;
    lastRecordId.value = null;
    return;
  }
  if (props.recordId === lastRecordId.value) return;
  stopPolling();
  lastRecordId.value = props.recordId;

  const cached = recordCache.get(props.recordId);
  if (cached && cached.result !== 'pending') {
    detail.value = cached;
    return;
  }

  loading.value = true;
  try {
    detail.value = await atLeastTime(500, fetchDetail(props.recordId));
  } catch (error) {
    logger.error(error, '加载提交详情失败');
    message.error('详情加载失败', '该提交记录可能已被删除');
    opened.value = false;
    loading.value = false;
    return;
  }
  loading.value = false;

  if (detail.value && detail.value.result !== 'pending') {
    recordCache.set(props.recordId, detail.value);
  } else if (detail.value?.result === 'pending') {
    // 轮询结果，抽屉关闭后停止
    let waitTime = 1000;
    const polling = async () => {
      if (!opened.value || props.recordId === null) return;
      const data = await fetchDetail(props.recordId);
      detail.value = data;
      if (data.result === 'pending') {
        waitTime *= 1.5;
        pollingTimer = setTimeout(polling, waitTime);
      } else {
        recordCache.set(props.recordId!, data);
      }
    };
    pollingTimer = setTimeout(polling, waitTime);
  }
};

watch(
  () => [props.recordId, opened.value] as const,
  ([recordId, isOpened]) => {
    if (isOpened) {
      getDetail();
    } else {
      stopPolling();
    }
  },
);

onUnmounted(stopPolling);
</script>

<template>
  <StDrawer v-model:opened="opened" global width="42rem">
    <div class="w-full h-full flex items-start justify-center">
      <div class="w-full max-w-[38rem] h-full relative overflow-auto hide-scrollbar pt-4">
        <StSkeleton :loading="loading">
          <template #loading>
            <CommitDetailSkeleton />
          </template>
          <StSpace
            v-if="detail"
            class="w-full max-w-[38rem] min-h-full absolute top-4 left-0 pb-8 max-md:top-10 max-md:left-4 max-md:right-4 max-md:w-auto"
            gap="1rem"
            direction="vertical">
            <StSpace
              fill-x
              justify="between"
              align="end">
              <StSpace gap="0.5rem" align="center" class="max-md:gap-0.5">
                <span class="st-font-third-bold text-warning max-md:text-[1.25rem]">
                  #{{ detail.id }}
                </span>
                <span class="st-font-third-normal max-md:text-[1.125rem] max-md:break-all">
                  {{ detail.problem.title }}
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
                <StAvatar size="2rem" :url="avatarUrl" />
                <div>
                  <span class="st-font-body-bold">
                    {{ detail.user.displayName || detail.user.name }}
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
                  <JudgeStatus :status="detail.result" />
                </DataBlock>
                <DataBlock title="最终得分">
                  {{ detail.score ?? '---' }}
                </DataBlock>
                <DataBlock title="判题耗时">
                  {{ detail.judgingTime ?? '---' }}ms
                </DataBlock>
                <DataBlock title="等待耗时">
                  {{ detail.pendingTime ?? '---' }}ms
                </DataBlock>
              </StSpace>
              <Divider />
              <StSpace fill-x direction="vertical" gap="1rem" class="st-selectable">
                <StSpace align="center" gap="0.25rem">
                  <DocDetail />
                  <span class="st-font-body-bold">判题详情</span>
                </StSpace>
                <JudgeResultSkeleton v-if="detail.result === 'pending'" />
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
    </div>
  </StDrawer>
</template>

<style src="@/assets/css/utils.css" scoped />
