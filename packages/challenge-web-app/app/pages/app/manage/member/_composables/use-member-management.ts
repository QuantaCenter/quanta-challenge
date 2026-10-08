import dayjs from 'dayjs';
import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import type { ISelectOption } from '~/components/st/Select/type';
import useAuthStore from '~/stores/auth-store';
import { logger } from '~~/lib/logger';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.png';
import {
   ROLE_META,
   ROLE_OPTIONS,
   SORT_FIELDS,
   isRoleValue,
   type RoleFilter,
   type SortBy,
   type SortOrder,
   type UserRole,
} from '../_utils/roles';

const PAGE_SIZE = 20;

/** 表格每页条数；页面用它作为骨架屏数量。 */
export const MEMBER_PAGE_SIZE = PAGE_SIZE;

/** 表格行：在接口返回的基础上补齐展示字段（头像地址、角色元信息、格式化时间等）。 */
export interface MemberRow {
   id: string;
   name: string;
   role: UserRole;
   displayName: string;
   avatarUrl: string;
   roleMeta: { text: string; color: string };
   activeAt: string;
   lastLogin: string;
   lastSubmissionAt: string;
   recent7: number;
   recent30: number;
   submissionCount: number;
   score: number | null;
   correctRate: number | null;
}

/**
 * 成员管理页的查询条件、列表与行内操作。
 */
export const useMemberManagement = () => {
   const { $trpc } = useNuxtApp();
   const message = useMessage();
   const authStore = useAuthStore();
   const runtimeConfig = useRuntimeConfig();
   const appBaseUrl = runtimeConfig.public.appBaseUrl;

   // 查询条件：keyword 是「已生效」的关键词（输入防抖后才写入）
   const keyword = ref('');
   const keywordInput = ref('');
   const role = ref<RoleFilter>('ALL');
   const sortBy = ref<SortBy>('lastActiveAt');
   const sortOrder = ref<SortOrder>('desc');
   const page = ref(1);

   const sortFieldOptions: ISelectOption[] = SORT_FIELDS.map((field) => ({
      label: field.label,
      value: field.value,
   }));
   const roleLabel = computed(
      () =>
         ROLE_OPTIONS.find((option) => option.value === role.value)?.label ??
         '全部角色',
   );
   const sortFieldLabel = computed(
      () =>
         SORT_FIELDS.find((field) => field.value === sortBy.value)?.label ??
         '活跃时间',
   );
   const sortOrderTip = computed(() =>
      sortOrder.value === 'desc'
         ? '当前降序（新→旧 / 高→低），点击切换升序'
         : '当前升序（旧→新 / 低→高），点击切换降序',
   );

   const toggleSortOrder = () => {
      sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
      page.value = 1;
   };

   const { data, pending, error, refresh } = useAsyncData(
      'manage-members',
      () => {
         return $trpc.admin.user.getAllMembers.query({
            keyword: keyword.value || undefined,
            role: role.value === 'ALL' ? undefined : role.value,
            sortBy: sortBy.value,
            sortOrder: sortOrder.value,
            page: page.value,
            pageSize: PAGE_SIZE,
         });
      },
   );

   watch(
      error,
      (newError) => {
         if (newError) {
            logger.error(newError, '加载成员列表失败');
            message.error('成员加载失败', '请检查网络连接或稍后重试');
         }
      },
      { immediate: true },
   );

   // 首次加载显示骨架；翻页/筛选时保留旧数据，避免整张表闪一下
   const isInitialLoading = computed(() => pending.value && !data.value);
   const isRefreshing = computed(() => pending.value && !!data.value);

   /**
    * 任一查询条件变化都重新拉取。
    * 用 key 而不是 refresh() 直接挂在每个 watch 上：改筛选条件时要同时把页码归 1，
    * 挂在 computed 上 Vue 会把同一 tick 内的多次改动合并成一次请求。
    */
   const queryKey = computed(() =>
      [keyword.value, role.value, sortBy.value, sortOrder.value, page.value].join(
         '|',
      ),
   );
   watch(queryKey, () => refresh());

   const applyKeyword = useDebounceFn(() => {
      keyword.value = keywordInput.value.trim();
      page.value = 1;
   }, 300);
   watch(keywordInput, () => applyKeyword());

   watch([role, sortBy], () => {
      page.value = 1;
   });

   const clearKeyword = () => {
      keywordInput.value = '';
      keyword.value = '';
      page.value = 1;
   };

   const total = computed(() => data.value?.total ?? 0);
   const totalPages = computed(() =>
      Math.max(1, Math.ceil(total.value / PAGE_SIZE)),
   );
   const isFiltering = computed(() => !!keyword.value || role.value !== 'ALL');

   const formatDateTime = (value: string | Date | null) => {
      return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '';
   };

   const memberList = computed<MemberRow[]>(() => {
      return (data.value?.members ?? []).map((member) => ({
         id: member.id,
         name: member.name,
         role: member.role,
         displayName: member.displayName || member.name,
         avatarUrl: member.avatarUrl
            ? `${appBaseUrl}${member.avatarUrl}`
            : DEFAULT_AVATAR_URL,
         roleMeta: ROLE_META[member.role],
         activeAt: formatDateTime(member.lastActiveAt),
         lastLogin: formatDateTime(member.lastLogin),
         lastSubmissionAt: formatDateTime(member.lastSubmissionAt),
         recent7:
            member.recentSubmissions.find((item) => item.days === 7)?.count ?? 0,
         recent30:
            member.recentSubmissions.find((item) => item.days === 30)?.count ?? 0,
         submissionCount: member.submissionCount,
         score: member.score,
         correctRate: member.correctRate,
      }));
   });

   const isSelf = (row: MemberRow) => row.id === authStore.user?.id;

   /** 角色下拉只给超级管理员看，且不能改自己 */
   const canSwitchRole = (row: MemberRow) => {
      return authStore.user?.role === 'SUPER_ADMIN' && !isSelf(row);
   };

   /** 与后端 resetPassword 的权限判断保持一致：超级管理员不限，普通管理员只能重置普通用户 */
   const canResetPassword = (row: MemberRow) => {
      const me = authStore.user;
      if (!me || isSelf(row)) return false;
      if (me.role === 'SUPER_ADMIN') return true;
      return me.role === 'ADMIN' && row.role === 'USER';
   };

   const changeRole = async (row: MemberRow, nextRole: unknown) => {
      // StSelect 单选点「当前项」时会 emit 空串（它是当作「取消选择」用的），
      // 角色列没有「清空」语义，这类值直接忽略；顺便挡掉其它脏值，不让它打到接口。
      if (!isRoleValue(nextRole) || nextRole === row.role) return;

      const loading = message.info('正在修改权限...', '', {
         duration: 0,
         loading: true,
      });

      try {
         await $trpc.admin.user.updateRole.mutate({
            userId: row.id,
            role: nextRole,
         });
         loading.close();
         message.success(
            '权限已更新',
            `${row.displayName} → ${ROLE_META[nextRole].text}`,
         );
         await refresh();
      } catch (error) {
         loading.close();
         logger.error(error, '修改权限失败');
         message.error('修改失败', (error as any)?.message ?? '请稍后重试');
      }
   };

   const resetPassword = async (row: MemberRow) => {
      const newPassword = await dialog.prompt({
         title: `重置「${row.displayName}」的密码`,
         description: '重置后该用户需要用新密码登录，请自行告知本人。',
         placeholder: '请输入新密码（至少 6 位）',
         inputType: 'password',
         confirmText: '重置',
         cancelText: '取消',
         validator: (value) => (value.length >= 6 ? true : '密码至少 6 位'),
      });

      if (!newPassword) return;

      const loading = message.info('正在重置...', '', {
         duration: 0,
         loading: true,
      });

      try {
         await $trpc.admin.user.resetPassword.mutate({
            userId: row.id,
            newPassword,
         });
         loading.close();
         message.success('密码已重置');
      } catch (error) {
         loading.close();
         logger.error(error, '重置密码失败');
         message.error('重置失败', (error as any)?.message ?? '请稍后重试');
      }
   };

   return {
      // 查询条件
      keywordInput,
      role,
      sortBy,
      sortOrder,
      page,
      // 派生展示
      roleLabel,
      sortFieldLabel,
      sortOrderTip,
      total,
      totalPages,
      isFiltering,
      isInitialLoading,
      isRefreshing,
      memberList,
      // 选项
      roleOptions: ROLE_OPTIONS,
      sortFieldOptions,
      // 操作
      toggleSortOrder,
      clearKeyword,
      canSwitchRole,
      canResetPassword,
      changeRole,
      resetPassword,
   };
};
