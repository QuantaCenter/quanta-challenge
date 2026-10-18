<script setup lang="ts">
import MemberToolbar from './_components/MemberToolbar.vue';
import MemberTable from './_components/MemberTable.vue';
import MemberPagination from './_components/MemberPagination.vue';
import {
   MEMBER_PAGE_SIZE,
   useMemberManagement,
} from './_composables/use-member-management';

useSeoMeta({ title: '成员管理 - Quanta Challenge' });

const {
   keywordInput,
   role,
   sortBy,
   sortOrder,
   page,
   roleLabel,
   sortFieldLabel,
   sortOrderTip,
   total,
   totalPages,
   isFiltering,
   isInitialLoading,
   isRefreshing,
   memberList,
   roleOptions,
   sortFieldOptions,
   toggleSortOrder,
   clearKeyword,
   canSwitchRole,
   canResetPassword,
   changeRole,
   resetPassword,
} = useMemberManagement();
</script>

<template>
   <StSpace fill justify="center">
      <StSpace
         direction="vertical"
         gap="1.5rem"
         class="w-full md:w-[60rem] px-4 md:px-0 pb-[10rem] my-6">
         <StSpace align="end" gap="1rem">
            <h1 class="st-font-hero-bold text-accent-100">成员管理</h1>
            <span
               class="st-font-caption text-accent-300 bg-accent-600 px-3 py-1 my-2 rounded-full">
               共 {{ total }} 位成员
            </span>
         </StSpace>

         <div class="w-full overflow-x-auto hide-scrollbar">
            <div class="min-w-fit">
               <MemberToolbar
                  v-model:keyword-input="keywordInput"
                  v-model:role="role"
                  v-model:sort-by="sortBy"
                  :sort-order="sortOrder"
                  :role-label="roleLabel"
                  :sort-field-label="sortFieldLabel"
                  :sort-order-tip="sortOrderTip"
                  :role-options="roleOptions"
                  :sort-field-options="sortFieldOptions"
                  :refreshing="isRefreshing"
                  @clear="clearKeyword"
                  @toggle-sort-order="toggleSortOrder" />
            </div>
         </div>

         <div class="w-full overflow-x-auto md:overflow-x-visible hide-scrollbar">
            <div class="min-w-[60rem] md:min-w-0">
               <MemberTable
                  :members="memberList"
                  :loading="isInitialLoading"
                  :is-filtering="isFiltering"
                  :skeleton-count="MEMBER_PAGE_SIZE"
                  :can-switch-role="canSwitchRole"
                  :can-reset-password="canResetPassword"
                  @change-role="changeRole"
                  @reset-password="resetPassword" />
            </div>
         </div>

         <MemberPagination
            v-model:page="page"
            :total="total"
            :total-pages="totalPages" />
      </StSpace>
   </StSpace>
</template>
