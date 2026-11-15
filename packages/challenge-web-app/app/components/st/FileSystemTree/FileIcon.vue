<script setup lang="ts">
import { FileCode } from '@icon-park/vue-next';
import { getFileIconPath } from './config';

const props = defineProps<{ name: string }>();
const icon = computed(() => getFileIconPath(props.name));
</script>

<template>
   <img v-if="icon" :src="icon" :alt="name" class="size-4 shrink-0" />
   <FileCode v-else theme="filled" size="1rem" class="size-4 shrink-0" />
</template>
