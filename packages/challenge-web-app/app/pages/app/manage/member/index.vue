<script setup lang="ts">
import { ArrowDown, ArrowUp, CloseSmall, Key, Left, Peoples, Right, Search } from '@icon-park/vue-next';
import dayjs from 'dayjs';
import { dialog } from '~/composables/use-dialog';
import { useMessage } from '~/components/st/Message/use-message';
import type { ISelectOption } from '~/components/st/Select/type';
import type { ITableColumn } from '~/components/st/Table/type';
import useAuthStore from '~/stores/auth-store';
import { logger } from '~~/lib/logger';
import DEFAULT_AVATAR_URL from '@/assets/images/default-avatar.png';

useSeoMeta({ title: '成员管理 - Quanta Challenge' });

type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';
type RoleFilter = 'ALL' | UserRole;

const ROLE_META = {
   SUPER_ADMIN: { text: '超级管理员', color: '#fe4e4e' },
   ADMIN: { text: '管理员', color: '#fa7c0e' },
   USER: { text: '普通用户', color: '#434343' },
} as const;

const ROLE_VALUES = ['SUPER_ADMIN', 'ADMIN', 'USER'] as const;

const isRoleValue = (value: unknown): value is UserRole => {
   return ROLE_VALUES.includes(value as UserRole);
};

/** 可排序字段；升/降序由旁边的方向按钮切换，不写进选项文案里 */
const SORT_FIELDS = [
   { value: 'lastActiveAt', label: '活跃时间' },
   { value: 'createdAt', label: '注册时间' },
   { value: 'score', label: '分数' },
] as const;

type SortBy = (typeof SORT_FIELDS)[number]['value'];
type SortOrder = 'asc' | 'desc';

const ROLE_OPTIONS: { label: string; value: RoleFilter }[] = [
   { label: '全部角色', value: 'ALL' },
   ...ROLE_VALUES.map((value) => ({ label: ROLE_META[value].text, value })),
];

/** 行内角色下拉（没有「全部」） */
const ROLE_SELECT_OPTIONS: ISelectOption[] = ROLE_VALUES.map((value) => ({
   label: ROLE_META[value].text,
   value,
}));

const PAGE_SIZE = 20;

const columns: ITableColumn[] = [
   { key: 'user', title: '用户', skeletonClass: 'h-9 w-[9rem] rounded-lg' },
   {
      key: 'role',
      title: '角色',
      width: '7rem',
      align: 'center',
      skeletonClass: 'h-5 w-[3rem] rounded-md mx-auto',
   },
   { key: 'activeAt', title: '活跃时间', width: '10.5rem', align: 'center' },
   {
      key: 'recent7',
      title: '最近 7 天',
      width: '6.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'recent30',
      title: '最近 30 天',
      width: '6.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'submissionCount',
      title: '总提交',
      width: '5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'score',
      title: '分数',
      width: '5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[2.5rem] rounded-md mx-auto',
   },
   {
      key: 'correctRate',
      title: '正确率',
      width: '5.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[3rem] rounded-md mx-auto',
   },
   {
      key: 'action',
      title: '操作',
      width: '4.5rem',
      align: 'center',
      skeletonClass: 'size-5 rounded-md mx-auto',
   },
];

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
   () => ROLE_OPTIONS.find((option) => option.value === role.value)?.label ?? '全部角色'
);
const sortFieldLabel = computed(
   () => SORT_FIELDS.find((field) => field.value === sortBy.value)?.label ?? '活跃时间'
);
const sortOrderTip = computed(() =>
   sortOrder.value === 'desc'
      ? '当前降序（新→旧 / 高→低），点击切换升序'
      : '当前升序（旧→新 / 低→高），点击切换降序'
);

const toggleSortOrder = () => {
   sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc';
   page.value = 1;
};

const {
   data,
   pending,
   error,
   refresh,
} = useAsyncData('manage-members', () => {
   return $trpc.admin.user.getAllMembers.query({
      keyword: keyword.value || undefined,
      role: role.value === 'ALL' ? undefined : role.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      page: page.value,
      pageSize: PAGE_SIZE,
   });
});

// 监听错误
watch(
   error,
   (newError) => {
      if (newError) {
         logger.error(newError, '加载成员列表失败');
         message.error('成员加载失败', '请检查网络连接或稍后重试');
      }
   },
   { immediate: true }
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
   [keyword.value, role.value, sortBy.value, sortOrder.value, page.value].join('|')
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
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const isFiltering = computed(() => !!keyword.value || role.value !== 'ALL');

const formatDateTime = (value: string | Date | null) => {
   return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '';
};

const memberList = computed(() => {
   return (data.value?.members ?? []).map((member) => ({
      ...member,
      displayName: member.displayName || member.name,
      avatarUrl: member.avatarUrl ? `${appBaseUrl}${member.avatarUrl}` : DEFAULT_AVATAR_URL,
      roleMeta: ROLE_META[member.role],
      activeAt: formatDateTime(member.lastActiveAt),
      lastLogin: formatDateTime(member.lastLogin),
      lastSubmissionAt: formatDateTime(member.lastSubmissionAt),
      recent7: member.recentSubmissions.find((item) => item.days === 7)?.count ?? 0,
      recent30: member.recentSubmissions.find((item) => item.days === 30)?.count ?? 0,
   }));
});

type Member = (typeof memberList.value)[number];

const isSelf = (row: Member) => row.id === authStore.user?.id;

/** 角色下拉只给超级管理员看，且不能改自己 */
const canSwitchRole = (row: Member) => {
   return authStore.user?.role === 'SUPER_ADMIN' && !isSelf(row);
};

/** 与后端 resetPassword 的权限判断保持一致：超级管理员不限，普通管理员只能重置普通用户 */
const canResetPassword = (row: Member) => {
   const me = authStore.user;
   if (!me || isSelf(row)) return false;
   if (me.role === 'SUPER_ADMIN') return true;
   return me.role === 'ADMIN' && row.role === 'USER';
};

const changeRole = async (row: Member, nextRole: unknown) => {
   // StSelect 单选点「当前项」时会 emit 空串（它是当作「取消选择」用的），
   // 角色列没有「清空」语义，这类值直接忽略；顺便挡掉其它脏值，不让它打到接口。
   if (!isRoleValue(nextRole) || nextRole === row.role) return;

   const loading = message.info('正在修改权限...', '', {
      duration: 0,
      loading: true,
   });

   try {
      await $trpc.admin.user.updateRole.mutate({ userId: row.id, role: nextRole });
      loading.close();
      message.success('权限已更新', `${row.displayName} → ${ROLE_META[nextRole].text}`);
      await refresh();
   } catch (error) {
      loading.close();
      logger.error(error, '修改权限失败');
      message.error('修改失败', (error as any)?.message ?? '请稍后重试');
   }
};

const resetPassword = async (row: Member) => {
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

   const loading = message.info('正在重置...', '', { duration: 0, loading: true });

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
</script>

<template>
   <StSpace fill justify="center">
      <StSpace direction="vertical" gap="1.5rem" class="w-[60rem] pb-[10rem] my-6">
         <StSpace align="end" gap="1rem">
            <h1 class="st-font-hero-bold text-accent-100">成员管理</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ total }} 位成员
            </span>
         </StSpace>

         <!-- 工具栏 -->
         <StSpace fill-x justify="between" align="center" gap="1rem">
            <StSpace align="center" gap="0.75rem">
               <div
                  class="flex items-center gap-2 bg-accent-600 rounded-xl px-4 h-[3.5rem] w-[16rem] shrink-0 transition-colors focus-within:ring-1 focus-within:ring-primary/50">
                  <Search class="text-accent-300 text-lg shrink-0" />
                  <input
                     v-model="keywordInput"
                     type="text"
                     placeholder="搜索用户名 / 昵称 / 邮箱"
                     class="flex-1 bg-transparent border-none outline-none text-white placeholder:text-accent-400 text-sm min-w-0" />
                  <button
                     v-if="keywordInput"
                     type="button"
                     aria-label="清空搜索"
                     @click="clearKeyword"
                     class="text-accent-300 hover:text-white transition-colors cursor-pointer p-0.5 rounded hover:bg-accent-500">
                     <CloseSmall class="text-lg" />
                  </button>
               </div>

               <StSelect
                  :value="role"
                  :options="ROLE_OPTIONS"
                  attach-to-body
                  placeholder="全部角色"
                  outer-class="bg-accent-600 !py-2.5 !pr-4 !pl-4 h-[3.5rem] w-[10rem] shrink-0 !rounded-xl"
                  options-container-class="!w-[10rem] overflow-hidden border-accent-500"
                  @update:value="(value: RoleFilter) => value && (role = value)">
                  <template #selected-preview>
                     <span class="text-white">{{ roleLabel }}</span>
                  </template>
                  <template #option="{ item }">
                     <div class="whitespace-nowrap">{{ item.label }}</div>
                  </template>
               </StSelect>

               <StSelect
                  :value="sortBy"
                  :options="sortFieldOptions"
                  attach-to-body
                  placeholder="排序字段"
                  outer-class="bg-accent-600 !py-2.5 !pr-4 !pl-4 h-[3.5rem] w-[9.5rem] shrink-0 !rounded-xl"
                  options-container-class="!w-[9.5rem] overflow-hidden border-accent-500"
                  @update:value="(value: SortBy) => value && (sortBy = value)">
                  <template #selected-preview>
                     <span class="text-white">{{ sortFieldLabel }}</span>
                  </template>
               </StSelect>

               <button
                  type="button"
                  :title="sortOrderTip"
                  :aria-label="sortOrderTip"
                  class="flex items-center justify-center size-[3.5rem] shrink-0 bg-accent-600 rounded-xl text-accent-300 hover:bg-accent-500 hover:text-white transition-colors cursor-pointer active:scale-95"
                  @click="toggleSortOrder">
                  <ArrowDown v-if="sortOrder === 'desc'" class="text-xl" />
                  <ArrowUp v-else class="text-xl" />
               </button>
            </StSpace>

            <span v-if="isRefreshing" class="st-font-caption text-accent-300 shrink-0">
               加载中…
            </span>
         </StSpace>

         <StTable
            :columns="columns"
            :rows="memberList"
            :loading="isInitialLoading"
            row-key="id"
            :skeleton-count="PAGE_SIZE">
            <template #cell-user="{ row }">
               <div class="flex items-center gap-3">
                  <StImage
                     lazy
                     :src="row.avatarUrl"
                     :alt="`${row.displayName} 头像`"
                     width="2.25rem"
                     height="2.25rem"
                     object="cover"
                     class="rounded-lg shrink-0" />
                  <div class="flex flex-col overflow-hidden">
                     <span class="st-font-body-bold text-white truncate">
                        {{ row.displayName }}
                     </span>
                     <span class="st-font-tooltip text-accent-300 truncate">
                        @{{ row.name }}
                     </span>
                  </div>
               </div>
            </template>

            <template #cell-role="{ row }">
               <StSelect
                  v-if="canSwitchRole(row)"
                  :value="row.role"
                  :options="ROLE_SELECT_OPTIONS"
                  attach-to-body
                  placeholder="角色"
                  outer-class="bg-accent-500 !py-1 !px-1.5 !gap-0.5 !rounded-[0.375rem] h-[1.75rem] w-[6rem] mx-auto text-[0.75rem] [&_svg]:size-[0.875rem]"
                  options-container-class="!w-[8.5rem] overflow-hidden border-accent-500"
                  @update:value="(value: unknown) => changeRole(row, value)">
                  <template #selected-preview>
                     <span class="block text-white truncate">
                        {{ row.roleMeta.text }}
                     </span>
                  </template>
                  <template #option="{ item }">
                     <div class="whitespace-nowrap">{{ item.label }}</div>
                  </template>
               </StSelect>
               <StTag
                  v-else
                  class="mx-auto"
                  :content="row.roleMeta.text"
                  :color="row.roleMeta.color"
                  size="small" />
            </template>

            <template #cell-activeAt="{ row }">
               <span
                  v-if="row.activeAt"
                  class="text-accent-300 font-family-manrope"
                  :title="`最近登录：${row.lastLogin}`">
                  {{ row.activeAt }}
               </span>
               <span v-else class="text-accent-400" title="从未活跃">--</span>
            </template>

            <template #cell-recent7="{ row }">
               <span class="text-white font-family-manrope">{{ row.recent7 }}</span>
            </template>

            <template #cell-recent30="{ row }">
               <span class="text-white font-family-manrope">{{ row.recent30 }}</span>
            </template>

            <template #cell-submissionCount="{ row }">
               <span
                  class="text-white font-family-manrope"
                  :title="
                     row.lastSubmissionAt
                        ? `最近提交：${row.lastSubmissionAt}`
                        : '还没有提交过'
                  ">
                  {{ row.submissionCount }}
               </span>
            </template>

            <template #cell-score="{ row }">
               <span class="text-white font-family-manrope font-bold">
                  {{ row.score ?? '--' }}
               </span>
            </template>

            <template #cell-correctRate="{ row }">
               <span class="text-accent-200 font-family-manrope">
                  {{ row.correctRate === null ? '--' : `${row.correctRate.toFixed(1)}%` }}
               </span>
            </template>

            <template #cell-action="{ row }">
               <button
                  v-if="canResetPassword(row)"
                  type="button"
                  title="重置密码"
                  aria-label="重置密码"
                  class="mx-auto flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-secondary active:scale-95 transition-all cursor-pointer"
                  @click="resetPassword(row)">
                  <Key class="text-[1.25rem]" />
               </button>
               <span v-else class="text-accent-400">--</span>
            </template>

            <template #empty>
               <StSpace
                  fill
                  direction="vertical"
                  gap="0.75rem"
                  align="center"
                  justify="center"
                  class="text-accent-400 my-[20vh]">
                  <Peoples size="2.625rem" />
                  <div class="st-font-body-normal">
                     {{ isFiltering ? '没有匹配的成员' : '暂无成员' }}
                  </div>
               </StSpace>
            </template>
         </StTable>

         <!-- 分页 -->
         <StSpace v-if="total > 0" fill-x justify="between" align="center">
            <span class="st-font-caption text-accent-300 font-family-manrope">
               第 {{ page }} / {{ totalPages }} 页
            </span>
            <StSpace gap="0.5rem">
               <button
                  type="button"
                  :disabled="page <= 1"
                  class="flex items-center gap-1 px-4 py-2 bg-accent-600 border border-accent-500 rounded-[0.5rem] text-accent-300 st-font-caption hover:bg-accent-500 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent-600 disabled:active:scale-100 cursor-pointer"
                  @click="page -= 1">
                  <Left size="1.25rem" class="shrink-0" />
                  <span>上一页</span>
               </button>
               <button
                  type="button"
                  :disabled="page >= totalPages"
                  class="flex items-center gap-1 px-4 py-2 bg-accent-600 border border-accent-500 rounded-[0.5rem] text-accent-300 st-font-caption hover:bg-accent-500 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-accent-600 disabled:active:scale-100 cursor-pointer"
                  @click="page += 1">
                  <span>下一页</span>
                  <Right size="1.25rem" class="shrink-0" />
               </button>
            </StSpace>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
