<script setup lang="ts">
import { Files, PanelLeft, Search, SquareTerminal } from 'lucide-vue-next';

defineProps<{ section: 'panels' | 'search' }>();
const store = useEditorStore();
const layoutStore = useLayoutStore();
const isMobile = useIsMobile();
const search = useEventBus<'files' | 'content'>('editor-project-search');
</script>

<template>
   <StSpace direction="vertical" align="center" gap="0.5rem">
      <template v-if="section === 'panels'">
         <StMiniSidebarButton
            v-if="!isMobile"
            name="文件栏"
            :aria-label="layoutStore.filesVisible ? '隐藏文件栏' : '显示文件栏'"
            :aria-pressed="layoutStore.filesVisible"
            @click="layoutStore.filesVisible = !layoutStore.filesVisible">
            <PanelLeft :size="18" />
         </StMiniSidebarButton>
         <StMiniSidebarButton
            name="终端"
            :aria-label="store.terminalVisible ? '隐藏终端' : '显示终端'"
            :aria-pressed="store.terminalVisible"
            @click="store.terminalVisible = !store.terminalVisible">
            <SquareTerminal :size="18" />
         </StMiniSidebarButton>
      </template>
      <template v-else>
         <StMiniSidebarButton name="全局搜索" aria-label="全局搜索" @click="search.emit('content')">
            <Search :size="18" />
         </StMiniSidebarButton>
         <StMiniSidebarButton name="搜索文件" aria-label="搜索文件" @click="search.emit('files')">
            <Files :size="18" />
         </StMiniSidebarButton>
      </template>
   </StSpace>
</template>
