<script setup lang="ts"></script>

<template>
   <StSpace direction="vertical" fill-x class="p-[0.875rem]">
      <StSpace v-for="j in 3" :key="j" direction="vertical" gap="0.75rem" fill>
         <StSkeletonItem
            class="w-[6.25rem] h-[1.25rem] rounded-md bg-accent-600" />
         <StSkeletonItem
            v-for="i in 2"
            :key="i"
            class="px-4 py-[0.875rem] rounded-lg bg-accent-600 flex gap-4 w-full">
            <StSkeletonItem class="size-16 rounded-md bg-accent-500 shrink-0" />
            <StSpace direction="vertical" gap="0.5rem" fill>
               <StSpace justify="between" fill-x class="pt-[0.375rem]">
                  <StSkeletonItem
                     class="h-5 w-[6.25rem] rounded-md bg-accent-500" />
                  <StSkeletonItem
                     class="h-5 w-[5rem] rounded-md bg-accent-500" />
               </StSpace>
               <StSkeletonItem
                  class="h-5 w-[15rem] max-md:w-[10rem] rounded-md bg-accent-500" />
            </StSpace>
         </StSkeletonItem>
      </StSpace>
   </StSpace>
</template>
