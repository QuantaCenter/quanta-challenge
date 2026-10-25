<template>
   <StSpace
      class="w-full max-w-[38rem] min-h-full absolute top-0 left-0 max-md:px-4 max-md:pt-10"
      gap="0.75rem"
      direction="vertical">
      <StSpace
         fill-x
         class="py-4 px-5 rounded-[0.375rem] max-md:px-0 max-md:py-0"
         direction="vertical"
         gap="1.5rem">
         <StSpace fill-x gap="0.5rem" align="center" class="mb-2">
            <StSkeletonItem
               :deep="1"
               class="w-[4rem] max-md:w-[3rem] h-[1.25rem] rounded-[0.25rem]" />
            <StSkeletonItem
               :deep="1"
               class="w-[8.375rem] max-md:w-[7rem] h-[1.25rem] rounded-[0.25rem]" />
         </StSpace>
         <StSpace fill-x align="center" gap="0.75rem" class="mt-1">
            <StSkeletonItem :deep="1" class="size-8 rounded-full shrink-0" />
            <StSkeletonItem
               :deep="1"
               class="w-full h-[1.25rem] rounded-[0.25rem]" />
         </StSpace>
         <StSpace fill-x gap="1.5rem" class="max-md:gap-2 max-md:flex-wrap!">
            <StSpace v-for="i in 4" :key="i" direction="vertical" gap="0.5rem">
               <StSkeletonItem
                  :deep="1"
                  class="w-[6.375rem] max-md:w-[4.5rem] h-[1.5rem] rounded-[0.25rem]" />
               <StSkeletonItem
                  :deep="1"
                  class="w-[3.375rem] max-md:w-[2.5rem] h-[1.5rem] rounded-[0.25rem]" />
            </StSpace>
         </StSpace>
         <StSkeletonItem
            :deep="1"
            class="w-full h-[0.0625rem] rounded-[0.25rem]" />
         <StSpace fill-x gap="0.75rem" direction="vertical">
            <StSkeletonItem
               :deep="1"
               class="w-[17rem] max-md:w-[10rem] h-[1.25rem] rounded-[0.25rem]" />
            <StSkeletonItem
               :deep="1"
               class="w-full h-[12rem] rounded-[0.25rem]" />
         </StSpace>
         <StSkeletonItem
            :deep="1"
            class="w-full h-[0.0625rem] rounded-[0.25rem]" />
         <StSpace fill-x direction="vertical" gap="1rem">
            <StSkeletonItem
               :deep="1"
               class="w-[5.25rem] max-md:w-[4.5rem] h-[1.25rem] rounded-[0.25rem]" />
            <StSpace
               fill-x
               class="px-4 max-md:px-0"
               gap="0.75rem"
               direction="vertical">
               <StSkeletonItem
                  :deep="1"
                  class="w-[22.4rem] max-md:w-full h-[1.25rem] rounded-[0.25rem]" />
               <StSkeletonItem
                  :deep="1"
                  class="w-[11rem] max-md:w-full h-[5.68rem] rounded-[0.25rem]" />
               <StSkeletonItem
                  :deep="1"
                  class="w-[18.1875rem] max-md:w-[14rem] h-[1.25rem] rounded-[0.25rem]" />
               <StSkeletonItem
                  :deep="1"
                  class="w-[25.25rem] max-md:w-full h-[1.25rem] rounded-[0.25rem]" />
               <StSkeletonItem
                  :deep="1"
                  class="w-[11rem] max-md:w-full h-[5.68rem] rounded-[0.25rem]" />
               <StSkeletonItem
                  :deep="1"
                  class="w-[25.25rem] max-md:w-full h-[1.25rem] rounded-[0.25rem]" />
            </StSpace>
         </StSpace>
      </StSpace>
   </StSpace>
</template>
