<script setup lang="ts">
import type { ISelectOption } from '~/components/st/Select/type';
import { RobotOne } from '@icon-park/vue-next';

const preAchievements = defineModel<number[]>('preAchievements', {
   default: () => [],
});

const props = defineProps<{
   outerClass?: string;
}>();

const achievementOptions = ref<ISelectOption[]>([]);
const acheValueToLabel = (value: string) => {
   const option = achievementOptions.value.find(
      (option) => option.value === value
   );
   return option ? option.label : value;
};

const handleRemoveTag = (tag: number) => {
   preAchievements.value = preAchievements.value.filter((t) => t !== tag);
};

export interface IAchievement {
   id: number;
   name: string;
   description: string | null;
   badgeUrl: string;
}

const { $trpc } = useNuxtApp();
const selectOpened = ref(false);
const fetchDepLoading = ref(false);
const allAchievements = ref<IAchievement[]>([]);
const fetchAchevements = async (): Promise<ISelectOption[]> => {
   const achs = await $trpc.protected.achievement.getAllAchievements.query();
   allAchievements.value = achs;
   return achs
      .map((dep) => ({
         label: dep.name,
         value: dep.id,
         description: dep.description ?? '',
         imageUrl: dep.badgeUrl,
      }))
      .toSorted((a, b) =>
         a.label.localeCompare(b.label)
      ) satisfies ISelectOption[];
};
onMounted(async () => {
   if (preAchievements.value.length > 0) {
      achievementOptions.value = await fetchAchevements();
   }
});

watch(selectOpened, async (opened) => {
   if (!opened || achievementOptions.value.length > 0) return;
   fetchDepLoading.value = true;
   achievementOptions.value = await atLeastTime(300, fetchAchevements());
   fetchDepLoading.value = false;
});

const pickedAchievements = defineModel<IAchievement[]>('pickedAchievements', {
   default: () => [],
});
watchEffect(() => {
   pickedAchievements.value = allAchievements.value.filter((ach) =>
      preAchievements.value.includes(ach.id)
   );
});
</script>

<template>
   <StSelect
      v-model:value="preAchievements"
      v-model:opened="selectOpened"
      close-on-click-outside
      attach-to-body
      placeholder="请选择前置成就"
      multiple
      :loading="fetchDepLoading"
      :outer-class="props.outerClass"
      :options="achievementOptions">
      <template #options-empty>
         <div
            class="w-fit mx-auto flex justify-center text-sm text-accent-300 h-10 items-center relative">
            <RobotOne class="text-base absolute -left-5" />
            <StSpace no-wrap no-shrink gap="0"> 还没有任何成就 </StSpace>
         </div>
      </template>
      <template #selected-preview="{ value }">
         <div class="flex gap-2 flex-wrap w-full">
            <StTag
               v-for="tag in value"
               closable
               :key="tag"
               :content="acheValueToLabel(tag)"
               color="#fa7c0e"
               @click.stop
               @close="handleRemoveTag(tag)" />
         </div>
      </template>
      <template #option="{ item }">
         <StSpace align="center" gap="1rem">
            <StImage
               lazy
               :src="(item as any).imageUrl"
               width="3rem"
               height="3rem" />
            <StSpace fill-x direction="vertical" gap="0.25rem">
               <span class="font-family-fira-code font-bold">
                  {{ item.label }}
               </span>
               <span class="st-font-caption text-accent-300">
                  {{ (item as any).description }}
               </span>
            </StSpace>
         </StSpace>
      </template>
   </StSelect>
</template>
