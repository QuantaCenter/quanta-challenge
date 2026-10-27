import dayjs from 'dayjs';
import { useMessage } from '~/components/st/Message/use-message';
import type { ISelectOption } from '~/components/st/Select/type';
import { logger } from '~~/lib/logger';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.webp';

const PAGE_SIZE = 10;

/** 表格每页条数；页面用它作为骨架屏数量。 */
export const SUBMISSION_PAGE_SIZE = PAGE_SIZE;

export type ResultFilter = 'ALL' | 'pending' | 'success' | 'failed';

export const RESULT_OPTIONS: ISelectOption[] = [
  { label: '全部状态', value: 'ALL' },
  { label: '评测中', value: 'pending' },
  { label: '通过', value: 'success' },
  { label: '未通过', value: 'failed' },
];

/** 表格行：在接口返回的基础上补齐展示字段。 */
export interface SubmissionRow {
  id: number;
  displayName: string;
  userName: string;
  avatarUrl: string;
  problemPid: number;
  problemTitle: string;
  result: 'pending' | 'success' | 'failed';
  score: number;
  judgingTime: number;
  pendingTime: number;
  submittedAt: string;
}

/** 日期值（YYYY-MM-DD 或 YYYY-MM-DD HH:mm）转查询边界，整天 / 整分钟覆盖。 */
const toRangeBoundary = (value: string, endOfDay = false) => {
  if (!value) return undefined;
  const date = dayjs(value);
  if (!date.isValid()) return undefined;
  if (value.includes(' ')) {
    return (endOfDay ? date.endOf('minute') : date.startOf('minute')).toISOString();
  }
  return (endOfDay ? date.endOf('day') : date.startOf('day')).toISOString();
};

/**
 * 最近提交管理页的查询条件、列表与分页。
 */
export const useSubmissionManagement = () => {
  const { $trpc } = useNuxtApp();
  const message = useMessage();
  const runtimeConfig = useRuntimeConfig();
  const appBaseUrl = runtimeConfig.public.appBaseUrl;

  // 「已生效」的查询条件（防抖 / 转换后），Input 后缀是原始输入
  const userKeyword = ref('');
  const userKeywordInput = ref('');
  const problemKeyword = ref('');
  const problemKeywordInput = ref('');
  const result = ref<ResultFilter>('ALL');
  const startTimeInput = ref('');
  const endTimeInput = ref('');
  const page = ref(1);

  const { data, pending, error, refresh } = useAsyncData(
    'manage-submissions',
    () => {
      return atLeastTime(
        500,
        $trpc.admin.submission.getAllSubmissions.query({
          userKeyword: userKeyword.value || undefined,
          problemKeyword: problemKeyword.value || undefined,
          result: result.value === 'ALL' ? undefined : result.value,
          startTime: toRangeBoundary(startTimeInput.value),
          endTime: toRangeBoundary(endTimeInput.value, true),
          page: page.value,
          pageSize: PAGE_SIZE,
        }),
      );
    },
  );

  watch(
    error,
    (newError) => {
      if (newError) {
        logger.error(newError, '加载提交记录失败');
        message.error('提交记录加载失败', '请检查网络连接或稍后重试');
      }
    },
    { immediate: true },
  );

  // 首次加载显示骨架；翻页/筛选时保留旧数据，避免整张表闪一下
  const isInitialLoading = computed(() => pending.value && !data.value);
  const isRefreshing = computed(() => pending.value && !!data.value);

  /**
   * 任一查询条件变化都重新拉取；改筛选条件时把页码归 1，
   * 挂在 computed key 上 Vue 会合并同一 tick 内的多次改动。
   */
  const queryKey = computed(() =>
    [
      userKeyword.value,
      problemKeyword.value,
      result.value,
      startTimeInput.value,
      endTimeInput.value,
      page.value,
    ].join('|'),
  );
  watch(queryKey, () => refresh());

  const applyUserKeyword = useDebounceFn(() => {
    userKeyword.value = userKeywordInput.value.trim();
    page.value = 1;
  }, 300);
  watch(userKeywordInput, () => applyUserKeyword());

  const applyProblemKeyword = useDebounceFn(() => {
    problemKeyword.value = problemKeywordInput.value.trim();
    page.value = 1;
  }, 300);
  watch(problemKeywordInput, () => applyProblemKeyword());

  watch(result, () => {
    page.value = 1;
  });

  watch([startTimeInput, endTimeInput], () => {
    page.value = 1;
  });

  const clearFilters = () => {
    userKeywordInput.value = '';
    userKeyword.value = '';
    problemKeywordInput.value = '';
    problemKeyword.value = '';
    result.value = 'ALL';
    startTimeInput.value = '';
    endTimeInput.value = '';
    page.value = 1;
  };

  const total = computed(() => data.value?.total ?? 0);
  const totalPages = computed(() =>
    Math.max(1, Math.ceil(total.value / PAGE_SIZE)),
  );
  const isFiltering = computed(
    () =>
      !!userKeyword.value ||
      !!problemKeyword.value ||
      result.value !== 'ALL' ||
      !!startTimeInput.value ||
      !!endTimeInput.value,
  );

  const submissionList = computed<SubmissionRow[]>(() => {
    return (data.value?.submissions ?? []).map((submission) => ({
      id: submission.id,
      displayName: submission.user.displayName || submission.user.name || '--',
      userName: submission.user.name ?? '--',
      avatarUrl: submission.avatarUrl
        ? `${appBaseUrl}${submission.avatarUrl}`
        : DEFAULT_AVATAR_URL,
      problemPid: submission.problem.pid,
      problemTitle: submission.problem.title,
      result: submission.result,
      score: submission.score,
      judgingTime: submission.judgingTime,
      pendingTime: submission.pendingTime,
      submittedAt: dayjs(submission.createdAt).format('YYYY-MM-DD HH:mm:ss'),
    }));
  });

  return {
    // 查询条件
    userKeywordInput,
    problemKeywordInput,
    result,
    startTimeInput,
    endTimeInput,
    page,
    // 派生展示
    total,
    totalPages,
    isFiltering,
    isInitialLoading,
    isRefreshing,
    submissionList,
    // 选项
    resultOptions: RESULT_OPTIONS,
    // 操作
    clearFilters,
    refresh,
  };
};
