<script setup lang="ts">
import {
   Remind,
   System,
   Comment,
   Like,
   Info,
   CheckOne,
   VolumeNotice,
   Caution,
} from '@icon-park/vue-next';
import dayjs from 'dayjs';
import type { Component } from 'vue';

import type { NotificationType } from '@prisma/client';

interface NotificationProps {
   id: string;
   type: NotificationType;
   title: string;
   content: string;
   time: string;
   read: boolean;
}

const props = defineProps<NotificationProps>();

const iconMap: Record<NotificationType, Component> = {
   SYSTEM: System,
   COMMENT: Comment,
   LIKE: Like,
   JUDGE: Info,
   ACHIEVEMENT: CheckOne,
   ANNOUNCEMENT: VolumeNotice,
   WARNING: Caution,
};

/** 图标与背景色 */
const iconStyleMap: Record<NotificationType, { icon: string; bg: string }> = {
   SYSTEM: { icon: 'text-accent-100', bg: 'bg-accent-100/10' },
   COMMENT: { icon: 'text-primary', bg: 'bg-primary/15' },
   LIKE: { icon: 'text-red-500', bg: 'bg-red-500/15' },
   JUDGE: { icon: 'text-blue-500', bg: 'bg-blue-500/15' },
   ACHIEVEMENT: { icon: 'text-yellow-500', bg: 'bg-yellow-500/15' },
   ANNOUNCEMENT: { icon: 'text-violet-400', bg: 'bg-violet-400/15' },
   WARNING: { icon: 'text-error', bg: 'bg-error/15' },
};

const IconComponent = computed(() => iconMap[props.type] || Remind);
const iconStyle = computed(
   () =>
      iconStyleMap[props.type] ?? {
         icon: 'text-accent-100',
         bg: 'bg-accent-600',
      },
);
const isWarning = computed(() => props.type === 'WARNING');
</script>

<template>
   <div
      class="w-full p-4 rounded-lg border transition-colors cursor-pointer flex gap-4 items-start relative group"
      :class="
         isWarning
            ? 'border-error/60 bg-error/10 hover:bg-error/20'
            : 'border-accent-600 bg-accent-700/30 hover:bg-accent-700/50'
      ">
      <div
         class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
         :class="iconStyle.bg">
         <component
            :is="IconComponent"
            class="text-xl"
            :class="iconStyle.icon" />
      </div>
      <div class="flex-1 min-w-0">
         <div class="flex justify-between items-start">
            <h3 class="st-font-bold-body text-accent-100 mb-1">
               {{ title }}
            </h3>
            <span
               class="st-font-caption text-accent-400 whitespace-nowrap ml-2">
               {{ dayjs(time).format('YYYY-MM-DD HH:mm') }}
            </span>
         </div>
         <p class="st-font-body-normal text-accent-300 line-clamp-2">
            {{ content }}
         </p>
      </div>
      <div
         v-if="!read"
         class="absolute top-3 right-3 w-2 h-2 rounded-full"
         :class="isWarning ? 'bg-error' : 'bg-primary'"></div>
   </div>
</template>
