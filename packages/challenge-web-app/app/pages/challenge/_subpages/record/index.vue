<script setup lang="ts">
import CommitRecordsPanel from './_modules/CommitRecordsPanel.vue';
import CommitDetailPanel from './_modules/CommitDetailPanel.vue';
import type { CommitRecordType } from './_types/shared-types';

const props = defineProps<{ id: number }>();

// 移动端：只显示提交记录列表，点击列表项在底部抽屉中查看提交详情；
// 桌面端：左列表 + 右详情分栏。
// 两棵树同时渲染、按断点 CSS 显隐（不使用 v-if，保证水合安全）；
// 被隐藏一侧通过 passive 停掉轮询与请求（isMobile 仅控制行为，不控制布局）
const isMobile = useIsMobile();
const detailDrawerOpened = ref(false);
const selectedRecordId = ref<number | null>(null);

const onSelectRecord = (record: CommitRecordType) => {
   selectedRecordId.value = record.id;
   if (isMobile.value) {
      detailDrawerOpened.value = true;
   }
};

const route = useRoute();

// URL 带 ?id=<记录id> 时：双端都让详情指向该记录；移动端额外自动打开详情抽屉
let autoOpenedQueryId: number | null = null;
watch([() => route.query.id, isMobile], ([queryId, mobile]) => {
   if (!import.meta.client) return;
   const recordId = Number(queryId);
   if (!recordId || Number.isNaN(recordId)) return;
   selectedRecordId.value = recordId;
   if (!mobile) return;
   // 同一条记录只自动弹一次
   if (autoOpenedQueryId !== recordId) {
      autoOpenedQueryId = recordId;
      detailDrawerOpened.value = true;
   }
});
</script>

<template>
   <StSpace fill center>
      <StSplitPanel
         direction="horizontal"
         storage-key="record.list-detail"
         :start-percent="25"
         class="max-md:hidden">
         <template #start>
            <CommitRecordsPanel :id="props.id" :passive="isMobile" />
         </template>
         <template #end>
            <CommitDetailPanel
               :problem-id="props.id"
               :passive="isMobile"
               :initial-record-id="selectedRecordId" />
         </template>
      </StSplitPanel>

      <CommitRecordsPanel
         :id="props.id"
         :passive="!isMobile"
         class="md:hidden"
         @select="onSelectRecord" />

      <StDrawer v-model:opened="detailDrawerOpened" global width="42rem">
         <CommitDetailPanel
            :problem-id="props.id"
            :initial-record-id="selectedRecordId" />
      </StDrawer>
   </StSpace>
</template>
