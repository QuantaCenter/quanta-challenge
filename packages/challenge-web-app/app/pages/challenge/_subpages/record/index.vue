<script setup lang="ts">
import CommitRecordsPanel from './_modules/CommitRecordsPanel.vue';
import CommitDetailPanel from './_modules/CommitDetailPanel.vue';

const props = defineProps<{ id: number }>();
</script>

<template>
   <StSpace fill center>
      <StSplitPanel
         direction="horizontal"
         storage-key="record.list-detail"
         :start-percent="25">
         <template #start>
            <CommitRecordsPanel :id="props.id" />
         </template>
         <template #end>
            <CommitDetailPanel :problem-id="props.id" />
         </template>
      </StSplitPanel>
   </StSpace>
</template>
