<script setup lang="ts">
import CommitRecordsPanel from './_modules/CommitRecordsPanel.vue';
import CommitDetailPanel from './_modules/CommitDetailPanel.vue';

const props = defineProps<{ id: number }>();

const splitEl = useTemplateRef('split');

// 移动端是单列自然流（列表在上、详情在下、整页滚动），
// 点击某条记录后把详情滚进可视区；PC 左右分栏无此需要
const commitRecordSelectEmitter = useEventBus<unknown, boolean>(
   'commit-record-select'
);
onMounted(() => {
   commitRecordSelectEmitter.on((_, init) => {
      if (init || window.innerWidth >= 768) return;
      nextTick(() => {
         const root = splitEl.value?.$el as HTMLElement | undefined;
         const pane = root?.querySelector(':scope > div:nth-child(3)');
         pane?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
   });
});
</script>

<template>
   <StSpace fill center>
      <StSplitPanel
         ref="split"
         direction="horizontal"
         storage-key="record.list-detail"
         :start-percent="25"
         class="record-page max-md:!flex-col max-md:!overflow-y-auto max-md:hide-scrollbar">
         <template #start>
            <CommitRecordsPanel :id="props.id" />
         </template>
         <template #end>
            <CommitDetailPanel :problem-id="props.id" />
         </template>
      </StSplitPanel>
   </StSpace>
</template>

<style lang="css">
/* 移动端：取消左右两列分栏，列表与详情按内容自然高度上下排布、整页滚动；
   桌面端保持左右分栏（比例由 StSplitPanel 拖拽持久化） */
@media (max-width: 767.98px) {
   .record-page > div:nth-child(2) {
      display: none;
   }
   .record-page > div:nth-child(1),
   .record-page > div:nth-child(3) {
      flex-basis: auto !important;
      flex-shrink: 0 !important;
   }
}
</style>
