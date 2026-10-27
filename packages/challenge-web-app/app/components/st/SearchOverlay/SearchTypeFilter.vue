<script setup lang="ts">
import {
   CalendarThirtyTwo,
   Close,
   ListView,
   TagOne,
   User,
   WebPage,
   Plus,
   GoldMedalTwo,
   VolumeNotice,
   History,
   Help,
   Code,
} from '@icon-park/vue-next';
import type { DefineComponent } from 'vue';
import type { SearchType } from '~/types/search';
import useAuthStore from '~/stores/auth-store';
import {
   SEARCH_TYPE_CONFIGS,
   ADMIN_ONLY_SEARCH_TYPES,
   getSortedSearchTypes,
} from '@challenge/shared/config';

interface SearchTypeOption {
   value: SearchType;
   label: string;
   icon?: DefineComponent;
}

const props = defineProps<{
   modelValue: SearchType[];
}>();

const emit = defineEmits<{
   'update:modelValue': [value: SearchType[]];
}>();

// 图标映射
const ICON_MAP = {
   ListView,
   CalendarThirtyTwo,
   User,
   TagOne,
   WebPage,
   GoldMedalTwo,
   VolumeNotice,
   History,
   Help,
   Code,
} as const;

const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role !== 'USER');

// 所有可选的搜索类型 - 从统一配置生成（管理类类型仅对管理员展示）
const searchTypeOptions: SearchTypeOption[] = getSortedSearchTypes()
   .filter(
      (type: SearchType) =>
         isAdmin.value || !ADMIN_ONLY_SEARCH_TYPES.includes(type)
   )
   .map((type: SearchType) => {
      const config =
         SEARCH_TYPE_CONFIGS[type as keyof typeof SEARCH_TYPE_CONFIGS];
      return {
         value: config.value,
         label: config.label,
         icon: ICON_MAP[config.icon as keyof typeof ICON_MAP],
      };
   });

// 下拉菜单状态
const isDropdownOpen = ref(false);

// Popper 设置
const { popperInstance, containerKey, popperKey, popper, container } =
   usePopper({
      containerKey: 'filter-button',
      popperKey: 'filter-dropdown',
      fillWidth: false,
      options: {
         placement: 'bottom-start',
         modifiers: [
            { name: 'offset', options: { offset: [0, 8] } },
            { name: 'preventOverflow', options: { padding: 8 } },
         ],
      },
   });

// 获取当前选中的标签
const selectedTags = computed(() => {
   return props.modelValue
      .map((value) => searchTypeOptions.find((opt) => opt.value === value))
      .filter(Boolean) as SearchTypeOption[];
});

// 删除标签
const removeTag = (value: SearchType) => {
   emit(
      'update:modelValue',
      props.modelValue.filter((v) => v !== value)
   );
   setTimeout(() => {
      nextTick(() => {
         popperInstance.value?.update();
      });
   }, 50);
};

// 添加标签
const addTag = (value: SearchType) => {
   if (!props.modelValue.includes(value)) {
      emit('update:modelValue', [...props.modelValue, value]);
   }
   isDropdownOpen.value = false;
};

// 切换标签（用于下拉菜单中的复选框）
const toggleTag = (value: SearchType) => {
   if (props.modelValue.includes(value)) {
      removeTag(value);
      setTimeout(() => {
         nextTick(() => {
            popperInstance.value?.update();
         });
      }, 50);
   } else {
      addTag(value);
      isDropdownOpen.value = true;
      nextTick(() => {
         popperInstance.value?.update();
      });
   }
};

// 监听 isDropdownOpen 变化，更新 popper 位置
watch(isDropdownOpen, (newVal) => {
   if (newVal && popperInstance.value) {
      nextTick(() => {
         popperInstance.value?.update();
      });
   }
});

// 点击外部关闭下拉菜单
onClickOutside(
   popper,
   () => {
      isDropdownOpen.value = false;
   },
   { ignore: [container] }
);
const teleported = useClientTeleport();
</script>

<template>
   <div class="p-4 border-accent-500 flex flex-col w-full gap-2">
      <div class="st-font-caption text-accent-200">搜索筛选</div>
      <StSpace gap="0.5rem" align="center" wrap>
         <!-- 已选择的标签 -->
         <TransitionGroup name="tag">
            <div
               v-for="tag in selectedTags"
               :key="tag.value"
               class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/20 hover:bg-primary/30 rounded-md text-xs text-white transition-colors border border-primary/30">
               <span v-if="tag.icon">
                  <component :is="tag.icon" size="1rem" />
               </span>
               <span>{{ tag.label }}</span>
               <button
                  class="ml-0.5 text-white/70 hover:text-white transition-colors cursor-pointer"
                  @click.stop="removeTag(tag.value)">
                  <Close class="text-xs" />
               </button>
            </div>
         </TransitionGroup>

         <!-- 添加标签按钮 -->
         <button
            :ref="containerKey"
            class="inline-flex items-center gap-1.5 px-2.5 py-[0.3rem] bg-accent-600 hover:bg-accent-500 rounded-md text-xs text-white transition-colors border border-accent-500 cursor-pointer"
            @click="isDropdownOpen = !isDropdownOpen">
            <Plus size="1rem" />
            <span>添加筛选</span>
         </button>
      </StSpace>
   </div>

   <!-- 下拉菜单 (绑定到 body) -->
   <Teleport to="body" :disabled="!teleported">
      <Transition name="dropdown">
         <div
            :ref="popperKey"
            class="min-w-[10rem] bg-accent-700 rounded-lg border border-accent-500 shadow-xl z-[10002] overflow-hidden absolute transition-all"
            :class="{
               'opacity-0 pointer-events-none -translate-y-2': !isDropdownOpen,
            }">
            <div class="py-1">
               <button
                  v-for="tag in searchTypeOptions"
                  :key="tag.value"
                  class="w-full px-4 py-2 text-left text-sm text-white hover:bg-accent-600 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                  :class="{
                     'bg-accent-600': modelValue.includes(tag.value),
                  }"
                  @click="toggleTag(tag.value)">
                  <StSpace gap="0.5rem" align="center">
                     <span v-if="tag.icon" class="text-base">
                        <component :is="tag.icon" size="1rem" />
                     </span>
                     <span>{{ tag.label }}</span>
                  </StSpace>
                  <div
                     class="size-4 rounded border transition-all"
                     :class="
                        modelValue.includes(tag.value)
                           ? 'bg-primary border-primary'
                           : 'border-accent-400'
                     ">
                     <svg
                        v-if="modelValue.includes(tag.value)"
                        class="size-full text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="3">
                        <path
                           stroke-linecap="round"
                           stroke-linejoin="round"
                           d="M5 13l4 4L19 7" />
                     </svg>
                  </div>
               </button>
            </div>
         </div>
      </Transition>
   </Teleport>
</template>

<style scoped>
/* 标签过渡动画 - 只在添加时有动画，删除时即时完成 */
.tag-enter-active {
   transition: all 0.2s ease;
}

.tag-leave-active {
   transition: none;
}

.tag-enter-from {
   opacity: 0;
   transform: scale(0.8);
}

.tag-leave-to {
   opacity: 0;
}

.tag-move {
   transition: all 0.2s ease;
}

/* 下拉菜单过渡动画 */
.dropdown-enter-active,
.dropdown-leave-active {
   transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
   opacity: 0;
   transform: translateY(-0.5rem);
}
</style>
