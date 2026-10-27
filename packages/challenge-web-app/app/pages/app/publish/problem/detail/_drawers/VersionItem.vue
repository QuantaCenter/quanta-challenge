<script setup lang="tsx">
import { CheckSmall } from '@icon-park/vue-next';
import {
   AuditFail,
   AuditPending,
   AuditSuccess,
} from '../_components/AuditStatus';
import type { VersionsType } from './VersionPreviewDrawer.vue';
import dayjs from 'dayjs';

const props = defineProps<{
   version: VersionsType['versions'][number];
   viewPid: number;
   currentPid: number;
}>();

const formattedTime = computed(() => {
   return dayjs(props.version.createdAt).format('YYYY-MM-DD HH:mm:ss');
});

const AuditStatus = () => {
   if (props.version.status === 'draft') {
      return <AuditPending />;
   } else if (props.version.status === 'invalid') {
      return <AuditFail />;
   } else {
      return <AuditSuccess iconOnlyOnMobile />;
   }
};
</script>

<template>
   <StSpace
      fill-x
      justify="between"
      align="center"
      class="px-5 py-4 rounded-lg bg-accent-600 border hover:border-secondary border-transparent transition-all cursor-pointer"
      :class="{ '!border-secondary': props.viewPid === props.version.pid }">
      <StSpace direction="vertical" gap="0.375rem" class="max-md:min-w-0">
         <StSpace gap="0.625rem" align="center" class="max-md:min-w-0">
            <StSpace
               v-if="props.currentPid === props.version.pid"
               gap="0.25rem"
               align="center"
               class="text-secondary px-2 py-1 max-md:px-1.5 rounded-sm bg-secondary/20 shrink-0">
               <CheckSmall size="0.75rem" thickness="1px" />
               <div class="st-font-tooltip max-md:hidden">当前版本</div>
            </StSpace>
            <div class="text-sm text-accent-300 max-md:truncate">
               {{ version.title }}
            </div>
         </StSpace>
         <StSpace gap="0.5rem" align="center">
            <div class="text-sm font-bold font-family-manrope leading-[100%]">
               {{ formattedTime }}
            </div>
            <div class="text-sm text-accent-300">提交审核</div>
         </StSpace>
      </StSpace>
      <AuditStatus />
   </StSpace>
</template>
