<script setup lang="ts">
import { Close, LoadingFour, Search } from '@icon-park/vue-next';
import { onClickOutside, useDebounceFn } from '@vueuse/core';
import type { FormItemStatus } from '../Form/type';

interface IUserPickerUser {
   id: string;
   name: string;
   displayName: string | null;
   avatarUrl: string | null;
}

const props = withDefaults(
   defineProps<{
      placeholder?: string;
      outerClass?: any;
      status?: FormItemStatus;
      disabled?: boolean;
      /** 单选模式 */
      multiple?: boolean;
      max?: number;
      limit?: number;
   }>(),
   { multiple: true, limit: 8 },
);

/** 选中用户的用户名（user.name） */
const value = defineModel<string[]>('value', { default: () => [] });

const borderClass = computed(() =>
   props.status === 'error'
      ? '!border !border-error'
      : props.status === 'success'
        ? '!border !border-success'
        : '',
);

const { $trpc } = useNuxtApp();

const keyword = ref('');
const results = ref<IUserPickerUser[]>([]);
const loading = ref(false);
const opened = ref(false);
const activeIndex = ref(0);

/** 已选用户展示信息 */
const selectedInfo = reactive(new Map<string, IUserPickerUser>());
const selectedUsers = computed(() =>
   value.value.map(
      (name) =>
         selectedInfo.get(name) ?? {
            id: name,
            name,
            displayName: null,
            avatarUrl: null,
         },
   ),
);

const reachedMax = computed(
   () => props.max !== undefined && value.value.length >= props.max,
);

const visibleResults = computed(() =>
   results.value.filter((user) => !value.value.includes(user.name)),
);

let requestSeq = 0;
const search = useDebounceFn(async (q: string) => {
   const seq = ++requestSeq;
   try {
      const users = await $trpc.protected.user.search.query({
         keyword: q,
         limit: props.limit,
      });
      if (seq !== requestSeq) return;
      results.value = users;
      activeIndex.value = 0;
   } catch {
      if (seq === requestSeq) results.value = [];
   } finally {
      if (seq === requestSeq) loading.value = false;
   }
}, 250);

watch(keyword, (q) => {
   const trimmed = q.trim();
   if (!trimmed) {
      requestSeq++;
      results.value = [];
      loading.value = false;
      return;
   }
   loading.value = true;
   opened.value = true;
   search(trimmed);
});

const inputRef = useTemplateRef<HTMLInputElement>('input');
const rootRef = useTemplateRef<HTMLElement>('root');
onClickOutside(rootRef, () => {
   opened.value = false;
});

const pick = (user: IUserPickerUser) => {
   selectedInfo.set(user.name, user);
   value.value = props.multiple ? [...value.value, user.name] : [user.name];
   keyword.value = '';
   if (!props.multiple) opened.value = false;
   inputRef.value?.focus();
};

const remove = (name: string) => {
   value.value = value.value.filter((item) => item !== name);
};

const handleKeydown = (e: KeyboardEvent) => {
   const list = visibleResults.value;
   switch (e.key) {
      case 'ArrowDown':
         e.preventDefault();
         opened.value = true;
         if (list.length) activeIndex.value = (activeIndex.value + 1) % list.length;
         break;
      case 'ArrowUp':
         e.preventDefault();
         if (list.length)
            activeIndex.value = (activeIndex.value - 1 + list.length) % list.length;
         break;
      case 'Enter': {
         e.preventDefault();
         const user = list[activeIndex.value];
         if (opened.value && user && !reachedMax.value) pick(user);
         break;
      }
      case 'Backspace':
         if (!keyword.value && value.value.length) {
            remove(value.value[value.value.length - 1]!);
         }
         break;
      case 'Escape':
         opened.value = false;
         break;
   }
};

watch(visibleResults, (list) => {
   if (activeIndex.value >= list.length) activeIndex.value = 0;
});

const showDropdown = computed(
   () => opened.value && !!keyword.value.trim() && !props.disabled,
);
</script>

<template>
   <div ref="root" class="relative w-full">
      <div
         class="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-4 px-4 rounded-lg text-accent-300 caret-primary transition-colors cursor-text"
         :class="[outerClass, borderClass, { 'opacity-60 !cursor-not-allowed': disabled }]"
         @click="inputRef?.focus()">
         <span
            v-for="user in selectedUsers"
            :key="user.name"
            class="flex items-center gap-1.5 h-6 pl-1 pr-1 rounded-md bg-accent-600 border border-accent-500 text-accent-100 st-font-caption leading-none">
            <StAvatar
               v-if="selectedInfo.has(user.name)"
               :url="user.avatarUrl ?? undefined"
               size="1rem" />
            <span class="max-w-[10rem] truncate">
               {{ user.displayName || user.name }}
            </span>
            <span
               v-if="user.displayName && user.displayName !== user.name"
               class="text-accent-400">
               @{{ user.name }}
            </span>
            <button
               type="button"
               :aria-label="`移除 ${user.name}`"
               :disabled="disabled"
               class="flex items-center justify-center size-4 rounded hover:bg-accent-500 hover:text-error transition-colors cursor-pointer"
               @click.stop="remove(user.name)">
               <Close size="0.75rem" />
            </button>
         </span>
         <div class="flex flex-1 min-w-[8rem] h-6 items-center gap-2">
            <Search v-if="!selectedUsers.length" class="text-accent-400" />
            <input
               ref="input"
               v-model="keyword"
               type="text"
               autocomplete="off"
               :disabled="disabled || reachedMax"
               :placeholder="
                  reachedMax
                     ? `最多选择 ${max} 位用户`
                     : selectedUsers.length
                       ? ''
                       : placeholder ?? '输入用户名或昵称搜索'
               "
               class="flex-1 min-w-0 h-6 bg-transparent border-none outline-none text-white placeholder:text-accent-300"
               @focus="opened = true"
               @keydown="handleKeydown" />
            <LoadingFour v-if="loading" class="animate-spin text-primary" />
         </div>
      </div>

      <Transition name="user-picker-fade">
         <ul
            v-if="showDropdown"
            role="listbox"
            class="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-[18rem] overflow-y-auto p-1 rounded-lg border border-accent-500 bg-accent-600 shadow-2xl">
            <li
               v-if="loading && !visibleResults.length"
               class="px-3 py-4 text-center st-font-caption text-accent-400">
               搜索中…
            </li>
            <li
               v-else-if="!visibleResults.length"
               class="px-3 py-4 text-center st-font-caption text-accent-400">
               {{ results.length ? '匹配的用户都已选择' : '未找到相关用户' }}
            </li>
            <li
               v-for="(user, index) in visibleResults"
               :key="user.id"
               role="option"
               :aria-selected="index === activeIndex"
               class="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors"
               :class="index === activeIndex ? 'bg-accent-500' : 'hover:bg-accent-500/60'"
               @mouseenter="activeIndex = index"
               @mousedown.prevent="pick(user)">
               <StAvatar :url="user.avatarUrl ?? undefined" size="1.75rem" />
               <div class="min-w-0 flex-1">
                  <div class="st-font-body-normal text-white truncate">
                     {{ user.displayName || user.name }}
                  </div>
                  <div class="st-font-caption text-accent-400 truncate">
                     @{{ user.name }}
                  </div>
               </div>
            </li>
         </ul>
      </Transition>
   </div>
</template>

<style scoped>
.user-picker-fade-enter-active,
.user-picker-fade-leave-active {
   transition:
      opacity 0.15s ease,
      transform 0.15s ease;
}

.user-picker-fade-enter-from,
.user-picker-fade-leave-to {
   opacity: 0;
   transform: translateY(-0.25rem);
}
</style>
