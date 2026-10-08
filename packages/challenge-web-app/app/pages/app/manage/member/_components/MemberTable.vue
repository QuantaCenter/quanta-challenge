<script setup lang="ts">
import { Key, Peoples } from '@icon-park/vue-next';
import type { ITableColumn } from '~/components/st/Table/type';
import { ROLE_SELECT_OPTIONS } from '../_utils/roles';
import type { MemberRow } from '../_composables/use-member-management';

const props = defineProps<{
   members: MemberRow[];
   loading: boolean;
   isFiltering: boolean;
   skeletonCount: number;
   canSwitchRole: (row: MemberRow) => boolean;
   canResetPassword: (row: MemberRow) => boolean;
}>();

const emits = defineEmits<{
   changeRole: [row: MemberRow, value: unknown];
   resetPassword: [row: MemberRow];
}>();

const columns: ITableColumn[] = [
   { key: 'user', title: '用户', skeletonClass: 'h-9 w-[9rem] rounded-lg' },
   {
      key: 'role',
      title: '角色',
      width: '7rem',
      align: 'center',
      skeletonClass: 'h-5 w-[3rem] rounded-md mx-auto',
   },
   {
      key: 'activeAt',
      title: '活跃时间',
      width: '10.5rem',
      align: 'center',
      skeletonClass: 'h-5 w-[7rem] rounded-md mx-auto',
   },
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
</script>

<template>
   <StTable
      :columns="columns"
      :rows="members"
      :loading="loading"
      row-key="id"
      :skeleton-count="skeletonCount">
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
               <span class="st-font-caption text-accent-300 truncate">
                  @{{ row.name }}
               </span>
            </div>
         </div>
      </template>

      <template #cell-role="{ row }">
         <StSelect
            v-if="props.canSwitchRole(row)"
            :value="row.role"
            :options="ROLE_SELECT_OPTIONS"
            attach-to-body
            placeholder="角色"
            outer-class="bg-accent-500 !py-1 !px-1.5 !gap-0.5 !rounded-[0.375rem] h-[1.75rem] w-[6rem] mx-auto text-[0.75rem] [&_svg]:size-[0.875rem]"
            options-container-class="!w-[8.5rem] overflow-hidden border-accent-500"
            @update:value="(value: unknown) => emits('changeRole', row, value)">
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
            v-if="props.canResetPassword(row)"
            type="button"
            title="重置密码"
            aria-label="重置密码"
            class="mx-auto flex items-center justify-center size-8 rounded-md text-accent-300 hover:bg-accent-500 hover:text-secondary active:scale-95 transition-all cursor-pointer"
            @click="emits('resetPassword', row)">
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
</template>
