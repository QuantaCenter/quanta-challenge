<script setup lang="ts">
defineProps<{
   count?: number;
}>();
</script>

<template>
   <tr v-for="i in count ?? 8" :key="i" class="text-left even:bg-accent-600">
      <td class="pl-6 pr-3 py-4 rounded-l-lg">
         <StSkeletonItem
            class="size-[2.25rem] rounded-lg"
            :class="i % 2 === 1 ? 'bg-accent-600' : 'bg-accent-500'" />
      </td>
      <td class="pr-3 py-4">
         <StSkeletonItem
            class="h-5 w-[6rem] rounded-md"
            :class="i % 2 === 1 ? 'bg-accent-600' : 'bg-accent-500'" />
      </td>
      <td class="pr-3 py-4">
         <StSkeletonItem
            class="h-5 w-[12rem] rounded-md"
            :class="i % 2 === 1 ? 'bg-accent-600' : 'bg-accent-500'" />
      </td>
      <td class="pr-3 py-4">
         <StSkeletonItem
            class="h-5 w-[2.5rem] rounded-md"
            :class="i % 2 === 1 ? 'bg-accent-600' : 'bg-accent-500'" />
      </td>
      <td class="pr-3 py-4">
         <StSkeletonItem
            class="h-5 w-[5rem] rounded-md"
            :class="i % 2 === 1 ? 'bg-accent-600' : 'bg-accent-500'" />
      </td>
      <td class="pr-6 py-4">
         <StSkeletonItem
            class="size-5 mx-auto rounded-md"
            :class="i % 2 === 1 ? 'bg-accent-600' : 'bg-accent-500'" />
      </td>
   </tr>
</template>
